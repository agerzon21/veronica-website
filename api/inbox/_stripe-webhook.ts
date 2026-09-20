/**
 * Stripe webhook: money arriving.
 *
 * Lives under /api/inbox because that dispatcher already declares
 * `bodyParser: false`, which Vercel only reads from a top-level function file.
 * Stripe signs the RAW request bytes, exactly as Meta and Svix do for the two
 * webhooks already here, and a parsed-then-restringified body differs by key
 * order and whitespace and can never verify. It cannot go under /api/admin:
 * that dispatcher has no such export and all of its actions read
 * req.body.password, so turning the parser off there would break the entire
 * admin API.
 *
 * Endpoint: https://vero.photography/api/inbox/stripe-webhook
 * No new serverless function. The /api/inbox/:action rewrite already exists.
 *
 * WHAT THIS MUST GET RIGHT, in order of how badly it goes wrong:
 *
 *   1. Never record one payment twice. Stripe retries anything that is not a
 *      2xx, and it emits SEVERAL events for one payment. Idempotency is keyed
 *      on the PaymentIntent, in recordPayment, and is the reason this handler
 *      can be dumb about retries.
 *   2. Never record money that did not arrive. Only a COMPLETED and PAID
 *      session counts. An expired or unpaid session is a 200 and nothing else.
 *   3. Always answer 2xx once the signature is valid, even for events this
 *      handler ignores. A 500 on an event type we do not care about makes
 *      Stripe retry it for days and eventually disable the endpoint.
 *   4. Never trust the amount in metadata. The money is whatever Stripe says
 *      was collected, not what the client's browser asked for.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import getRawBody from 'raw-body';
import { getDb } from '../_db.js';
import { verifyStripeEvent, type StripeEvent } from '../_stripe.js';
import { recordPayment } from '../_payments.js';

/** Inert here (Vercel reads it from api/inbox.ts), kept as documentation. */
export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rawBody = await readRawBody(req);
  const signature = readHeader(req, 'stripe-signature');

  const verified = verifyStripeEvent(rawBody, signature);
  if (!verified.ok) {
    // 400, deliberately, not 500. A bad signature is a client error and
    // Stripe should not retry it. Logged because a sudden run of these means
    // the signing secret was rotated in the dashboard and not in the env.
    console.warn('[inbox/stripe-webhook] rejected:', verified.reason);
    return res.status(400).json({ success: false, error: 'Invalid signature' });
  }

  const event = verified.event;

  /**
   * RECORD FIRST, ACKNOWLEDGE AFTER. This order is the whole point.
   *
   * It used to be the other way round: 200 immediately, ledger write in
   * waitUntil. The comment justifying that said the retry would finish the
   * job, and that was simply false. Stripe retries a delivery only when the
   * response is NOT 2xx, so once the 200 had gone out the event was settled
   * forever. A cold database, a connection limit, one bad minute at Neon, and
   * a real client's payment was lost with nothing but a log line: Stripe shows
   * delivered, the ledger shows nothing, and the client is asked to pay again
   * for money they already sent.
   *
   * Returning 500 hands the problem back to Stripe, which retries with backoff
   * for about three days. That is only safe because recordPayment is
   * idempotent on the PaymentIntent (a partial unique index plus ON CONFLICT
   * DO NOTHING, and a full re-sum rather than an increment), so a retry after
   * a partial failure cannot double-count. That property was already there;
   * nothing was using it.
   *
   * Fast enough to do inline: two database round trips. It is now FASTER than
   * the old path, which made a Stripe API call for the fee before writing
   * anything (see processEvent).
   *
   * Only genuine infrastructure failures throw. Every "nothing to do" case
   * below returns normally and still answers 200, because retrying an unpaid
   * session or an event type we ignore would achieve nothing and eventually
   * get the endpoint disabled.
   */
  try {
    await processEvent(event);
  } catch (err) {
    if (isPermanentFailure(err)) {
      // Retrying cannot fix this one, so a 500 would just mean three days of
      // retries and then a disabled endpoint. Loud, because it means money is
      // sitting in Stripe with no booking to credit and a person has to go
      // and attach it by hand.
      console.error(
        `[inbox/stripe-webhook] ${event.type} (${event.id}) cannot be recorded and RETRYING WILL NOT HELP. ` +
          `Money is in Stripe with nothing to credit it to. Record it by hand:`,
        err,
      );
      return res.status(200).json({ received: true, recorded: false });
    }
    console.error(
      `[inbox/stripe-webhook] ${event.type} (${event.id}) FAILED, asking Stripe to retry:`,
      err,
    );
    return res.status(500).json({ success: false, error: 'Could not record the payment' });
  }

  return res.status(200).json({ received: true });
}

