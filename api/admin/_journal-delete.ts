/**
 * Admin: delete a Journal post. Superadmin only — same principle as
 * portal-delete: destructive irreversible action, keep it out of
 * Vero's reach so an accidental click doesn't lose weeks of writing.
 *
 * POST { password, id }
 *   → 200 { success }
 *   → 400 missing id
 *   → 401 bad password
 *   → 403 not superadmin
 *   → 404 no such post
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

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!id) return res.status(400).json({ success: false, error: 'id is required' });

  try {
    const sql = getDb();
    const rows = (await sql`
      DELETE FROM journal_posts WHERE id = ${id} RETURNING id
    `) as Array<{ id: string }>;

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/journal-delete] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
