/**
 * Admin: log money in (payment entries) and money owed (charges) against a
 * portal, and recompute the two totals the balance is derived from.
 *
 * POST {
 *   password, id,
 *   action: 'add' | 'delete' | 'add-charge' | 'delete-charge',
 *
 *   // add:
 *   amount?, method?, note?, paid_at?,
 *   kind? ('payment' | 'tip'),            a cash or Zelle tip is a tip
 *   split_excess_as_tip? (boolean)        the part above the balance becomes a tip
 *
 *   // delete:
 *   entry_id?
 *
 *   // add-charge:
 *   amount?, reason? ('overtime' | 'expense' | 'other'), note?, charged_at?
 *
 *   // delete-charge:
 *   charge_id?
 * }
 *   → 200 { success, paid_to_date, payments[] }      for add / delete
 *   → 200 { success, charges_total, charges[] }      for add-charge / delete-charge
 *
 * Why we materialize paid_to_date on the portal row instead of computing
 * via sum() at read time: paid_to_date is read on every portal load
 * (for the balance display), but updated infrequently. Materializing
 * saves the sum() join on every read; the recompute on add/delete is
 * cheap because we already touch the row.
 *
 * charges_total is the mirror image and is maintained here for exactly the
 * same reasons, by the same recompute-by-sum. See
 * db/migrations/035-portal-charges.sql. The invariant both halves serve:
 *
 *   amount still owed = contract_total_amount + charges_total - paid_to_date
 *
 * Charges are additive only (the table CHECKs amount > 0). Undoing one is a
 * delete, not a negative charge, so the client never reads a correction
 * sitting next to the mistake it corrects.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { writeWithRecompute } from '../_payments.js';
import { actorName, historyInsert, historyReady, readHistory } from '../_money-history.js';
import {
  bookingOwedTotal,
  salesTaxModeOf,
  type SalesTaxMode,
} from '../../src/data/sales-tax.js';

/**
 * The booking's Pennsylvania sales tax setting (migration 049). Its own read,
 * allowed to fail: a database without the column taxes nothing, which is how
 * every booking worked before it existed.
 */
async function salesTaxFor(sql: ReturnType<typeof getDb>, id: string): Promise<SalesTaxMode> {
  try {
    const rows = (await sql`
      select sales_tax from client_portals where id = ${id}
    `) as Array<{ sales_tax: string }>;
    return salesTaxModeOf(rows[0]?.sales_tax);
  } catch {
    return 'absorbed';
  }
}

/**
 * The reasons a charge can carry. Same three the table CHECKs, repeated here
 * so a typo comes back as a 400 naming the valid values rather than a 500
 * from a constraint violation. Each one is a label the client reads.
 */
const CHARGE_REASONS = new Set(['overtime', 'expense', 'other']);

/**
 * Bigger than any booking this business takes. A manual amount above it is a
 * typo (an extra zero turns a $3,000 booking "paid" at $30,000), so it is
 * refused rather than recorded.
 */
const MAX_MANUAL_AMOUNT = 50_000;

/**
 * A date input sends 'YYYY-MM-DD', an API caller may send a full ISO string,
 * and either may be absent. Anything unparseable falls back to now rather
 * than failing the write: the amount is the part that matters, and a charge
 * filed on today's date is a smaller problem than a charge that was refused.
 */
