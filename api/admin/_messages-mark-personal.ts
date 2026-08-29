/**
 * Admin: mark a conversation as Personal (friends & family), or unmark it.
 *
 * POST { password, conversationId, personal: boolean }
 *   → 200 { success, personal }
 *   → 400 missing fields · 401 wrong password · 404 no such conversation
 *
 * Vero's business Instagram is also the account her friends and family DM her
 * on. Those threads are not work: the assistant must not answer them, and they
 * should not sit at the top of the queue looking like a client needs a reply.
 *
 * Unlike promotional, NOTHING classifies this automatically and nothing ever
 * will — see db/migrations/024-personal-flag.sql. This endpoint is the only
 * writer of the column, which is why it is a plain boolean with no "no opinion"
 * state.
 *
 * Because 005-messaging.sql has UNIQUE (platform, external_user_id), a
 * conversation IS the sender, so this covers everything they send in future —
 * their next message routes into this same row, already marked.
 *
 * TWO HALVES, and only one of them is load-bearing:
 *   - The is_personal gate in api/_ai-reply.ts is what actually stops the
 *     assistant replying. That is the half that matters.
 *   - The ai_enabled write here is the VISIBLE half: it drives the header
 *     switch and the "Needs Vero" badge so the UI agrees with reality.
 *
 * Caveat, inherited deliberately from _messages-mark-promotional.ts: unmarking
 * sets ai_enabled = TRUE unconditionally. ai_enabled has several other writers
 * (_messages-toggle-ai.ts, _messages-summary.ts, and the escalation path in
 * _ai-reply.ts), so unmarking a thread that escalation had deliberately
 * disarmed will silently re-arm it. Consistency with promotional beats
 * cleverness here, and the owner chose this explicitly — but it is a real edge,
 * not an absence of one.
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

  const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId : '';
  const personal = req.body?.personal;

  if (!conversationId || typeof personal !== 'boolean') {
    return res
      .status(400)
      .json({ success: false, error: 'conversationId and personal are required' });
  }

  try {
    const sql = getDb();

    // Marking switches the assistant off; unmarking switches it back on, on the
    // same reasoning as promotional — un-hiding is an explicit statement that
    // the thread is real, so leaving the assistant off would make her wonder
    // why nothing drafts.
    const rows = personal
      ? ((await sql`
          UPDATE conversations
          SET is_personal = TRUE, ai_enabled = FALSE, updated_at = NOW()
          WHERE id = ${conversationId}
          RETURNING id, contact_name, external_user_id
        `) as Array<{ id: string; contact_name: string | null; external_user_id: string }>)
      : ((await sql`
          UPDATE conversations
          SET is_personal = FALSE, ai_enabled = TRUE, updated_at = NOW()
          WHERE id = ${conversationId}
          RETURNING id, contact_name, external_user_id
        `) as Array<{ id: string; contact_name: string | null; external_user_id: string }>);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Bin any AI draft that was waiting. Once the thread is personal the draft
    // is noise, and leaving it would keep the "AI wrote a reply" banner on a
    // thread she has just moved out of the work queue.
    if (personal) {
      await sql`
        DELETE FROM messages
        WHERE conversation_id = ${conversationId} AND status = 'draft'
      `;
    }

    console.log(
      `[admin/messages-mark-personal] ${personal ? 'marked' : 'unmarked'} ` +
        `"${rows[0].contact_name ?? rows[0].external_user_id}"`,
    );

    return res.status(200).json({ success: true, personal });
  } catch (err) {
    console.error('[admin/messages-mark-personal] failed:', err);
    return res.status(500).json({ success: false, error: 'Could not update conversation' });
  }
}
