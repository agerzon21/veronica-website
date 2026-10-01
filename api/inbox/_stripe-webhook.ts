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
import {
  verifyStripeEvent,
  listRefundsForCharge,
  isStripeTestMode,
  portalIdForPaymentIntent,
  type StripeEvent,
  type StripeRefund,
  type StripeCheckoutSession,
} from '../_stripe.js';
import { recordPayment, type PaymentKind } from '../_payments.js';
import { recordPaidCheckoutSession } from '../_checkout-record.js';
import { reportPaymentIssue } from '../_payment-alerts.js';

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
    // 400 rather than 500, because it is the honest answer. Stripe retries a
    // 400 like any other non-2xx, for about three days, which is what makes a
    // rotated secret recoverable: put the new one in the env and the queued
    // deliveries arrive. A sudden run of these means exactly that happened,
    // and the daily reconciliation against Stripe is what notices it.
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
      await reportPaymentIssue({
        key: `event:${event.id}`,
        summary: `A Stripe ${event.type} event could not be recorded: the booking it names no longer exists or its id is malformed.`,
        action: 'Find the payment in Stripe, decide which booking it belongs to, and log it there by hand.',
        source: 'webhook',
      });
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
/**
 * The switch below is the authority on what is handled. The list the admin
 * panel checks against lives in api/_stripe-events.ts, so that panel does not
 * have to import this module and drag raw-body and the ledger with it. The two
 * must be kept in step.
 */
export async function processEvent(event: StripeEvent): Promise<void> {
  /**
   * A test-mode event never touches the live ledger, and the reverse.
   *
   * Test-mode payment rows used to be indistinguishable from real money once
   * they were in: there is no column saying which mode a row came from. The
   * signing secrets differ per mode, so this should never fire, which is the
   * point of checking: if a test endpoint and the live one are ever wired to
   * the same secret, a test refund must not reverse a real client's payment.
   * An event that does not say (older payloads) is let through.
   */
  if (typeof event.livemode === 'boolean' && event.livemode === isStripeTestMode()) {
    console.warn(
      `[inbox/stripe-webhook] ${event.type} (${event.id}) is ${event.livemode ? 'live' : 'test'} mode, which does not match the key this site runs on. Ignored.`,
    );
    return;
  }

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
     *
     * So 'completed' falls through to here on purpose.
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
      await reportPaymentIssue({
        key: `async-failed:${s.id ?? event.id}`,
        summary: `A delayed card or bank payment FAILED after the client finished checkout (booking ${s.metadata?.portal_id ?? 'unknown'}). They may believe they have paid.`,
        action: 'Let the client know the payment did not go through and ask them to pay again.',
        source: 'webhook',
      });
      return;
    }
    case 'charge.refunded':
      return handleChargeRefunded(event);
    case 'refund.created':
      return handleRefundCreated(event);
    /**
     * A refund that changed state after it was created. The one that matters
     * is a refund that FAILED (a closed card, an expired one): Stripe puts the
     * money back in the balance, so the negative row written when it was
     * created has to be undone. Three event names reach the same object.
     */
    case 'refund.updated':
    case 'refund.failed':
    case 'charge.refund.updated':
      return handleRefundUpdated(event);
    case 'charge.dispute.created':
      return handleDisputeOpened(event);
    /**
     * The money movements of a dispute, which are what the ledger records.
     * Created is not always one: an inquiry opens a dispute WITHOUT taking
     * the money, and is either closed (nothing moved) or escalated, and the
     * escalation arrives as funds_withdrawn, not as a second created.
     */
    case 'charge.dispute.funds_withdrawn':
      return handleDisputeFundsWithdrawn(event);
    case 'charge.dispute.funds_reinstated':
      return handleDisputeFundsReinstated(event);
    case 'charge.dispute.closed':
      return handleDisputeClosed(event);
    default:
      return;
  }
}

