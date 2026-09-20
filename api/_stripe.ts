/**
 * The only file in this project that knows Stripe exists.
 *
 * Shaped after the Resend adapter: a thin surface over the HTTP API, so the
 * rest of the codebase asks for "a checkout link" and "did this webhook really
 * come from the processor" without importing a vendor anywhere else. That
 * matters twice over. It is what lets the processor be swapped without a hunt,
 * and it is the only Stripe-shaped thing that has to survive the eventual move
 * off Vercel.
 *
 * NO SDK, deliberately. This project already verifies two webhook signatures
 * by hand (Meta's X-Hub-Signature-256 in _ig-webhook.ts and Svix in
 * _email-webhook.ts), the serverless function budget is fully spent, and the
 * Stripe REST surface used here is four endpoints. Following the house pattern
 * beats adding a dependency whose main value would be the parts not used.
 *
 * THE CONNECT SEAM. Every call takes an optional `stripeAccount`. Today it is
 * always undefined, because there is one merchant. The day other photographers
 * are paid into their own accounts it comes from a column, and nothing outside
 * this file changes. That is an afternoon now instead of a payments rewrite
 * later.
 *
 * WHAT MUST NEVER LIVE HERE: a card number, a CVV, or anything else that would
 * drag this server into PCI scope. Hosted Checkout means the client types their
 * card on Stripe's page, and this file only ever sees ids, amounts and the last
 * four digits.
 *
 * Underscore-prefixed so Vercel does not expose it as an HTTP route.
 */

import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';

const API = 'https://api.stripe.com/v1';

/**
 * Stripe's own default tolerance for how stale a webhook may be.
 *
 * The timestamp check is not ceremony: without it a signature captured once
 * stays valid forever, so anyone who ever saw one valid request could replay
 * it back at this endpoint indefinitely.
 */
const SIGNATURE_TOLERANCE_SECONDS = 300;

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is missing. Set it in Vercel project Settings, Environment Variables.',
    );
  }
  return key;
}

/** True while pointed at test keys, which is what gates the live UI. */
export function isStripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_');
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/**
 * One request to Stripe.
 *
 * Form-encoded because that is what the Stripe API takes, including for nested
 * fields, which is why the flattener below exists rather than JSON.stringify.
 */
