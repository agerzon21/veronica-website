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
/**
 * What the money WAS, as opposed to how it arrived or whether it cleared.
 *
 * 'payment' settles the contract and counts toward paid_to_date. 'tip' does
 * not count toward anything: it is money the client chose to add on top, and
 * letting it into the balance sum would report the booking as overpaid, and
 * would open the delivery gate in _portal-deliver.ts on an unpaid balance.
 * Migration 043.
 */
export type PaymentKind = 'payment' | 'tip';

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
  /** Defaults to 'payment'. A tip is recorded here but excluded from the balance. */
  kind?: PaymentKind;
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
  /**
   * How much of `amount` counts toward the balance, when not all of it does.
   *
   * Only a card payment on a dual-priced booking (migration 054) sets this: a
   * $103.30 card retainer is credited $100.00, and the $3.30 is what Stripe
   * keeps. Omitted or null, the whole amount counts, as it always has. A
   * reversal (refund, chargeback) passes its share, from reversalCredit below.
   */
  creditedAmount?: number | null;
  /**
   * On a refund, a chargeback, or the undoing of one: the processor id of the
   * PAYMENT it reverses (migration 054), so the shares of several partial
   * reversals are worked out from their running total and sum exactly.
   */
  reversesPaymentId?: string | null;
};

export type RecordPaymentResult = {
  /** False when this payment was already recorded, which is a success, not an error. */
  inserted: boolean;
  paidToDate: number;
};

/**
 * The row lock every money write takes first.
 *
 * WHY A LOCK, and why a plain transaction is not enough. The re-sums below are
 * single UPDATEs with a subquery, and under Postgres' default READ COMMITTED a
 * second UPDATE that waited on the first keeps its OLD snapshot for the
 * subquery: two payments landing on one booking at the same moment could each
 * sum without the other, and one would be missing from paid_to_date until the
 * next write healed it. Taking the booking's row lock as the transaction's
 * FIRST statement means everything after it runs on a snapshot taken once the
 * other writer has committed.
 */
function lockPortal(sql: ReturnType<typeof getDb>, portalId: string) {
  return sql`select id from client_portals where id = ${portalId} for update`;
}

/**
 * Recompute what a booking has been paid, from the rows.
 *
 * Counts CLEARED money only, so an unsettled bank debit can never open the
 * delivery gate. Counts CONTRACT money only: a tip is a payment_entries row
 * like any other, but it settles nothing (migration 043). This subquery is the
 * only writer of paid_to_date in the codebase, which is why one filter here
 * keeps tips out of all eight balance readers.
 *
 * A full re-sum rather than an increment, deliberately. Re-summing heals
 * itself the moment a bad row is deleted. An increment carries its error
 * forever, and the error is somebody's money.
 */
export function paidToDateUpdate(sql: ReturnType<typeof getDb>, portalId: string) {
  // credited_amount, not amount, where a payment carries one: on a dual-priced
  // booking a card payment includes what Stripe takes, and that part settles
  // nothing (migration 054). The one place that decides, for all eight readers.
  return sql`
    update client_portals
    set paid_to_date = (
          select coalesce(sum(coalesce(credited_amount, amount)), 0)
          from payment_entries
          where client_portal_id = ${portalId}
            and status = 'succeeded'
            and kind = 'payment'
        ),
        updated_at = now()
    where id = ${portalId}
    returning paid_to_date
  `;
}

/**
 * The same, for charges added after the booking (portal_charges, migration
 * 035). THE ONLY WRITER of client_portals.charges_total. It used to live in
 * _payment-log.ts alone, and the insurance endpoint wrote charge rows without
 * calling it, so card checkout, the delivery gate and the Clients list kept
 * reading a stale total: a $64 policy could be left off what Stripe charged,
 * or stay on it after the policy was removed. Every charge write calls this.
 */