function parseWhen(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return new Date().toISOString();
  // Just a date, so treat it as start-of-day UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`).toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * The booking's payments, after a write, with the total that write produced.
 *
 * The total comes IN rather than being recomputed here: every write now runs
 * as one transaction (lock, write, re-sum) through writeWithRecompute in
 * api/_payments.ts, which is the only place paid_to_date is derived. This used
 * to hold its own copy of that sum, and two copies of an arithmetic rule is a
 * bug with a delay on it: the canonical sum learned to exclude tips and this
 * copy did not.
 */
async function respondWithPayments(
  sql: ReturnType<typeof getDb>,
  portalId: string,
  res: VercelResponse,
  paidToDate: number | null,
  extra: Record<string, unknown> = {},
) {
  const payments = (await sql`
    select id, amount, method, note, paid_at, created_at, kind, source, status
    from payment_entries
    where client_portal_id = ${portalId}
    order by paid_at desc, created_at desc
  `) as Array<{
    id: string;
    amount: string;
    method: string | null;
    note: string | null;
    paid_at: string;
    created_at: string;
    kind: string;
    source: string;
    status: string;
  }>;

  return res.status(200).json({
    success: true,
    paid_to_date: paidToDate,
    payments: payments.map((p) => ({
      id: p.id,
      amount: parseFloat(p.amount),
      method: p.method,
      note: p.note,
      paid_at: p.paid_at,
      created_at: p.created_at,
      kind: p.kind,
      source: p.source,
      status: p.status,
    })),
    ...extra,
  });
}

/** The charges half of the same bookkeeping. */
async function respondWithCharges(
  sql: ReturnType<typeof getDb>,
  portalId: string,
  res: VercelResponse,
  chargesTotal: number | null,
) {
  const charges = (await sql`
    select id, amount, reason, note, charged_at, created_at
    from portal_charges
    where client_portal_id = ${portalId}
    order by charged_at desc, created_at desc
  `) as Array<{
    id: string;
    amount: string;
    reason: string;
    note: string | null;
    charged_at: string;
    created_at: string;
  }>;

  return res.status(200).json({
    success: true,
    charges_total: chargesTotal,
    charges: charges.map((c) => ({
      id: c.id,
      amount: parseFloat(c.amount),
      reason: c.reason,
      note: c.note,
      charged_at: c.charged_at,
      created_at: c.created_at,
    })),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  const action = req.body?.action;
  if (!id) return res.status(400).json({ success: false, error: 'id required' });

  try {
    const sql = getDb();
    // The money history (migration 052): written in each change's own
    // transaction below, and skipped, never failed, before the table exists.
    const recording = await historyReady(sql);
    const actor = recording ? await actorName(sql, auth) : '';

    if (action === 'delete') {
      const entryId = typeof req.body?.entry_id === 'string' ? req.body.entry_id.trim() : '';
      if (!entryId) return res.status(400).json({ success: false, error: 'entry_id required' });
      /**
       * A card payment is not a note, and cannot be deleted here.
       *
       * Every other row in this table is something Vero typed to record money
       * she was handed, so deleting a mistyped one is the correct repair. A
       * source='stripe' row is different in kind: it is the record of money
       * that actually moved through a card network, keyed to a PaymentIntent.
       *
       * Deleting one does not undo the charge. It drops paid_to_date, so the
       * client is asked to pay again for money they have already sent, and it
       * is PERMANENT: recordPayment de-duplicates on processor_payment_id, so
       * if Stripe ever redelivers that event the insert is skipped and the row
       * never comes back.
       *
       * The repair for a card payment is a refund in Stripe, which is a real
       * movement of money in the other direction, not the quiet removal of the
       * evidence that the first one happened.
       */
      const { writeRows, paidToDate } = await writeWithRecompute(
        sql,
        id,
        [
          // History first: once the row is deleted there is nothing to read.
          // Same conditions as the delete, so a refused card payment writes
          // no history either.
          ...(recording
            ? [
                sql`
                  insert into money_history (client_portal_id, booking_name, actor, action, detail)
                  select ${id}, cp.client_display_name, ${actor}, 'payment_deleted',
                         jsonb_build_object('amount', pe.amount, 'method', pe.method, 'kind', pe.kind, 'paid_at', pe.paid_at, 'note', pe.note)
                  from payment_entries pe join client_portals cp on cp.id = pe.client_portal_id
                  where pe.id = ${entryId}
                    and pe.client_portal_id = ${id}
                    and coalesce(pe.source, 'manual') <> 'stripe'
                `,
              ]
            : []),
          sql`
            delete from payment_entries
            where id = ${entryId}
              and client_portal_id = ${id}
              and coalesce(source, 'manual') <> 'stripe'
            returning id
          `,
        ],
        { paid: true },
      );
      const removed = writeRows[recording ? 1 : 0] as Array<{ id: string }>;

      if (removed.length === 0) {
        // Either it was a card payment, or it was already gone. Say which,
        // because "nothing happened" with no reason reads as a broken button.
        const still = (await sql`
          select coalesce(source, 'manual') as source
          from payment_entries
          where id = ${entryId} and client_portal_id = ${id}
          limit 1
        `) as Array<{ source: string }>;
        if (still.length > 0) {
          return res.status(409).json({
            success: false,
            error:
              'This is a card payment, so it cannot be deleted here. It records money that really ' +
              'moved. To give it back, refund it in Stripe and the refund will be recorded on its own.',
          });
        }
      }
      return respondWithPayments(sql, id, res, paidToDate);
    }

    if (action === 'add') {
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: 'amount must be a positive number' });
      }
      if (amount > MAX_MANUAL_AMOUNT) {
        return res.status(400).json({
          success: false,
          error: `That is more than any booking here (${amount.toLocaleString('en-US')}). Check the amount for an extra zero.`,
        });
      }
      const method = typeof req.body?.method === 'string' ? req.body.method.trim() : null;
      const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null;
      // Accept either an ISO timestamp or YYYY-MM-DD (from a date input).
      const paidAt = parseWhen(req.body?.paid_at);
      // Two days of slack for timezones and a payment logged the night before
      // it clears. Anything later is a typo, and a future date files the money
      // in the wrong sales-tax quarter.
      if (new Date(paidAt).getTime() > Date.now() + 2 * 86_400_000) {
        return res.status(400).json({ success: false, error: 'That date is in the future. Use the day the money arrived.' });
      }

      /**
       * A TIP IS A TIP, however it arrived (migration 043). The card path has
       * always recorded tips separately; a Zelle or cash tip could only be
       * logged as a payment, which counted it toward the balance and could
       * open the delivery gate on work that had not been paid for.
       *
       * AND THE PART ABOVE THE BALANCE IS A TIP, when Vero says so. A client
       * who sends one sum for the balance and a thank-you together leaves the
       * booking reading "overpaid"; the owner's rule is that whatever is above
       * the contract plus its charges is a tip, unless it is a fee they added
       * separately. split_excess_as_tip applies that rule in one step.
       */
      const kind: 'payment' | 'tip' = req.body?.kind === 'tip' ? 'tip' : 'payment';
      const splitExcess = req.body?.split_excess_as_tip === true;
      const cents = Math.round(amount * 100);
      let paymentCents = kind === 'payment' ? cents : 0;
      let tipCents = kind === 'tip' ? cents : 0;
      if (kind === 'payment' && splitExcess) {
        // Charges from the ROWS, so this cannot read a stale stored total.
        const b = (await sql`
          select contract_total_amount::text t, paid_to_date::text p,
                 (select coalesce(sum(amount), 0) from portal_charges where client_portal_id = ${id})::text c
          from client_portals where id = ${id} limit 1
        `) as Array<{ t: string | null; p: string | null; c: string }>;
        if (b[0]?.t != null) {
          // Tax included when the booking adds it: on a taxed booking the
          // first $30 above a $500 price is the tax, not a tip.
          const owedTotal = bookingOwedTotal(parseFloat(b[0].t), parseFloat(b[0].c), await salesTaxFor(sql, id)) ?? 0;
          const owedCents = Math.max(
            Math.round(owedTotal * 100) - Math.round(parseFloat(b[0].p ?? '0') * 100),
            0,
          );
          if (cents > owedCents) {
            paymentCents = owedCents;
            tipCents = cents - owedCents;
          }
        }
      }

      const writes = [];
      if (paymentCents > 0) {
        writes.push(sql`
          insert into payment_entries (client_portal_id, amount, method, note, paid_at, kind)
          values (${id}, ${paymentCents / 100}, ${method || null}, ${note || null}, ${paidAt}, 'payment')
        `);
      }
      if (tipCents > 0) {
        const tipNote =
          kind === 'tip'
            ? note || null
            : note
              ? `${note} (the part above the balance, recorded as a tip)`
              : 'The part above the balance, recorded as a tip';
        writes.push(sql`
          insert into payment_entries (client_portal_id, amount, method, note, paid_at, kind)
          values (${id}, ${tipCents / 100}, ${method || null}, ${tipNote}, ${paidAt}, 'tip')
        `);
      }
      if (recording && paymentCents > 0) {
        writes.push(historyInsert(sql, id, actor, 'payment_added', { amount: paymentCents / 100, method, paid_at: paidAt, note }));
      }
      if (recording && tipCents > 0) {
        writes.push(historyInsert(sql, id, actor, 'tip_added', { amount: tipCents / 100, method, paid_at: paidAt, split: kind === 'payment' }));
      }
      const { paidToDate } = await writeWithRecompute(sql, id, writes, { paid: true });
      return respondWithPayments(sql, id, res, paidToDate, {
        recorded: { payment: paymentCents / 100, tip: tipCents / 100 },
      });
    }

    /**
     * The card fee waiver, retired on 2026-10-05 (migration 054).
     *
     * It closed the gap left when a client paid a CARD-priced booking directly:
     * the contract total was the card price, so a Zelle payer who took the
     * offered discount left the booking owing the fee Stripe never took. That
     * pricing is gone. A 'dual' booking's stated amounts are the direct price
     * already, and a 'single' booking is one price however it is paid, so there
     * is never a gap of that kind to close. No waiver row was ever written.
     *
     * Answered explicitly rather than falling through to "unknown action", so an
     * admin page still open from before the deploy gets a sentence, not a shrug.
     */
    if (action === 'settle-discount') {
      return res.status(410).json({
        success: false,
        error: 'Card fee waivers are no longer used: a booking now states what a direct payment owes.',
      });
    }

    if (action === 'delete-charge') {
      const chargeId = typeof req.body?.charge_id === 'string' ? req.body.charge_id.trim() : '';
      if (!chargeId) return res.status(400).json({ success: false, error: 'charge_id required' });
      /**
       * The insurance charge belongs to the insurance record, which points at
       * it. Deleting it from here left that pointer dangling, and the next
       * change to the policy then updated nothing, so the policy was never
       * billed again while the panel said it had been.
       */
      const linked = (await sql`
        select insurance_charge_id from client_portals where id = ${id} limit 1
      `) as Array<{ insurance_charge_id: string | null }>;
      if (linked[0]?.insurance_charge_id === chargeId) {
        return res.status(409).json({
          success: false,
          error: 'This is the event insurance charge. Change or remove it from the Insurance panel, so the policy and the charge stay together.',
        });
      }
      const { chargesTotal } = await writeWithRecompute(
        sql,
        id,
        [
          ...(recording
            ? [
                sql`
                  insert into money_history (client_portal_id, booking_name, actor, action, detail)
                  select ${id}, cp.client_display_name, ${actor}, 'charge_deleted',
                         jsonb_build_object('amount', pc.amount, 'reason', pc.reason, 'note', pc.note)
                  from portal_charges pc join client_portals cp on cp.id = pc.client_portal_id
                  where pc.id = ${chargeId} and pc.client_portal_id = ${id}
                `,
              ]
            : []),
          sql`delete from portal_charges where id = ${chargeId} and client_portal_id = ${id}`,
        ],
        { charges: true },
      );
      return respondWithCharges(sql, id, res, chargesTotal);
    }

    if (action === 'add-charge') {
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: 'amount must be a positive number' });
      }
      if (amount > MAX_MANUAL_AMOUNT) {
        return res.status(400).json({ success: false, error: 'That charge is larger than any booking here. Check the amount.' });
      }
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (reason === 'insurance') {
        return res.status(400).json({
          success: false,
          error: 'Insurance is charged from the Insurance panel, so the policy and its charge stay linked.',
        });
      }
      if (!CHARGE_REASONS.has(reason)) {
        return res
          .status(400)
          .json({ success: false, error: 'reason must be overtime, expense or other' });
      }
      const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null;
      const chargedAt = parseWhen(req.body?.charged_at);

      const { chargesTotal } = await writeWithRecompute(
        sql,
        id,
        [
          sql`
            insert into portal_charges (client_portal_id, amount, reason, note, charged_at)
            values (${id}, ${amount}, ${reason}, ${note || null}, ${chargedAt})
          `,
          ...(recording ? [historyInsert(sql, id, actor, 'charge_added', { amount, reason, note })] : []),
        ],
        { charges: true },
      );
      return respondWithCharges(sql, id, res, chargesTotal);
    }

    if (action === 'history') {
      return res.status(200).json({ success: true, history: await readHistory(sql, id) });
    }

    return res
      .status(400)
      .json({ success: false, error: 'action must be add, delete, add-charge, delete-charge or history' });
  } catch (err) {
    console.error('[admin/payment-log] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
