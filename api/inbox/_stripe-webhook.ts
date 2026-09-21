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
import { verifyStripeEvent, listRefundsForCharge, type StripeEvent, type StripeRefund } from '../_stripe.js';
import { recordPayment, type PaymentKind } from '../_payments.js';

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
  switch (event.type) {
    case 'checkout.session.completed':
    /**
     * The same handler, deliberately.
     *
     * A card authorises and captures in one step, so the money is there when
     * 'completed' fires. A delayed method is not: the session completes with
     * payment_status 'processing', handleCheckoutCompleted correctly records
     * nothing, and the money lands minutes or days later carried by THIS
     * event with payment_status 'paid'. Without this line that second event
     * is a no-op and the payment sits in Stripe forever with the booking
     * still reading unpaid.
     *
     * Nothing else has to change: the handler already gates on payment_status
     * rather than on the event type, and the ledger is keyed on the payment
     * intent, so a session that somehow delivered both events records once.
     */
    case 'checkout.session.async_payment_succeeded':
      return handleCheckoutCompleted(event);
    /**
     * The delayed payment FAILED. Nothing was ever recorded, so there is
     * nothing to reverse, but silence here means a client who thinks they
     * paid and a booking that disagrees, with nobody told. Logged loudly so
     * it is visible rather than written to the ledger, which would need a
     * 'failed' row nothing else reads yet.
     */
    case 'checkout.session.async_payment_failed': {
      const s = event.data.object as { id?: string; metadata?: { portal_id?: string } };
      console.error(
        `[inbox/stripe-webhook] delayed payment FAILED for session ${s.id} on portal ${s.metadata?.portal_id ?? 'unknown'}. The client may believe they have paid.`,
      );
      return;
    }
    case 'charge.refunded':
      return handleChargeRefunded(event);
    case 'refund.created':
      return handleRefundCreated(event);
    case 'charge.dispute.created':
      return handleDisputeOpened(event);
    case 'charge.dispute.closed':
      return handleDisputeClosed(event);
    default:
      return;
  }
}

/**
 * Which booking a Stripe payment intent belongs to.
 *
 * Money going OUT arrives without the metadata money coming IN carried: a
 * refund knows its charge, not the portal that charge paid for. The ledger is
 * the lookup table, because the original row already stored the payment intent
 * id, and migration 040 added the index this reads
 * (payment_entries_source_idx) for exactly this query.
 *
 * Null means we have never recorded the original payment, which for a refund
 * means there is nothing to reverse.
 */
async function originalForPaymentIntent(
  sql: ReturnType<typeof getDb>,
  paymentIntentId: string,
): Promise<{ portalId: string; kind: PaymentKind } | null> {
  const rows = (await sql`
    select client_portal_id, kind
    from payment_entries
    where processor_payment_id = ${paymentIntentId}
    limit 1
  `) as Array<{ client_portal_id: string; kind: PaymentKind }>;
  const row = rows[0];
  if (!row) return null;
  return { portalId: row.client_portal_id, kind: row.kind === 'tip' ? 'tip' : 'payment' };
}