export function chargesTotalUpdate(sql: ReturnType<typeof getDb>, portalId: string) {
  return sql`
    update client_portals
    set charges_total = (
          select coalesce(sum(amount), 0)
          from portal_charges
          where client_portal_id = ${portalId}
        ),
        updated_at = now()
    where id = ${portalId}
    returning charges_total
  `;
}

type CreditedRow = { amount: number | string | null; credited_amount: number | string | null };

/**
 * A reversal's share of the balance credit, given the reversals of the same
 * payment already recorded. Pure, so it can be tested on its own.
 *
 * A refund of $51.65 on a $103.30 card payment that was credited $100.00
 * takes back $50.00 of the balance, not $51.65: the client gets back what
 * they paid, and the booking owes again what that payment had settled.
 *
 * FROM THE RUNNING TOTAL, not refund by refund. Rounding each share on its own
 * let two $25.90 halves of a $51.80 payment credited $49.99 take back $25.00
 * each, $50.00 in all, and the booking read a cent short for good. Here the
 * credit due back after ALL reversals so far is worked out once, and this one
 * takes the difference, so any sequence of partial refunds, chargebacks and
 * their undoing lands on exactly the original credit. Never more than it.
 *
 * Null when the original counted in full, so a reversal of it does too.
 */
export function cumulativeCreditedShare(
  amount: number,
  original: CreditedRow | null | undefined,
  prior: { gross: number; credited: number },
): number | null {
  if (!original || original.credited_amount === null || original.credited_amount === undefined) return null;
  const toCents = (d: number) => Math.round(d * 100);
  const grossC = toCents(Number(original.amount));
  const creditedC = toCents(Number(original.credited_amount));
  if (!Number.isFinite(grossC) || grossC === 0 || !Number.isFinite(creditedC)) return null;
  const reversedC = toCents(prior.gross) + toCents(amount);
  const cap = Math.abs(creditedC);
  const targetC = Math.max(-cap, Math.min(cap, Math.round((creditedC * reversedC) / grossC)));
  return (targetC - toCents(prior.credited)) / 100;
}

/**
 * The same, reading the reversals already recorded against the payment.
 *
 * Two reversals of one payment landing in the same instant can both read the
 * total from before either, and then sum a cent off; the alternative, locking
 * here, would put a second lock order beside the booking lock recordPayment
 * takes, which is how deadlocks start. A cent, on a coincidence that needs two
 * refunds of one card payment within milliseconds, is the better trade.
 */
export async function reversalCredit(
  sql: ReturnType<typeof getDb>,
  paymentId: string,
  amount: number,
  original: CreditedRow | null | undefined,
): Promise<number | null> {
  if (!original || original.credited_amount === null || original.credited_amount === undefined) return null;
  const rows = (await sql`
    select coalesce(sum(amount), 0)::text as gross,
           coalesce(sum(coalesce(credited_amount, amount)), 0)::text as credited
    from payment_entries
    where reverses_payment_id = ${paymentId} and status = 'succeeded'
  `) as Array<{ gross: string; credited: string }>;
  return cumulativeCreditedShare(amount, original, {
    gross: Number(rows[0]?.gross ?? 0),
    credited: Number(rows[0]?.credited ?? 0),
  });
}

/** Re-sum paid_to_date on its own, under the lock. Exported for deletes and repairs. */
export async function recomputePaidToDate(
  sql: ReturnType<typeof getDb>,
  portalId: string,
): Promise<number> {
  const results = (await sql.transaction([lockPortal(sql, portalId), paidToDateUpdate(sql, portalId)])) as unknown[][];
  const rows = results[1] as Array<{ paid_to_date: string }>;
  return parseFloat(rows[0]?.paid_to_date ?? '0');
}

/** Re-sum charges_total on its own, under the lock. */
export async function recomputeChargesTotal(
  sql: ReturnType<typeof getDb>,
  portalId: string,
): Promise<number> {
  const results = (await sql.transaction([lockPortal(sql, portalId), chargesTotalUpdate(sql, portalId)])) as unknown[][];
  const rows = results[1] as Array<{ charges_total: string }>;
  return parseFloat(rows[0]?.charges_total ?? '0');
}

