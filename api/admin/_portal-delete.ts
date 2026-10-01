/**
 * Super-admin only: hard-delete a portal and all dependent records.
 *
 * POST { password, id }
 *   → 200 { success }
 *   → 401 on bad admin password
 *   → 403 if password is regular admin (not super)
 *   → 404 if portal not found
 *
 * Refused while ANY payment is on record (see below). Otherwise the schema
 * cascades the delete to the booking's other dependent rows. The signed-contract PDF stored in Vercel Blob
 * is NOT deleted from the blob store — it's kept as a historical
 * record. If you need to scrub it too, do that out of band.
 *
 * Why this is super-only: deletion is irrecoverable. The regular
 * admin (Vero) shouldn't have a one-click way to nuke a client's
 * gallery URL, payment history, and signed contract reference all at
 * once. Common case "I made a typo when creating this row" is rare
 * and the row can just be edited.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin, requireSuper } from '../_admin-auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const sup = requireSuper(auth.level);
  if (!sup.ok) return res.status(sup.status).json({ success: false, error: sup.error });

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!id) return res.status(400).json({ success: false, error: 'id required' });

  try {
    const sql = getDb();
    /**
     * NEVER WITH MONEY ON IT. The foreign key cascades, so deleting a booking
     * used to delete its payment history with it, card payments included,
     * with nothing asking first. That destroyed the tax record, and it broke
     * Stripe going forward: a later refund or chargeback on one of those
     * payments found no original row and recorded nothing, and a checkout
     * still open for the booking was dropped.
     *
     * One statement, so a payment landing while this runs cannot slip in
     * between a check and the delete. Manual payments can be deleted first if
     * the booking really was a mistake; card payments cannot, by design, so a
     * booking that took a card payment stays.
     */
    const rows = (await sql`
      delete from client_portals
      where id = ${id}
        and not exists (select 1 from payment_entries where client_portal_id = ${id})
      returning id
    `) as Array<{ id: string }>;
    if (rows.length === 0) {
      const exists = (await sql`
        select
          (select count(*) from payment_entries where client_portal_id = ${id})::int as payments,
          (select count(*) from payment_entries where client_portal_id = ${id} and source = 'stripe')::int as card
        from client_portals where id = ${id}
      `) as Array<{ payments: number; card: number }>;
      if (exists.length === 0) {
        return res.status(404).json({ success: false, error: 'Portal not found' });
      }
      const { payments, card } = exists[0];
      return res.status(409).json({
        success: false,
        error:
          card > 0
            ? `This booking has ${card} card payment${card === 1 ? '' : 's'} on record, so it cannot be deleted. That money really moved; to give it back, refund it in Stripe.`
            : `This booking has ${payments} payment${payments === 1 ? '' : 's'} on record. Delete ${payments === 1 ? 'it' : 'them'} first if the booking really was a mistake, so the payment history is never lost by accident.`,
      });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/portal-delete] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
