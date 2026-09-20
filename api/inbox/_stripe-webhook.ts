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
import { waitUntil } from '@vercel/functions';
import { getDb } from '../_db.js';
import { verifyStripeEvent, feeForCharge, type StripeEvent } from '../_stripe.js';
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
   * Acknowledge first, work after.
   *
   * Stripe gives about 20 seconds and treats a timeout as a failure worth
   * retrying. Reading a fee costs a second round trip, so the 200 goes out
   * first and the ledger write happens in waitUntil, which keeps the function
   * alive without holding Stripe's connection open. Same shape as the IG
   * webhook next door.
   *
   * Safe precisely because recordPayment is idempotent: if this process dies
   * mid-work, Stripe eventually retries and the retry finishes the job.
   */
  waitUntil(
    processEvent(event).catch((err) => {
      console.error(`[inbox/stripe-webhook] ${event.type} (${event.id}) failed:`, err);
    }),
  );

  return res.status(200).json({ received: true });
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
  // Best effort. A missing fee is bookkeeping and must never cost a payment.
  const fee = await feeForCharge(paymentIntentId, event.account ?? null);

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
    feeAmount: fee,
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
