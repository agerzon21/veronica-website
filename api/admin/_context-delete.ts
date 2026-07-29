/**
 * Admin: delete an ai_context row. Available to admin + super —
 * this isn't a super-only op because Vero legitimately owns the
 * assistant's content. The seed rows can be recreated from the
 * migration file if she deletes them accidentally.
 *
 * POST { password, id }
 *   → 200 { success }
 *   → 400 missing id
 *   → 401 wrong password
 *   → 404 no such row
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
      DELETE FROM ai_context WHERE id = ${id} RETURNING id
    `) as Array<{ id: string }>;

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Context entry not found' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/context-delete] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
