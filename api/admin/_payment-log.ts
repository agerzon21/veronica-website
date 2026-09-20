/**
 * Admin: log money in (payment entries) and money owed (charges) against a
 * portal, and recompute the two totals the balance is derived from.
 *
 * POST {
 *   password, id,
 *   action: 'add' | 'delete' | 'add-charge' | 'delete-charge',
 *
 *   // add:
 *   amount?, method?, note?, paid_at?
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

/**
 * The reasons a charge can carry. Same three the table CHECKs, repeated here
 * so a typo comes back as a 400 naming the valid values rather than a 500
 * from a constraint violation. Each one is a label the client reads.
 */
const CHARGE_REASONS = new Set(['overtime', 'expense', 'other']);

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

async function recomputeAndReturn(sql: ReturnType<typeof getDb>, portalId: string, res: VercelResponse) {
  /**
   * One statement, so the sum and the write cannot be separated.
   *
   * This was a SELECT sum followed by a separate UPDATE, outside any
   * transaction and with no row lock. Two writers interleaving between the two
   * statements both read the same total and both write it, so one payment
   * silently vanishes from paid_to_date while its row sits in the table.
   *
   * Today that is nearly theoretical, because the only writer is Vero pressing
   * a button. It stops being theoretical the moment a card webhook can write
   * at the same time as she does, which is exactly the shape of a client
   * paying from their phone while she logs the cash they handed her.
   *
   * Still a full re-sum rather than an increment. Re-summing is self-healing:
   * delete a bad row and the next recompute is correct. An increment carries
   * its error forever.
   */
  const updated = (await sql`
    update client_portals
    set paid_to_date = (
          select coalesce(sum(amount), 0)
          from payment_entries
          where client_portal_id = ${portalId}
        ),
        updated_at = now()
    where id = ${portalId}
    returning paid_to_date
  `) as Array<{ paid_to_date: string }>;
  const newTotal = parseFloat(updated[0]?.paid_to_date ?? '0');

  const payments = (await sql`
    select id, amount, method, note, paid_at, created_at
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
  }>;

  return res.status(200).json({
    success: true,
    paid_to_date: newTotal,
    payments: payments.map((p) => ({
      id: p.id,
      amount: parseFloat(p.amount),
      method: p.method,
      note: p.note,
      paid_at: p.paid_at,
      created_at: p.created_at,
    })),
  });
}

/** The charges half of the same bookkeeping. Deliberately shaped like recomputeAndReturn above. */
async function recomputeChargesAndReturn(
  sql: ReturnType<typeof getDb>,
  portalId: string,
  res: VercelResponse,
) {
  // Same single-statement re-sum as recomputeAndReturn above, and for the same
  // reason: a charge added while a payment lands must not lose either one.
  const updated = (await sql`
    update client_portals
    set charges_total = (
          select coalesce(sum(amount), 0)
          from portal_charges
          where client_portal_id = ${portalId}
        ),
        updated_at = now()
    where id = ${portalId}
    returning charges_total
  `) as Array<{ charges_total: string }>;
  const newTotal = parseFloat(updated[0]?.charges_total ?? '0');

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
    charges_total: newTotal,
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

    if (action === 'delete') {
      const entryId = typeof req.body?.entry_id === 'string' ? req.body.entry_id.trim() : '';
      if (!entryId) return res.status(400).json({ success: false, error: 'entry_id required' });
      await sql`delete from payment_entries where id = ${entryId} and client_portal_id = ${id}`;
      return recomputeAndReturn(sql, id, res);
    }

    if (action === 'add') {
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: 'amount must be a positive number' });
      }
      const method = typeof req.body?.method === 'string' ? req.body.method.trim() : null;
      const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null;
      // Accept either an ISO timestamp or YYYY-MM-DD (from a date input).
      const paidAt = parseWhen(req.body?.paid_at);

      await sql`
        insert into payment_entries (client_portal_id, amount, method, note, paid_at)
        values (${id}, ${amount}, ${method || null}, ${note || null}, ${paidAt})
      `;
      return recomputeAndReturn(sql, id, res);
    }

    if (action === 'delete-charge') {
      const chargeId = typeof req.body?.charge_id === 'string' ? req.body.charge_id.trim() : '';
      if (!chargeId) return res.status(400).json({ success: false, error: 'charge_id required' });
      await sql`delete from portal_charges where id = ${chargeId} and client_portal_id = ${id}`;
      return recomputeChargesAndReturn(sql, id, res);
    }

    if (action === 'add-charge') {
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: 'amount must be a positive number' });
      }
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (!CHARGE_REASONS.has(reason)) {
        return res
          .status(400)
          .json({ success: false, error: 'reason must be overtime, expense or other' });
      }
      const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null;
      const chargedAt = parseWhen(req.body?.charged_at);

      await sql`
        insert into portal_charges (client_portal_id, amount, reason, note, charged_at)
        values (${id}, ${amount}, ${reason}, ${note || null}, ${chargedAt})
      `;
      return recomputeChargesAndReturn(sql, id, res);
    }

    return res
      .status(400)
      .json({ success: false, error: 'action must be add, delete, add-charge or delete-charge' });
  } catch (err) {
    console.error('[admin/payment-log] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
