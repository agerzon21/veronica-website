/**
 * Admin: throw away the AI's pending draft on a conversation.
 *
 * POST { password, conversationId }
 *   → 200 { success, discarded }   number of draft rows removed
 *   → 400 missing conversationId
 *   → 401 wrong password
 *
 * Admin-level. Discarding a draft the AI wrote is an ordinary editorial
 * decision, not an administrative one.
 *
 * Deletes rather than marking the row rejected. There is no product
 * question a rejected-draft archive answers today, and keeping them
 * would mean every query that walks a thread has to remember to exclude
 * them — the same footgun as leaving drafts visible to the reply
 * engine's dedup gate. If "why did the AI suggest that?" ever becomes a
 * real question, the right answer is an events table, not tombstones in
 * the message history.
 *
 * Sending a reply also clears the pending draft (see
 * api/_reply-delivery.ts). This endpoint is only for the case where Vero
 * wants the suggestion gone WITHOUT replying at all.
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
    const removed = (await sql`
      DELETE FROM messages
      WHERE conversation_id = ${conversationId} AND status = 'draft'
      RETURNING id
    `) as Array<{ id: string }>;

    console.log(
      `[admin/messages-draft-discard] removed ${removed.length} draft(s) from ${conversationId}`,
    );
    return res.status(200).json({ success: true, discarded: removed.length });
  } catch (err) {
    console.error('[admin/messages-draft-discard] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
