/**
 * Admin: list ALL wedding vendors, active and hidden alike (the public
 * endpoint filters to active; the admin needs to see what's hidden to
 * un-hide it). Ordered the way the page displays them.
 *
 * POST { password } → { success, level, vendors: [...] }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  try {
    const sql = getDb();
    const vendors = await sql`
      SELECT id, name, category, blurb, website_url, instagram, photo_url,
             sort_order, active, created_at, updated_at
      FROM wedding_vendors
      ORDER BY sort_order, created_at
    `;
    return res.status(200).json({ success: true, level: auth.level, vendors });
  } catch (err) {
    console.error('[admin/weddings-vendors-list] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