/** Stripe sends ids as a string or an expanded object depending on the call. */
function idOf(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const id = (v as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

/**
 * A refund, recorded as a NEGATIVE row.
 *
 * Migration 040 chose this shape deliberately: there is no 'refunded' status,
 * because a refund is an event that happened, not a property of the original
 * payment. recomputePaidToDate sums every succeeded row, so a negative one
 * lowers paid_to_date with no special case anywhere else, and none of the
 * eight places that derive a balance needs to learn a new concept.
 *
 * KEYED ON THE REFUND ID, not the charge. charge.refunded fires once per
 * refund and carries the whole refund list each time, so iterating the list
 * and letting the partial unique index drop the ones already recorded handles
 * partial refunds, several refunds on one charge, and Stripe replaying the
 * event, without any of them being a special case.
 *
 * THE FEE IS NOT RETURNED. Stripe keeps the original processing fee on a
 * refund, so the fee row on the original payment stays exactly as it is and
 * the refund row carries no fee of its own. Recording one would claim money
 * came back that did not.
 *
 * THE REVERSAL COPIES THE ORIGINAL'S KIND. A tip never entered paid_to_date
 * (migration 043), so reversing it as a plain payment row would SUBTRACT money
 * that was never added, and the client would be told they owe the value of the
 * tip they were refunded. The negative has to be the same kind as the positive
 * it undoes, which is why the lookup reads it back rather than assuming.
 */
async function handleChargeRefunded(event: StripeEvent): Promise<void> {
  const charge = event.data.object as {
    id?: string;
    payment_intent?: unknown;
    refunds?: { data?: Array<{ id?: string; amount?: number; created?: number; reason?: string | null }>; has_more?: boolean };
  };

  const paymentIntentId = idOf(charge.payment_intent);
  if (!paymentIntentId) {
    console.error(`[inbox/stripe-webhook] charge ${charge.id} refunded with no payment_intent, cannot place it`);
    return;
  }

  const sql = getDb();
  const original = await originalForPaymentIntent(sql, paymentIntentId);
  if (!original) {
    // Not an error worth retrying: we never recorded the payment, so there is
    // nothing to reverse. Loud anyway, because it means the ledger and Stripe
    // disagree about a charge that existed.
    console.error(
      `[inbox/stripe-webhook] refund on ${paymentIntentId} has no original row in the ledger. Nothing reversed.`,
    );
    return;
  }
  const { portalId, kind: originalKind } = original;

  const refunds = charge.refunds?.data ?? [];
  if (charge.refunds?.has_more) {
    // Stripe paginates at 10. More than ten refunds on one charge is not a
    // thing that happens here, but silence would be worse than a line in a log.
    console.warn(`[inbox/stripe-webhook] charge ${charge.id} has more refunds than this event carried`);
  }

  let list = refunds;
  if (list.length === 0 && charge.id) {
    /**
     * The event arrived without its refunds, which is the NORMAL case.
     *
     * We pin no Stripe-Version, so payloads follow the account's default API
     * version, and since 2022-11-15 Charge.refunds is not expanded on the
     * Charge object. Reading the empty array and stopping is how a refund got
     * to move real money while the ledger recorded nothing and the log line
     * said everything had already been handled.
     *
     * One API call, on a path that fires a few times a year, in exchange for
     * the difference between a correct ledger and a silently wrong one.
     */
    try {
      list = await listRefundsForCharge(charge.id, event.account ?? null);
      console.log(`[inbox/stripe-webhook] charge ${charge.id} carried no refunds, fetched ${list.length} from Stripe`);
    } catch (err) {
      // Rethrown so the endpoint 500s and Stripe retries. Money has left the
      // account and we cannot say how much, which is not a case to pass over.
      console.error(`[inbox/stripe-webhook] could not list refunds for charge ${charge.id}:`, err);
      throw err;
    }
  }

  let recorded = 0;
  let seen = 0;
  for (const refund of list) {
    if (!refund.id || typeof refund.amount !== 'number' || refund.amount <= 0) continue;
    seen++;
    const result = await recordRefundRow(sql, {
      portalId, originalKind, refund, accountId: event.account ?? null,
    });
    if (result.inserted) recorded++;
  }
  if (seen === 0) {
    // NOT a console.log. charge.refunded firing for a charge with no readable
    // refund on it is a contradiction, and the old reassuring wording is
    // precisely what hid this for as long as it was hidden.
    console.error(
      `[inbox/stripe-webhook] charge ${charge.id} fired charge.refunded but carried NO readable refund, and none could be fetched. Money may have left Stripe with nothing recorded.`,
    );
  } else if (recorded === 0) {
    console.log(`[inbox/stripe-webhook] charge ${charge.id}: all ${seen} refund(s) were already recorded`);
  }
}

/**
 * refund.created, which needs no expansion at all.
 *
 * A Refund object carries payment_intent, amount and created directly, so this
 * path does not depend on which API version the account defaults to. Both
 * events are handled and both key on the refund id, so a dashboard refund that
 * fires both records exactly once.
 *
 * This event has to be SUBSCRIBED in the Stripe dashboard. Without it the
 * charge.refunded fallback above still works, at the cost of one API call.
 */
async function handleRefundCreated(event: StripeEvent): Promise<void> {
  const refund = event.data.object as StripeRefund;
  const paymentIntentId = idOf(refund.payment_intent);
  if (!refund.id || typeof refund.amount !== 'number' || refund.amount <= 0 || !paymentIntentId) {
    console.error(`[inbox/stripe-webhook] refund ${refund.id} is missing a payment_intent or amount, nothing recorded`);
    return;
  }
  const sql = getDb();
  const original = await originalForPaymentIntent(sql, paymentIntentId);
  if (!original) {
    console.error(
      `[inbox/stripe-webhook] refund ${refund.id} on ${paymentIntentId} has no original row in the ledger. Nothing reversed.`,
    );
    return;
  }
  await recordRefundRow(sql, {
    portalId: original.portalId,
    originalKind: original.kind,
    refund,
    accountId: event.account ?? null,
  });
}

/** The one place a refund becomes a negative row, shared by both events. */
async function recordRefundRow(
  sql: ReturnType<typeof getDb>,
  input: { portalId: string; originalKind: PaymentKind; refund: StripeRefund; accountId: string | null },
): Promise<{ inserted: boolean }> {
  const { portalId, originalKind, refund, accountId } = input;
  const amount = refund.amount as number;
  const result = await recordPayment(sql, {
    portalId,
    amount: -(amount / 100),
    method: originalKind === 'tip' ? 'Tip refund' : 'Card refund',
    note: refund.reason ? `Refunded by Stripe (${refund.reason})` : 'Refunded by Stripe',
    paidAt: refund.created ? new Date(refund.created * 1000).toISOString() : null,
    source: 'stripe',
    status: 'succeeded',
    kind: originalKind,
    processorPaymentId: refund.id ?? null,
    processorAccountId: accountId,
    feeAmount: null,
  });
  if (result.inserted) {
    console.log(
      `[inbox/stripe-webhook] recorded refund ${refund.id} of ${(amount / 100).toFixed(2)} for portal ${portalId}, paid_to_date now ${result.paidToDate}`,
    );
  }
  return result;
}

/**
 * A dispute opened: the money is gone NOW, so the ledger says so now.
 *
 * Stripe withdraws the disputed amount from the balance the moment a dispute
 * is created, months before it is resolved. Waiting for the outcome would
 * leave a booking reading "paid in full" while the money is not there, which
 * is the same lie a missing refund told.
 *
 * Keyed on the dispute id, so Stripe replaying the event changes nothing.
 */
async function handleDisputeOpened(event: StripeEvent): Promise<void> {
  const dispute = event.data.object as {
    id?: string;
    amount?: number;
    reason?: string | null;
    created?: number;
    payment_intent?: unknown;
    charge?: unknown;
  };
  const paymentIntentId = idOf(dispute.payment_intent);
  if (!dispute.id || typeof dispute.amount !== 'number' || !paymentIntentId) {
    console.error(
      `[inbox/stripe-webhook] dispute ${dispute.id} on charge ${idOf(dispute.charge)} is missing a payment_intent or amount, nothing recorded`,
    );
    return;
  }

  const sql = getDb();
  const original = await originalForPaymentIntent(sql, paymentIntentId);
  if (!original) {
    console.error(`[inbox/stripe-webhook] dispute ${dispute.id} has no original row in the ledger. Nothing recorded.`);
    return;
  }
  const { portalId, kind: originalKind } = original;

  const result = await recordPayment(sql, {
    portalId,
    amount: -(dispute.amount / 100),
    method: 'Chargeback',
    note: dispute.reason ? `Disputed with the bank (${dispute.reason})` : 'Disputed with the bank',
    paidAt: dispute.created ? new Date(dispute.created * 1000).toISOString() : null,
    source: 'stripe',
    status: 'succeeded',
    // Same rule as the refund: reverse a tip as a tip, or the client is told
    // they owe money because somebody disputed a gratuity.
    kind: originalKind,
    processorPaymentId: dispute.id,
    processorAccountId: event.account ?? null,
    feeAmount: null,
  });
  console.log(
    result.inserted
      ? `[inbox/stripe-webhook] recorded chargeback ${dispute.id} of ${(dispute.amount / 100).toFixed(2)} for portal ${portalId}, paid_to_date now ${result.paidToDate}`
      : `[inbox/stripe-webhook] chargeback ${dispute.id} was already recorded`,
  );
}

/**
 * A dispute closed. Only a WIN moves money, and only a win writes a row.
 *
 * lost, or withdrawn by the customer after the funds already went: the
 * negative row written when it opened is already correct, so there is nothing
 * to do and writing anything would double count. won: Stripe returns the
 * amount, so the negative is reversed with a positive keyed on a DIFFERENT id
 * (the dispute id with a suffix), because the dispute id itself is already
 * taken by the opening row and the partial unique index would silently drop
 * the reversal.
 */
async function handleDisputeClosed(event: StripeEvent): Promise<void> {
  const dispute = event.data.object as {
    id?: string;
    amount?: number;
    status?: string;
    payment_intent?: unknown;
  };
  if (dispute.status !== 'won') {
    console.log(`[inbox/stripe-webhook] dispute ${dispute.id} closed as ${dispute.status}, the opening row already reflects it`);
    return;
  }
  const paymentIntentId = idOf(dispute.payment_intent);
  if (!dispute.id || typeof dispute.amount !== 'number' || !paymentIntentId) return;

  const sql = getDb();
  const original = await originalForPaymentIntent(sql, paymentIntentId);
  if (!original) return;
  const { portalId, kind: originalKind } = original;

  const result = await recordPayment(sql, {
    portalId,
    amount: dispute.amount / 100,
    method: 'Chargeback reversed',
    note: 'Dispute won, funds returned by Stripe',
    source: 'stripe',
    status: 'succeeded',
    kind: originalKind,
    processorPaymentId: `${dispute.id}:won`,
    processorAccountId: event.account ?? null,
    feeAmount: null,
  });
  console.log(
    result.inserted
      ? `[inbox/stripe-webhook] dispute ${dispute.id} WON, returned ${(dispute.amount / 100).toFixed(2)} to portal ${portalId}, paid_to_date now ${result.paidToDate}`
      : `[inbox/stripe-webhook] dispute ${dispute.id} win was already recorded`,
  );
}

async function handleCheckoutCompleted(event: StripeEvent): Promise<void> {
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

  const asked = session.metadata?.kind;
  const kind: 'retainer' | 'balance' | 'tip' =
    asked === 'retainer' ? 'retainer' : asked === 'tip' ? 'tip' : 'balance';

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
    note:
      kind === 'retainer'
        ? 'Retainer paid by card'
        : kind === 'tip'
          ? 'Tip paid by card'
          : 'Balance paid by card',
    source: 'stripe',
    status: 'succeeded',
    // The ONE place a tip becomes a tip in the ledger. Everything downstream,
    // including the two reversal paths above, reads it back from here.
    kind: kind === 'tip' ? 'tip' : 'payment',
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
