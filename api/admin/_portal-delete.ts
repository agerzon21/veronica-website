/**
 * Super-admin only: hard-delete a portal and all dependent records.
 *
 * POST { password, id }
 *   → 200 { success }
 *   → 401 on bad admin password
 *   → 403 if password is regular admin (not super)
 *   → 404 if portal not found
 *
 * The DB schema cascades the delete to payment_entries (the FK has
 * ON DELETE CASCADE). The signed-contract PDF stored in Vercel Blob
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
    const rows = (await sql`
      delete from client_portals where id = ${id} returning id
    `) as Array<{ id: string }>;
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Portal not found' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/portal-delete] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