async function stripeRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
    /** The connected account to act on behalf of. The multi-tenant seam. */
    stripeAccount?: string | null;
    /**
     * Makes a retried POST safe. Stripe returns the ORIGINAL response for a
     * repeated key rather than performing the action twice, which is what stops
     * a dropped connection from charging someone twice.
     */
    idempotencyKey?: string | null;
  } = {},
): Promise<T> {
  const { method = 'POST', body, stripeAccount, idempotencyKey } = options;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (stripeAccount) headers['Stripe-Account'] = stripeAccount;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? encodeForm(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Stripe returned unparseable body (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const err = (parsed as { error?: { message?: string; code?: string } }).error;
    // Stripe's message is written to be read by a person, so it is worth
    // surfacing rather than replacing with a generic failure.
    throw new Error(err?.message || `Stripe request failed with ${res.status}`);
  }
  return parsed as T;
}

/**
 * Flatten to Stripe's bracket notation: { a: { b: 1 } } becomes a[b]=1.
 *
 * Undefined and null are DROPPED rather than sent as the strings "undefined"
 * and "null", which is what a naive URLSearchParams pass does and which Stripe
 * then stores verbatim in metadata.
 */
function encodeForm(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [rawKey, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const key = prefix ? `${prefix}[${rawKey}]` : rawKey;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item === undefined || item === null) return;
        if (typeof item === 'object') parts.push(encodeForm(item as Record<string, unknown>, `${key}[${i}]`));
        else parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === 'object') {
      parts.push(encodeForm(value as Record<string, unknown>, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

/* ------------------------------------------------------------- checkout ---- */

export type CheckoutKind = 'retainer' | 'balance';

export type CreateCheckoutInput = {
  portalId: string;
  kind: CheckoutKind;
  /** Dollars. Converted to cents here so no caller has to remember to. */
  amount: number;
  clientEmail?: string | null;
  /** Shown on the Stripe page, so it should name the booking a person recognises. */
  description: string;
  successUrl: string;
  cancelUrl: string;
  stripeAccount?: string | null;
  /**
   * What the booking has already been paid, in dollars. Used ONLY to build the
   * idempotency key, so a later payment of the same amount cannot replay an
   * earlier completed session. Never sent to Stripe.
   */
  paidToDate?: number;
};

export type CheckoutSession = { id: string; url: string };

/**
 * A hosted Checkout session.
 *
 * Hosted rather than embedded on purpose: the client arrives on a phone from
 * an email, Stripe's page brings Apple Pay and Google Pay with no work, and no
 * card data touches vero.photography, which keeps PCI scope at SAQ-A.
 *
 * Created on CLICK, never pre-generated into an email. Sessions expire 24
 * hours after creation, so a link baked into a delivery email is dead by the
 * time most people read it.
 */
export async function createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
  const {
    portalId, kind, amount, clientEmail, description,
    successUrl, cancelUrl, stripeAccount = null, paidToDate = 0,
  } = input;
  const paidToDateCents = Math.round(paidToDate * 100);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('createCheckoutSession: amount must be a positive number of dollars');
  }
  // Rounded at the boundary. Floating point dollars reaching Stripe as
  // 89999.99999 cents is a real class of bug, and a booking is always a whole
  // number of cents.
  const unitAmount = Math.round(amount * 100);

  return stripeRequest<CheckoutSession>('/checkout/sessions', {
    body: {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: clientEmail || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            product_data: { name: description },
          },
        },
      ],
      /**
       * The only link back to a booking.
       *
       * The webhook arrives with no idea which client this was, so whatever is
       * not in metadata is unrecoverable. It is also copied onto the
       * PaymentIntent, because some events carry the intent and not the
       * session.
       */
      metadata: { portal_id: portalId, kind },
      payment_intent_data: {
        metadata: { portal_id: portalId, kind },
        description,
      },
    },
    stripeAccount,
    /**
     * Two clicks on a slow phone must not open two sessions for one payment,
     * but a SECOND payment must never replay the first.
     *
     * Stripe honours an idempotency key for 24 hours and replays the original
     * response, so a key of portal + kind + amount meant that paying $500,
     * having another $500 charge added, and paying again the same day handed
     * the client back the ALREADY COMPLETED session instead of a new one. The
     * second payment silently never happened.
     *
     * paidToDateCents is what makes the two different. It is constant across
     * a double-click, because nothing has settled yet, and it changes the
     * instant money lands, which is exactly when replaying stops being
     * correct. An attempt that was never completed keeps its key and resumes
     * the same session, which is the behaviour you want.
     */
    idempotencyKey: `checkout:${portalId}:${kind}:${unitAmount}:${paidToDateCents}`,
  });
}

/* ------------------------------------------------------------ signature ---- */

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
  account?: string;
};

/**
 * Verify that a webhook really came from Stripe, and parse it.
 *
 * The scheme, so the next reader does not have to go and look it up:
 *   Stripe-Signature: t=1700000000,v1=<hex>,v1=<hex>
 * The signed payload is `${t}.${rawBody}` and the signature is HMAC-SHA256 of
 * that under the ENDPOINT's signing secret (whsec_...), which is a different
 * value from the API key.
 *
 * Several v1 values can be present at once, which is how a secret is rotated
 * without downtime, so ANY match counts.
 *
 * MUST be given the raw body bytes. A parsed-and-restringified body differs by
 * key order and whitespace and will never verify. api/inbox.ts already sets
 * `bodyParser: false` for exactly this reason.
 */
