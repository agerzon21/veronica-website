/**
 * Admin: hard-delete a wedding vendor. Super only, like every other
 * destructive admin action; regular admins hide vendors by toggling
 * `active` off through the upsert instead.
 *
 * POST { password, id } → { success }
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
  const superCheck = requireSuper(auth.level);
  if (!superCheck.ok) {
    return res.status(superCheck.status).json({ success: false, error: superCheck.error });
  }

  const id = req.body?.id;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ success: false, error: 'id is required' });
  }

  try {
    const sql = getDb();
    const rows = await sql`DELETE FROM wedding_vendors WHERE id = ${id} RETURNING id`;
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/weddings-vendors-delete] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