/**
 * The ledger row a refund or dispute reverses, or a decision about its absence.
 *
 * Stripe does not deliver in order. After an outage the newer refund event can
 * come back BEFORE the older payment it refunds, and answering that refund
 * with a 200 because "we never recorded the payment" used to lose it for good:
 * the payment then landed as +$900 with no matching -$900, the booking read as
 * paid, and the delivery gate opened on money that had gone back.
 *
 * So an absent original is a question for Stripe. The PaymentIntent carries
 * the portal_id our checkout put on it: if it is ours, the payment simply has
 * not been recorded YET, and throwing makes this a 500 that Stripe retries
 * until it has. If it is not ours (a payment taken some other way), there is
 * nothing to reverse and a 200 is right. A failed lookup also throws, because
 * "could not ask" is not "not ours".
 */
async function originalOrRetry(
  sql: ReturnType<typeof getDb>,
  paymentIntentId: string,
  event: StripeEvent,
  what: string,
): Promise<{ portalId: string; kind: PaymentKind } | null> {
  const original = await originalForPaymentIntent(sql, paymentIntentId);
  if (original) return original;
  const portalId = await portalIdForPaymentIntent(paymentIntentId, event.account ?? null);
  if (portalId) {
    throw new Error(
      `${what} on ${paymentIntentId} arrived before its payment was recorded (booking ${portalId}). Asking Stripe to retry.`,
    );
  }
  console.log(`[inbox/stripe-webhook] ${what} on ${paymentIntentId} is not a payment from this site's checkout, nothing to reverse`);
  return null;
}

/** Stripe refunds that moved no money, or gave it back. Never recorded as returned. */
const DEAD_REFUND = new Set(['failed', 'canceled']);

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
    refunds?: { data?: Array<{ id?: string; amount?: number; created?: number; reason?: string | null; status?: string }>; has_more?: boolean };
  };

  const paymentIntentId = idOf(charge.payment_intent);
  if (!paymentIntentId) {
    console.error(`[inbox/stripe-webhook] charge ${charge.id} refunded with no payment_intent, cannot place it`);
    return;
  }

  const sql = getDb();
  const original = await originalOrRetry(sql, paymentIntentId, event, `refund on charge ${charge.id}`);
  if (!original) return;
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
  let dead = 0;
  for (const refund of list) {
    if (!refund.id || typeof refund.amount !== 'number' || refund.amount <= 0) continue;
    // A refund that failed or was canceled returned nothing. Listing a
    // charge's refunds returns those too, and recording one would tell the
    // client they owe money Vero in fact kept.
    if (refund.status && DEAD_REFUND.has(refund.status)) {
      dead++;
      continue;
    }
    seen++;
    const result = await recordRefundRow(sql, {
      portalId, originalKind, refund, accountId: event.account ?? null,
    });
    if (result.inserted) recorded++;
  }
  if (seen === 0 && dead > 0) {
    console.log(`[inbox/stripe-webhook] charge ${charge.id}: its ${dead} refund(s) failed or were canceled, nothing went back`);
  } else if (seen === 0) {
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
  if (refund.status && DEAD_REFUND.has(refund.status)) {
    console.log(`[inbox/stripe-webhook] refund ${refund.id} is ${refund.status}, nothing went back`);
    return;
  }
  const sql = getDb();
  const original = await originalOrRetry(sql, paymentIntentId, event, `refund ${refund.id}`);
  if (!original) return;
  await recordRefundRow(sql, {
    portalId: original.portalId,
    originalKind: original.kind,
    refund,
    accountId: event.account ?? null,
  });
}

/**
 * A refund that changed after it was created.
 *
 * FAILED or CANCELED is the case that moves money: a refund to a closed card
 * fails, Stripe puts the amount back in the balance, and the negative row
 * written when the refund was created has to be undone, or the client is shown
 * owing money Vero in fact kept. Undone with a POSITIVE row keyed on the refund
 * id plus ':failed', never by deleting the negative, because the ledger is a
 * history and the client already saw the refund.
 *
 * Any other state just makes sure the refund is on the books, which covers a
 * refund.created that was never delivered.
 */