/**
 * Lock, write, re-sum: one transaction, in that order.
 *
 * For every write to payment_entries or portal_charges outside recordPayment
 * (a manual delete, a charge, a fee waiver, insurance). Either all of it
 * happens or none of it does, so a failure can no longer leave a row written
 * and its total stale, which is what made a retried click double count.
 *
 * Returns the write's own rows and the new total.
 */
export async function writeWithRecompute(
  sql: ReturnType<typeof getDb>,
  portalId: string,
  // The neon query objects are lazy, so these run inside the transaction.
  writes: ReturnType<ReturnType<typeof getDb>>[],
  totals: { paid?: boolean; charges?: boolean },
): Promise<{ writeRows: unknown[][]; paidToDate: number | null; chargesTotal: number | null }> {
  const queries = [lockPortal(sql, portalId), ...writes];
  if (totals.paid) queries.push(paidToDateUpdate(sql, portalId));
  if (totals.charges) queries.push(chargesTotalUpdate(sql, portalId));
  const results = (await sql.transaction(queries)) as unknown[][];
  const writeRows = results.slice(1, 1 + writes.length);
  let i = 1 + writes.length;
  const paidToDate = totals.paid ? parseFloat((results[i++] as Array<{ paid_to_date: string }>)[0]?.paid_to_date ?? '0') : null;
  const chargesTotal = totals.charges ? parseFloat((results[i] as Array<{ charges_total: string }>)[0]?.charges_total ?? '0') : null;
  return { writeRows, paidToDate, chargesTotal };
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
    kind = 'payment',
    processorPaymentId = null,
    processorAccountId = null,
    feeAmount = null,
    cardBrand = null,
    cardLast4 = null,
    creditedAmount = null,
    reversesPaymentId = null,
  } = input;

  if (!Number.isFinite(amount)) {
    throw new Error('recordPayment: amount must be a finite number of dollars');
  }
  // Never more than the payment itself, and the same sign, so a bad figure
  // cannot credit a booking with money nobody paid.
  if (
    creditedAmount !== null &&
    (!Number.isFinite(creditedAmount) || Math.abs(creditedAmount) > Math.abs(amount) || creditedAmount * amount < 0)
  ) {
    throw new Error('recordPayment: creditedAmount must be within the amount and of the same sign');
  }

  const when = paidAt ?? new Date().toISOString();

  /**
   * Lock, insert, re-sum, as ONE transaction. The insert is still
   * ON CONFLICT DO NOTHING on the payment id, and the re-sum still runs
   * unconditionally, so a duplicate webhook is the cheapest possible moment to
   * re-derive the balance. What changed is that the three can no longer be
   * separated: the row and its total land together or not at all.
   */
  const results = (await sql.transaction([
    lockPortal(sql, portalId),
    sql`
      insert into payment_entries (
        client_portal_id, amount, method, note, paid_at,
        source, status, kind, processor_payment_id, processor_account_id,
        fee_amount, card_brand, card_last4, credited_amount, reverses_payment_id
      )
      values (
        ${portalId}, ${amount}, ${method}, ${note}, ${when},
        ${source}, ${status}, ${kind}, ${processorPaymentId}, ${processorAccountId},
        ${feeAmount}, ${cardBrand}, ${cardLast4}, ${creditedAmount}, ${reversesPaymentId}
      )
      on conflict (processor_payment_id) where processor_payment_id is not null
      do nothing
      returning id
    `,
    paidToDateUpdate(sql, portalId),
  ])) as unknown[][];
  const inserted = results[1] as Array<{ id: string }>;
  const paidToDate = parseFloat((results[2] as Array<{ paid_to_date: string }>)[0]?.paid_to_date ?? '0');

  return { inserted: inserted.length > 0, paidToDate };
}
