/**
 * Admin: flip the ai_enabled toggle on a single conversation.
 *
 * POST { password, conversationId, enabled: boolean }
 *   → 200 { success, ai_enabled }
 *   → 400 missing fields
 *   → 401 wrong password
 *   → 404 no such conversation
 *
 * When ai_enabled=false, the AI reply engine (api/_ai-reply.ts) short-
 * circuits at the per-conversation guardrail check without generating.
 * Vero uses this to take over a thread manually. Both admin and super
 * can flip it.
 *
 * The booking-intent / spam / wrap-up escalations in the AI engine
 * also flip this to false automatically — those escalations converge
 * on the same signal ("this thread needs Vero"). Vero can re-enable
 * from the inbox when she wants the AI back in the loop.
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

  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'enabled must be a boolean' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      UPDATE conversations
      SET ai_enabled = ${enabled}, updated_at = NOW()
      WHERE id = ${conversationId}
      RETURNING ai_enabled
    `) as Array<{ ai_enabled: boolean }>;

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    return res.status(200).json({ success: true, ai_enabled: rows[0].ai_enabled });
  } catch (err) {
    console.error('[admin/messages-toggle-ai] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