async function handleRefundUpdated(event: StripeEvent): Promise<void> {
  const refund = event.data.object as StripeRefund;
  const paymentIntentId = idOf(refund.payment_intent);
  if (!refund.id || typeof refund.amount !== 'number' || refund.amount <= 0 || !paymentIntentId) return;
  const sql = getDb();

  if (refund.status && DEAD_REFUND.has(refund.status)) {
    const rows = (await sql`
      select client_portal_id, kind from payment_entries
      where processor_payment_id = ${refund.id}
      limit 1
    `) as Array<{ client_portal_id: string; kind: PaymentKind }>;
    const negative = rows[0];
    if (!negative) {
      console.log(`[inbox/stripe-webhook] refund ${refund.id} ${refund.status} and was never recorded, nothing to undo`);
      return;
    }
    const kind: PaymentKind = negative.kind === 'tip' ? 'tip' : 'payment';
    const result = await recordPayment(sql, {
      portalId: negative.client_portal_id,
      amount: refund.amount / 100,
      method: kind === 'tip' ? 'Tip refund reversed' : 'Card refund reversed',
      note: `The refund ${refund.status} at Stripe, so the money stayed with us`,
      paidAt: event.created ? new Date(event.created * 1000).toISOString() : null,
      source: 'stripe',
      status: 'succeeded',
      kind,
      processorPaymentId: `${refund.id}:failed`,
      processorAccountId: event.account ?? null,
      feeAmount: null,
    });
    console.log(
      result.inserted
        ? `[inbox/stripe-webhook] refund ${refund.id} ${refund.status}, reversed it, paid_to_date now ${result.paidToDate}`
        : `[inbox/stripe-webhook] refund ${refund.id} ${refund.status} was already reversed`,
    );
    return;
  }

  const original = await originalOrRetry(sql, paymentIntentId, event, `refund ${refund.id}`);
  if (!original) return;
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
  // Belt and braces: every caller already skips these, and this is the last
  // place a failed refund could still become money that went back.
  if (refund.status && DEAD_REFUND.has(refund.status)) return { inserted: false };
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

type DisputeObject = {
  id?: string;
  amount?: number;
  reason?: string | null;
  created?: number;
  status?: string;
  payment_intent?: unknown;
  charge?: unknown;
};

/**
 * A dispute opened. For a chargeback the money is gone NOW, so the ledger says
 * so now; Stripe withdraws it the moment the dispute is created, months before
 * it is resolved.
 *
 * AN INQUIRY IS NOT ONE. A card network can open a dispute that only asks
 * questions (status warning_needs_response, Amex sends these), and no money
 * moves. Recording it as gone told the client they owed the full payment again
 * and blocked delivery, and when the inquiry closed as warning_closed nothing
 * ever undid it. If an inquiry escalates, Stripe takes the money then, and
 * that arrives as charge.dispute.funds_withdrawn, handled below.
 */
async function handleDisputeOpened(event: StripeEvent): Promise<void> {
  const dispute = event.data.object as DisputeObject;
  if (typeof dispute.status === 'string' && dispute.status.startsWith('warning_')) {
    console.log(`[inbox/stripe-webhook] dispute ${dispute.id} is an inquiry (${dispute.status}), no money has moved`);
    return;
  }
  return recordDisputeWithdrawal(event, dispute);
}

/** The bank took the money: a chargeback, or an inquiry that escalated. */
async function handleDisputeFundsWithdrawn(event: StripeEvent): Promise<void> {
  return recordDisputeWithdrawal(event, event.data.object as DisputeObject);
}

/**
 * The money leaving, as a negative row KEYED ON THE DISPUTE ID. Both
 * charge.dispute.created and funds_withdrawn can deliver it for one dispute,
 * and the key is what makes that one row, not two.
 */
async function recordDisputeWithdrawal(event: StripeEvent, dispute: DisputeObject): Promise<void> {
  const paymentIntentId = idOf(dispute.payment_intent);
  if (!dispute.id || typeof dispute.amount !== 'number' || !paymentIntentId) {
    console.error(
      `[inbox/stripe-webhook] dispute ${dispute.id} on charge ${idOf(dispute.charge)} is missing a payment_intent or amount, nothing recorded`,
    );
    return;
  }

  const sql = getDb();
  const original = await originalOrRetry(sql, paymentIntentId, event, `dispute ${dispute.id}`);
  if (!original) return;
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

/** The bank gave the money back. */
async function handleDisputeFundsReinstated(event: StripeEvent): Promise<void> {
  return recordDisputeReinstated(event, event.data.object as DisputeObject);
}

/**
 * A dispute closed. Only a WIN moves money, and it is the same money
 * funds_reinstated reports, so both write one row under one key.
 *
 * lost, or an inquiry closed as warning_closed: nothing to do. A lost
 * chargeback's negative row is already right, and an inquiry never wrote one.
 */
async function handleDisputeClosed(event: StripeEvent): Promise<void> {
  const dispute = event.data.object as DisputeObject;
  if (dispute.status !== 'won') {
    console.log(`[inbox/stripe-webhook] dispute ${dispute.id} closed as ${dispute.status}, nothing further moves`);
    return;
  }
  return recordDisputeReinstated(event, dispute);
}

/**
 * The money returning, keyed on the dispute id plus ':reinstated', which both
 * funds_reinstated and closed-as-won use, so a won dispute adds it back once.
 *
 * Only undoes a withdrawal that WAS recorded. With nothing to undo, adding the
 * amount would credit money that never left.
 */
async function recordDisputeReinstated(event: StripeEvent, dispute: DisputeObject): Promise<void> {
  if (!dispute.id || typeof dispute.amount !== 'number') return;
  const sql = getDb();
  const rows = (await sql`
    select client_portal_id, kind from payment_entries
    where processor_payment_id = ${dispute.id}
    limit 1
  `) as Array<{ client_portal_id: string; kind: PaymentKind }>;
  const withdrawal = rows[0];
  if (!withdrawal) {
    console.warn(`[inbox/stripe-webhook] dispute ${dispute.id} returned funds that were never recorded as taken, nothing added back`);
    await reportPaymentIssue({
      key: `dispute-return:${dispute.id}`,
      summary: `Stripe returned ${(dispute.amount / 100).toFixed(2)} from dispute ${dispute.id}, but the ledger never recorded the money leaving.`,
      action: 'Check the dispute in Stripe and the booking it belongs to; the balance may need a correction by hand.',
      source: 'webhook',
    });
    return;
  }
  const kind: PaymentKind = withdrawal.kind === 'tip' ? 'tip' : 'payment';
  const result = await recordPayment(sql, {
    portalId: withdrawal.client_portal_id,
    amount: dispute.amount / 100,
    method: 'Chargeback reversed',
    note: 'Dispute won, funds returned by Stripe',
    paidAt: event.created ? new Date(event.created * 1000).toISOString() : null,
    source: 'stripe',
    status: 'succeeded',
    kind,
    processorPaymentId: `${dispute.id}:reinstated`,
    processorAccountId: event.account ?? null,
    feeAmount: null,
  });
  console.log(
    result.inserted
      ? `[inbox/stripe-webhook] dispute ${dispute.id} funds returned, ${(dispute.amount / 100).toFixed(2)} back on portal ${withdrawal.client_portal_id}, paid_to_date now ${result.paidToDate}`
      : `[inbox/stripe-webhook] dispute ${dispute.id} return was already recorded`,
  );
}

/**
 * Money in. The decisions (paid or not, whose, how much, which kind, dated
 * when) live in api/_checkout-record.ts, shared with the return path the
 * client's browser takes, so the two roads into the ledger cannot disagree.
 */
async function handleCheckoutCompleted(event: StripeEvent): Promise<void> {
  const session = event.data.object as StripeCheckoutSession;
  const result = await recordPaidCheckoutSession(session, {
    source: 'webhook',
    paidAtSeconds: event.created ?? null,
    accountId: event.account ?? null,
  });
  switch (result.status) {
    case 'recorded':
      console.log(`[inbox/stripe-webhook] recorded $${result.amount} for portal ${result.portalId}, paid_to_date now ${result.paidToDate}`);
      return;
    case 'already':
      console.log(`[inbox/stripe-webhook] session ${session.id} was already recorded, nothing to do`);
      return;
    case 'not-paid':
      console.warn(`[inbox/stripe-webhook] session ${session.id} completed with ${result.reason}, nothing recorded`);
      return;
    case 'unusable':
      console.error(`[inbox/stripe-webhook] session ${session.id} not recorded: ${result.reason}`);
      return;
  }
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
