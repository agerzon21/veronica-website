/**
 * Admin: mark a conversation as promotional (or unmark it).
 *
 * POST { password, conversationId, promotional: boolean }
 *   → 200 { success, promotional }
 *   → 400 missing fields
 *   → 401 wrong password
 *   → 404 no such conversation
 *
 * Folds the thread out of the main inbox list. Because email
 * conversations are keyed on the sender's address, this also covers
 * everything that sender writes in future — their next message routes
 * into this same row, which is already marked.
 *
 * Marking also switches the AI off for the thread. There is no value in
 * drafting a warm reply to a marketing blast, and the drafts were
 * visible in the inbox preview, which made a thread Vero had never
 * opened look like she had answered it.
 *
 * Unmarking sets FALSE — an explicit "show this", which overrides an AI
 * classification that would otherwise keep folding the thread — and
 * switches the AI back on, since un-hiding is a statement that the
 * thread is real.
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
  if (typeof req.body?.promotional !== 'boolean') {
    return res.status(400).json({ success: false, error: 'promotional must be a boolean' });
  }
  const promotional: boolean = req.body.promotional;

  try {
    const sql = getDb();

    // FALSE is an explicit "show this", not an absence of opinion — it
    // has to override an auto-classification that would otherwise keep
    // folding the thread. NULL means "no opinion, let the classifier
    // decide" and is only ever set by migration 022.
    //
    // Unmarking re-enables AI. That's the reverse of what this did
    // originally, and it's right: un-hiding is an explicit statement
    // that the thread is real, so leaving the assistant switched off
    // would make her wonder why nothing drafts. Marking still switches
    // it off.
    const rows = promotional
      ? ((await sql`
          UPDATE conversations
          SET is_promotional = TRUE, ai_enabled = FALSE, updated_at = NOW()
          WHERE id = ${conversationId}
          RETURNING id, contact_name, external_user_id
        `) as Array<{ id: string; contact_name: string | null; external_user_id: string }>)
      : ((await sql`
          UPDATE conversations
          SET is_promotional = FALSE, ai_enabled = TRUE, updated_at = NOW()
          WHERE id = ${conversationId}
          RETURNING id, contact_name, external_user_id
        `) as Array<{ id: string; contact_name: string | null; external_user_id: string }>);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Drop any AI draft that was waiting. Once the thread is marked
    // promotional the draft is noise, and leaving it would keep the
    // "AI wrote a reply" banner on a thread she has just binned.
    if (promotional) {
      await sql`
        DELETE FROM messages
        WHERE conversation_id = ${conversationId} AND status = 'draft'
      `;
    }

    console.log(
      `[admin/messages-mark-promotional] ${promotional ? 'marked' : 'unmarked'} ` +
        `"${rows[0].contact_name ?? rows[0].external_user_id}"`,
    );
    return res.status(200).json({ success: true, promotional });
  } catch (err) {
    console.error('[admin/messages-mark-promotional] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
