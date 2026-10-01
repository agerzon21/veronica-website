/**
 * A paid Checkout session, into the ledger. The one place that decides.
 *
 * TWO ROADS lead here, and they race by design: the Stripe webhook, and the
 * client's own browser coming back from checkout (api/portal/_pay-confirm.ts).
 * Either may arrive first and either may never arrive at all. That second
 * road is the reason this module exists: with only the webhook, a lost
 * delivery (a wrong signing secret, a disabled endpoint, three days of
 * failures) meant a client who had paid was shown an unchanged balance and a
 * Pay button, and paying again was the obvious next move. Now a client who
 * comes back records their own payment, checked against Stripe rather than
 * taken from the URL.
 *
 * recordPayment is keyed on the PaymentIntent, so whichever road lands second
 * records nothing and simply reads back the balance.
 *
 * Underscore-prefixed so Vercel does not expose it as a route.
 */

import { getDb } from './_db.js';
import { recordPayment } from './_payments.js';
import { reportPaymentIssue } from './_payment-alerts.js';
import type { StripeCheckoutSession } from './_stripe.js';

/**
 * Cents as "$5.00", or "card" wording without a figure when Stripe sent none.
 * Alert sentences lead with this, not with an id: the summary is also the
 * email's subject, and a subject that opens with a 66-character checkout id
 * reads the same as every other one in the inbox.
 */
const usdOf = (cents: number | null | undefined): string =>
  typeof cents === 'number' ? `$${(cents / 100).toFixed(2)}` : 'card';

export type CheckoutRecordResult =
  | { status: 'recorded' | 'already'; portalId: string; amount: number; paidToDate: number }
  | { status: 'not-paid' | 'unusable'; reason: string };

export async function recordPaidCheckoutSession(
  session: StripeCheckoutSession,
  ctx: {
    source: 'webhook' | 'return' | 'reconcile';
    /** Unix seconds the money moved. The webhook passes the event's time. */
    paidAtSeconds?: number | null;
    accountId?: string | null;
  },
): Promise<CheckoutRecordResult> {
  // "Completed" and "paid" are different facts. A session can complete while
  // payment is still processing, and recording that as money in hand would
  // open the delivery gate on photos nobody has paid for.
  if (session.payment_status !== 'paid') {
    return { status: 'not-paid', reason: `payment_status=${session.payment_status}` };
  }

  const portalId = session.metadata?.portal_id;
  if (!portalId) {
    // Unrecoverable from here: without it there is no way to know whose money
    // it is. A person has to attach it.
    await reportPaymentIssue({
      key: `no-portal:${session.id}`,
      summary: `A ${usdOf(session.amount_total)} card payment arrived with no booking attached, so it was not recorded (checkout ${session.id}).`,
      action: 'Find it in Stripe, work out whose payment it is, and log it on their booking by hand.',
      source: ctx.source,
    });
    return { status: 'unusable', reason: 'no portal_id in metadata' };
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) {
    await reportPaymentIssue({
      key: `no-intent:${session.id}`,
      summary: `A ${usdOf(session.amount_total)} card payment carried no payment id, so it was not recorded (booking ${portalId}, checkout ${session.id}).`,
      action: 'Check the payment in Stripe and log it on the booking by hand.',
      source: ctx.source,
    });
    return { status: 'unusable', reason: 'no payment_intent' };
  }

  /**
   * Dollars or nothing. Checkout is created in USD, but if a presentment
   * currency were ever switched on in the dashboard, amount_total would arrive
   * in the client's currency, and recording 900 euros as 900 dollars is worse
   * than recording nothing and saying so.
   */
  if (session.currency && session.currency.toLowerCase() !== 'usd') {
    await reportPaymentIssue({
      key: `currency:${session.id}`,
      summary: `A card payment was taken in ${session.currency.toUpperCase()}, not dollars, so it was not recorded (booking ${portalId}, checkout ${session.id}).`,
      action: 'Check the dollar amount in Stripe and log it on the booking by hand.',
      source: ctx.source,
    });
    return { status: 'unusable', reason: `currency ${session.currency}` };
  }

  // From Stripe, never from metadata. Metadata is what the browser asked for;
  // amount_total is what was actually collected.
  const amount = typeof session.amount_total === 'number' ? session.amount_total / 100 : null;
  if (amount === null || amount <= 0) {
    return { status: 'unusable', reason: 'no usable amount_total' };
  }

  const asked = session.metadata?.kind;
  const kind: 'retainer' | 'balance' | 'tip' =
    asked === 'retainer' ? 'retainer' : asked === 'tip' ? 'tip' : 'balance';

  /**
   * Dated by when the money moved, not by when we got round to writing it.
   * Without this a webhook retried two days later stamped a September 30
   * payment October 2, which moves it into the next sales-tax quarter.
   */
  const paidAt = ctx.paidAtSeconds ? new Date(ctx.paidAtSeconds * 1000).toISOString() : null;

  /*
   * The fee is NOT read here, and is left to api/cron/_stripe-fee-backfill.ts.
   * Payments are created with capture_method automatic_async, so the fee lives
   * on a balance transaction that does not exist until the charge settles,
   * which is after this runs. fee_amount is bookkeeping and never affects what
   * anyone owes, so arriving within a day via the backfill is exactly as good.
   */
  const result = await recordPayment(getDb(), {
    portalId,
    amount,
    method: 'Card',
    note:
      kind === 'retainer'
        ? 'Retainer paid by card'
        : kind === 'tip'
          ? 'Tip paid by card'
          : 'Balance paid by card',
    paidAt,
    source: 'stripe',
    status: 'succeeded',
    // The ONE place a card tip becomes a tip in the ledger. Everything
    // downstream, including the refund and dispute reversals, reads it back.
    kind: kind === 'tip' ? 'tip' : 'payment',
    processorPaymentId: paymentIntentId,
    processorAccountId: ctx.accountId ?? null,
    feeAmount: null,
  });

  return {
    status: result.inserted ? 'recorded' : 'already',
    portalId,
    amount,
    paidToDate: result.paidToDate,
  };
}
