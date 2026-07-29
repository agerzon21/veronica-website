/**
 * Admin: reset the unread_count on a conversation to 0.
 *
 * POST { password, conversationId }
 *   → 200 { success }
 *   → 400 missing conversationId
 *   → 401 wrong password
 *   → 404 no such conversation
 *
 * Called by the inbox UI when Vero opens a conversation. Purely a
 * UX signal — no permission gating beyond admin (Vero opening her
 * own inbox marks it as read; that's the whole flow).
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

  const conversationId =
    typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
  if (!conversationId) {
    return res.status(400).json({ success: false, error: 'conversationId is required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      UPDATE conversations
      SET unread_count = 0, updated_at = NOW()
      WHERE id = ${conversationId}
      RETURNING id
    `) as Array<{ id: string }>;

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/messages-mark-read] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