export function verifyStripeEvent(
  rawBody: string,
  signatureHeader: string | null,
  secret = process.env.STRIPE_WEBHOOK_SECRET,
): { ok: true; event: StripeEvent } | { ok: false; reason: string } {
  /**
   * Trimmed, because a secret is COPIED AND PASTED into Vercel by hand.
   *
   * Every value parsed out of the signature header below is trimmed already;
   * the secret, which arrives the same way and is likelier to pick up a stray
   * newline, was not. A single trailing space makes every HMAC in this
   * function wrong, so every webhook fails signature verification, so every
   * card payment is silently never recorded while Stripe's dashboard shows
   * nothing but 400s. That is an expensive way to find a whitespace character.
   */
  const signingSecret = secret?.trim();
  if (!signingSecret) return { ok: false, reason: 'STRIPE_WEBHOOK_SECRET is not set' };
  if (!signatureHeader) return { ok: false, reason: 'Missing Stripe-Signature header' };

  let timestamp = '';
  const signatures: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const [k, v] = part.split('=', 2);
    if (k?.trim() === 't') timestamp = (v ?? '').trim();
    else if (k?.trim() === 'v1') signatures.push((v ?? '').trim());
  }
  if (!timestamp || signatures.length === 0) {
    return { ok: false, reason: 'Malformed Stripe-Signature header' };
  }

  // Replay window. Without this a single captured signature is valid forever.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: `Signature timestamp is ${age}s away, outside tolerance` };
  }

  const expected = createHmac('sha256', signingSecret).update(`${timestamp}.${rawBody}`).digest('hex');
  const matched = signatures.some((candidate) => safeEqualHex(candidate, expected));
  if (!matched) return { ok: false, reason: 'Signature did not match' };

  try {
    return { ok: true, event: JSON.parse(rawBody) as StripeEvent };
  } catch {
    return { ok: false, reason: 'Body verified but is not valid JSON' };
  }
}

/**
 * Constant-time hex compare.
 *
 * Node's timingSafeEqual throws when the two buffers differ in length, which
 * would turn a length mismatch into a 500 rather than a clean rejection, so
 * length is checked first. That check is not itself a leak: the length of a
 * SHA-256 hex digest is not a secret.
 */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return cryptoTimingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- reads ---- */

type BalanceTransaction = { fee?: number };
type Charge = { balance_transaction?: string | BalanceTransaction };
type PaymentIntentWithCharge = { latest_charge?: string | Charge };

/**
 * What Stripe kept on a payment, in dollars, or null when it cannot be read.
 *
 * Takes a PAYMENT INTENT id (pi_...), which is what the webhook has. The first
 * version of this took a charge id and was handed a PaymentIntent, so every
 * lookup 404d, the catch swallowed it exactly as designed, and every payment
 * recorded a null fee while looking completely healthy. The bug was invisible
 * because the fee is bookkeeping: it never blocks a payment, so nothing
 * complains.
 *
 * The fee does not live on the PaymentIntent or on the Charge. It lives on the
 * BALANCE TRANSACTION, two hops away, which is why this expands through
 * latest_charge to reach it rather than making three round trips.
 */
export async function feeForPaymentIntent(
  paymentIntentId: string,
  stripeAccount?: string | null,
): Promise<number | null> {
  try {
    const intent = await stripeRequest<PaymentIntentWithCharge>(
      `/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge.balance_transaction`,
      { method: 'GET', stripeAccount },
    );
    const charge = intent.latest_charge;
    if (!charge || typeof charge === 'string') return null;
    const bt = charge.balance_transaction;
    if (!bt || typeof bt === 'string') return null;
    // Stripe reports fees in the smallest currency unit, so cents to dollars.
    return typeof bt.fee === 'number' ? bt.fee / 100 : null;
  } catch (err) {
    // A missing fee is bookkeeping, not money. Never fail a payment over it.
    console.error('[stripe] could not read the fee for', paymentIntentId, err);
    return null;
  }
}
