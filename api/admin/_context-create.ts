/**
 * Admin: create a new ai_context row.
 *
 * POST { password, category, label, content, active?, sort_order? }
 *   → 200 { success, context }
 *   → 400 missing/invalid fields
 *   → 401 wrong password
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

const MAX_CATEGORY_LEN = 60;
const MAX_LABEL_LEN = 120;
const MAX_CONTENT_LEN = 4000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  const active = req.body?.active === false ? false : true;
  const sortOrder = typeof req.body?.sort_order === 'number' ? req.body.sort_order : 0;

  if (!category) return res.status(400).json({ success: false, error: 'category is required' });
  if (category.length > MAX_CATEGORY_LEN) return res.status(400).json({ success: false, error: 'category too long' });
  if (!label) return res.status(400).json({ success: false, error: 'label is required' });
  if (label.length > MAX_LABEL_LEN) return res.status(400).json({ success: false, error: 'label too long' });
  if (!content.trim()) return res.status(400).json({ success: false, error: 'content is required' });
  if (content.length > MAX_CONTENT_LEN) return res.status(400).json({ success: false, error: 'content too long' });

  try {
    const sql = getDb();
    const rows = (await sql`
      INSERT INTO ai_context (category, label, content, active, sort_order)
      VALUES (${category}, ${label}, ${content}, ${active}, ${sortOrder})
      RETURNING id, category, label, content, active, sort_order, created_at, updated_at
    `) as Array<{
      id: string;
      category: string;
      label: string;
      content: string;
      active: boolean;
      sort_order: number;
      created_at: string;
      updated_at: string;
    }>;

    return res.status(200).json({ success: true, context: rows[0] });
  } catch (err) {
    console.error('[admin/context-create] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
