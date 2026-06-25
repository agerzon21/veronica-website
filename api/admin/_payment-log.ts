/**
 * Admin: log a payment entry against a portal and recompute paid_to_date.
 *
 * POST {
 *   password, id,
 *   action: 'add' | 'delete',
 *
 *   // add:
 *   amount?, method?, note?, paid_at?
 *
 *   // delete:
 *   entry_id?
 * }
 *   → 200 { success, paid_to_date, payments[] }
 *
 * Why we materialize paid_to_date on the portal row instead of computing
 * via sum() at read time: paid_to_date is read on every portal load
 * (for the balance display), but updated infrequently. Materializing
 * saves the sum() join on every read; the recompute on add/delete is
 * cheap because we already touch the row.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

async function recomputeAndReturn(sql: ReturnType<typeof getDb>, portalId: string, res: VercelResponse) {
  const sumRows = (await sql`
    select coalesce(sum(amount), 0) as total
    from payment_entries
    where client_portal_id = ${portalId}
  `) as Array<{ total: string }>;
  const newTotal = parseFloat(sumRows[0]?.total ?? '0');
  await sql`update client_portals set paid_to_date = ${newTotal}, updated_at = now() where id = ${portalId}`;

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
      const paidAtRaw = typeof req.body?.paid_at === 'string' ? req.body.paid_at.trim() : '';
      // Accept either an ISO timestamp or YYYY-MM-DD (from a date input).
      // If just a date, treat as start-of-day UTC.
      let paidAt: string;
      if (paidAtRaw) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(paidAtRaw)) {
          paidAt = new Date(`${paidAtRaw}T00:00:00Z`).toISOString();
        } else {
          const d = new Date(paidAtRaw);
          paidAt = Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        }
      } else {
        paidAt = new Date().toISOString();
      }

      await sql`
        insert into payment_entries (client_portal_id, amount, method, note, paid_at)
        values (${id}, ${amount}, ${method || null}, ${note || null}, ${paidAt})
      `;
      return recomputeAndReturn(sql, id, res);
    }

    return res.status(400).json({ success: false, error: 'action must be add or delete' });
  } catch (err) {
    console.error('[admin/payment-log] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
