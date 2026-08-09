/**
 * Admin: list all ai_context rows so Vero can edit them via the
 * Assistant tab UI. Returns everything (active + inactive) grouped
 * by category on the client side.
 *
 * POST { password }
 *   → 200 { success, level, contexts }
 *   → 401 wrong password
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

interface ContextRow {
  id: string;
  category: string;
  label: string;
  content: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, category, label, content, active, source, sort_order, created_at, updated_at
      FROM ai_context
      ORDER BY category, sort_order, created_at
    `) as ContextRow[];

    return res.status(200).json({
      success: true,
      level: auth.level,
      contexts: rows,
    });
  } catch (err) {
    console.error('[admin/context-list] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
