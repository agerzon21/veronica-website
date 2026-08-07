/**
 * Admin: soft-delete a gallery photo. Sets deleted_at rather than
 * removing the row so a "restore" flow stays possible (Vero
 * accidentally trashes a photo, we can un-delete from the DB).
 *
 * If the file is still present in the Drive folder, the next sync
 * cron run will restore it (see _gallery-sync.ts — deleted rows
 * with matching drive_file_id get resurrected). So the delete
 * only "sticks" if Vero also removes the file from Drive. For a
 * true forever-delete: superadmin can hard-delete via a separate
 * flow later (not built yet — not needed for MVP).
 *
 * POST { password, id }
 *   → 200 { success }
 *   → 400 missing id
 *   → 401 wrong password
 *   → 404 row not found
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

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!id) return res.status(400).json({ success: false, error: 'id is required' });

  try {
    const sql = getDb();
    const rows = (await sql`
      UPDATE gallery_photos
      SET deleted_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id
    `) as Array<{ id: string }>;

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Row not found or already deleted' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/gallery-delete] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
