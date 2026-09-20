/**
 * The one writer for money in.
 *
 * Every payment row in this system is written here, whether Vero typed it in
 * after a Zelle or a card webhook delivered it at 2am. Three callers will
 * exist: the admin form, the Stripe webhook, and the checkout return path that
 * runs when a client's browser comes back before the webhook has landed. That
 * last pair is the whole reason this file exists: those two race by design, and
 * they must not be able to record one payment twice.
 *
 * Underscore-prefixed so Vercel does not expose it as an HTTP route.
 */

import { getDb } from './_db.js';

export type PaymentSource = 'manual' | 'stripe';
export type PaymentStatus = 'succeeded' | 'pending' | 'failed';

export type RecordPaymentInput = {
  portalId: string;
  /**
   * GROSS, always. What the client actually handed over.
   *
   * Never the net. A 900 dollar balance paid by card costs about 26 dollars in
   * fees, and recording 874 would leave the booking reading 26 dollars short
   * forever, so the delivery gate in _portal-deliver.ts would never open and
   * nothing would say why. The fee goes in feeAmount, where it is bookkeeping
   * rather than part of the balance.
   */
  amount: number;
  /** Free text Vero reads: 'Zelle', 'cash', 'Visa 4242'. Never used for logic. */
  method?: string | null;
  note?: string | null;
  paidAt?: string | null;
  source?: PaymentSource;
  status?: PaymentStatus;
  /**
   * The processor's id for the PAYMENT, not for the event.
   *
   * For Stripe this is the PaymentIntent (pi_...). Stripe emits several
   * distinct events for one payment, each with its own event id, so keying on
   * the event id would let one 400 dollar payment insert three rows while every
   * delivery was genuinely unique.
   */
  processorPaymentId?: string | null;
  /** The connected account, once other photographers exist. NULL until then. */
  processorAccountId?: string | null;
  feeAmount?: number | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
};

export type RecordPaymentResult = {
  /** False when this payment was already recorded, which is a success, not an error. */
  inserted: boolean;
  paidToDate: number;
};

/**
 * Recompute what a booking has been paid, from the rows.
 *
 * One statement, so the sum and the write cannot be separated by another
 * writer landing between them. Exported because deleting a payment needs the
 * same recompute and must not grow a second copy of this logic.
 *
 * Counts CLEARED money only. Everything is 'succeeded' today, so this changes
 * nothing now; it is what stops an unsettled bank debit from opening the
 * delivery gate once ACH exists.
 *
 * A full re-sum rather than an increment, deliberately. Re-summing heals
 * itself the moment a bad row is deleted. An increment carries its error
 * forever, and the error is somebody's money.
 */
export async function recomputePaidToDate(
  sql: ReturnType<typeof getDb>,
  portalId: string,
): Promise<number> {
  const rows = (await sql`
    update client_portals
    set paid_to_date = (
          select coalesce(sum(amount), 0)
          from payment_entries
          where client_portal_id = ${portalId} and status = 'succeeded'
        ),
        updated_at = now()
    where id = ${portalId}
    returning paid_to_date
  `) as Array<{ paid_to_date: string }>;
  return parseFloat(rows[0]?.paid_to_date ?? '0');
}

/**
 * Record a payment, at most once.
 *
 * THE TRAP, found by running it rather than by reasoning about it. The unique
 * index on processor_payment_id is PARTIAL (migration 040), because every
 * manual cash row has a NULL there and a plain UNIQUE would permit exactly one
 * of them. A partial index does NOT satisfy a bare `on conflict (col)`:
 * Postgres answers
 *
 *   there is no unique or exclusion constraint matching the ON CONFLICT
 *   specification                                        (SQLSTATE 42P10)
 *
 * and the insert throws. The predicate has to be repeated, which is what the
 * `where processor_payment_id is not null` below is doing.
 *
 * Getting that wrong fails in precisely the case the index exists for: the
 * SECOND delivery of a webhook. Stripe retries a 500, which 500s again, and
 * the happy path looks perfect in testing the whole time.
 *
 * INSERT then recompute, never SELECT then INSERT. Two concurrent retries both
 * see nothing and both insert. The database decides, once.
 */
export async function recordPayment(
  sql: ReturnType<typeof getDb>,
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  const {
    portalId,
    amount,
    method = null,
    note = null,
    paidAt = null,
    source = 'manual',
    status = 'succeeded',
    processorPaymentId = null,
    processorAccountId = null,
    feeAmount = null,
    cardBrand = null,
    cardLast4 = null,
  } = input;

  if (!Number.isFinite(amount)) {
    throw new Error('recordPayment: amount must be a finite number of dollars');
  }

  const when = paidAt ?? new Date().toISOString();

  const inserted = (await sql`
    insert into payment_entries (
      client_portal_id, amount, method, note, paid_at,
      source, status, processor_payment_id, processor_account_id,
      fee_amount, card_brand, card_last4
    )
    values (
      ${portalId}, ${amount}, ${method}, ${note}, ${when},
      ${source}, ${status}, ${processorPaymentId}, ${processorAccountId},
      ${feeAmount}, ${cardBrand}, ${cardLast4}
    )
    on conflict (processor_payment_id) where processor_payment_id is not null
    do nothing
    returning id
  `) as Array<{ id: string }>;

  // Recompute UNCONDITIONALLY, even when the insert was a no-op. A duplicate
  // webhook is the cheapest possible moment to re-derive the balance, and if an
  // earlier attempt inserted the row but died before recomputing, this is what
  // repairs it.
  const paidToDate = await recomputePaidToDate(sql, portalId);

  return { inserted: inserted.length > 0, paidToDate };
}
