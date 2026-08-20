/**
 * Admin: update an existing ai_context row.
 *
 * POST { password, id, category?, label?, content?, active?, sort_order? }
 *   → 200 { success, context }
 *   → 400 missing id / invalid fields
 *   → 401 wrong password
 *   → 404 no such row
 *
 * Only fields provided in the request are updated (partial patch).
 * The updated_at column auto-bumps via trigger (see migration 005).
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

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!id) return res.status(400).json({ success: false, error: 'id is required' });

  // Read + validate any provided fields. Fields not present in the
  // request are left as-is via COALESCE below.
  let category: string | null = null;
  let label: string | null = null;
  let content: string | null = null;
  let active: boolean | null = null;
  let sortOrder: number | null = null;

  if (req.body?.category !== undefined) {
    if (typeof req.body.category !== 'string') return res.status(400).json({ success: false, error: 'category must be a string' });
    category = req.body.category.trim();
    if (!category) return res.status(400).json({ success: false, error: 'category cannot be empty' });
    if (category.length > MAX_CATEGORY_LEN) return res.status(400).json({ success: false, error: 'category too long' });
  }
  if (req.body?.label !== undefined) {
    if (typeof req.body.label !== 'string') return res.status(400).json({ success: false, error: 'label must be a string' });
    label = req.body.label.trim();
    if (!label) return res.status(400).json({ success: false, error: 'label cannot be empty' });
    if (label.length > MAX_LABEL_LEN) return res.status(400).json({ success: false, error: 'label too long' });
  }
  if (req.body?.content !== undefined) {
    if (typeof req.body.content !== 'string') return res.status(400).json({ success: false, error: 'content must be a string' });
    content = req.body.content;
    if (!content.trim()) return res.status(400).json({ success: false, error: 'content cannot be empty' });
    if (content.length > MAX_CONTENT_LEN) return res.status(400).json({ success: false, error: 'content too long' });
  }
  if (req.body?.active !== undefined) {
    if (typeof req.body.active !== 'boolean') return res.status(400).json({ success: false, error: 'active must be boolean' });
    active = req.body.active;
  }
  if (req.body?.sort_order !== undefined) {
    if (typeof req.body.sort_order !== 'number') return res.status(400).json({ success: false, error: 'sort_order must be number' });
    sortOrder = req.body.sort_order;
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      UPDATE ai_context
      SET
        category   = COALESCE(${category},   category),
        label      = COALESCE(${label},      label),
        content    = COALESCE(${content},    content),
        active     = COALESCE(${active},     active),
        sort_order = COALESCE(${sortOrder},  sort_order)
      WHERE id = ${id}
        -- source='system' rows are OUR documentation of how the admin
        -- panel works (migration 018). They are not Vero's business
        -- knowledge and must not be editable from the Context tab —
        -- otherwise the assistant's own instructions can be rewritten by
        -- accident, and nobody notices until it starts answering wrong.
        AND source <> 'system'
      RETURNING id, category, label, content, active, source, sort_order, created_at, updated_at
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

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Context entry not found' });
    }

    return res.status(200).json({ success: true, context: rows[0] });
  } catch (err) {
    console.error('[admin/context-update] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