/**
 * Is this a failure that retrying can never fix?
 *
 * The 500 above exists so Stripe retries a transient problem: a cold
 * database, a connection limit, one bad minute. Some failures are not
 * transient. payment_entries.client_portal_id is a foreign key, so a session
 * whose metadata names a portal that has been deleted raises 23503 on every
 * attempt, and a malformed id raises 22P02 on every attempt. Answering 500 to
 * those buys three days of retries and an endpoint Stripe eventually disables,
 * which would then drop the payments that WOULD have succeeded.
 *
 * Matched on SQLSTATE rather than message text, because the message is
 * wording and the code is a contract.
 */
function isPermanentFailure(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  return code === '23503' || code === '22P02';
}

/**
 * Exported so it can be driven directly with real Stripe-shaped payloads.
 *
 * The decisions that matter live here rather than in the HTTP wrapper: what
 * counts as money, what is ignored, and what is loudly wrong. Testing it
 * through a fake req/res would exercise the framework instead.
 */
export async function processEvent(event: StripeEvent): Promise<void> {
  // Ignored types are a no-op, NOT an error. Stripe sends whatever the
  // endpoint is subscribed to, and a dashboard change should never be able to
  // start a retry storm here.
  if (event.type !== 'checkout.session.completed') return;

  const session = event.data.object as {
    id?: string;
    payment_status?: string;
    status?: string;
    amount_total?: number;
    payment_intent?: string | { id?: string };
    metadata?: Record<string, string>;
    customer_details?: { email?: string | null };
  };

  // "Completed" and "paid" are different facts. A session can complete while
  // payment is still processing, and recording that as money in hand would
  // open the delivery gate on photos nobody has paid for.
  if (session.payment_status !== 'paid') {
    console.warn(
      `[inbox/stripe-webhook] session ${session.id} completed with payment_status=${session.payment_status}, nothing recorded`,
    );
    return;
  }

  const portalId = session.metadata?.portal_id;
  if (!portalId) {
    // Unrecoverable: without this there is no way to know whose money it is.
    // Loud, because it means a payment is sitting in Stripe unattached.
    console.error(
      `[inbox/stripe-webhook] session ${session.id} has no portal_id in metadata. Money received with no booking to credit.`,
    );
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!paymentIntentId) {
    console.error(`[inbox/stripe-webhook] session ${session.id} has no payment_intent`);
    return;
  }

  // From Stripe, never from metadata. Metadata is what the browser asked for;
  // amount_total is what was actually collected.
  const amount = typeof session.amount_total === 'number' ? session.amount_total / 100 : null;
  if (amount === null || amount <= 0) {
    console.error(`[inbox/stripe-webhook] session ${session.id} has no usable amount_total`);
    return;
  }

  const kind = session.metadata?.kind === 'retainer' ? 'retainer' : 'balance';

  /**
   * The fee is NOT read here, and is left to api/cron/_stripe-fee-backfill.ts.
   *
   * It used to be fetched first, before anything was written. That was a
   * Stripe API round trip, with no timeout, sitting in front of the only write
   * that matters, on a path Stripe expects to answer in about twenty seconds.
   *
   * And it never worked. Payments are created with capture_method
   * automatic_async, so the fee lives on a balance transaction that does not
   * exist until the charge settles, which is after this event fires. Both real
   * test payments came back null, every time. So the cost was a slower, more
   * fragile critical path in exchange for a value that is always null.
   *
   * fee_amount is bookkeeping and never affects what anyone owes, so arriving
   * within a day via the backfill is exactly as good.
   */
  const sql = getDb();
  const result = await recordPayment(sql, {
    portalId,
    amount,
    method: 'Card',
    note: kind === 'retainer' ? 'Retainer paid by card' : 'Balance paid by card',
    source: 'stripe',
    status: 'succeeded',
    processorPaymentId: paymentIntentId,
    processorAccountId: event.account ?? null,
    feeAmount: null,
  });

  console.log(
    result.inserted
      ? `[inbox/stripe-webhook] recorded $${amount} ${kind} for portal ${portalId}, paid_to_date now ${result.paidToDate}`
      : `[inbox/stripe-webhook] ${paymentIntentId} was already recorded, nothing to do`,
  );
}

/** Same helper as the two webhooks next door, and for the same reason. */
async function readRawBody(req: VercelRequest): Promise<string> {
  try {
    const buf = await getRawBody(req, { encoding: 'utf8' });
    return typeof buf === 'string' ? buf : String(buf);
  } catch {
    const b = req.body;
    if (b == null) return '';
    if (typeof b === 'string') return b;
    if (Buffer.isBuffer(b)) return b.toString('utf8');
    return JSON.stringify(b);
  }
}

function readHeader(req: VercelRequest, name: string): string | null {
  const v = req.headers[name.toLowerCase()] ?? req.headers[name];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}
