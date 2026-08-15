/**
 * Admin: "Wipe conversation" — test-reset for a single conversation.
 *
 * Super-admin only. Destructive. Deletes ALL messages for the given
 * conversation and clears the summary cache + activity counters on the
 * conversation row itself, WITHOUT removing the conversation record.
 * The row (external_user_id, contact_name/handle/pic, ai_enabled, notes,
 * linked_client_portal_id, created_at, updated_at) is preserved so that
 * when Vero DMs the same IG account again the next inbound webhook
 * lands right back into this same conversation and she can test the AI
 * assistant as if it were a fresh account.
 *
 * POST { password, conversationId }
 *   → 200 { success, deletedMessages }
 *   → 400 missing conversationId
 *   → 401 wrong password
 *   → 403 non-super
 *   → 404 no such conversation
 *
 * The two writes (DELETE messages + UPDATE conversation) are wrapped
 * in a Postgres transaction so a partial reset (messages gone but
 * summary still cached) cannot happen — the neon serverless driver
 * exposes .transaction() for exactly this.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Both admin (Vero) and super (Alex) can use this. Vero uses it
  // heavily as part of her assistant-tuning workflow: reset a test
  // conversation to a clean slate, send new probe messages, see how
  // the (freshly-configured) AI responds without carryover from
  // previous test runs. The UI's ConfirmDialog is the safeguard
  // against accidental clicks — server just enforces admin auth.
  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const conversationId =
    typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
  if (!conversationId) {
    return res.status(400).json({ success: false, error: 'conversationId is required' });
  }

  try {
    const sql = getDb();

    // Confirm the conversation exists before doing anything destructive.
    // Returning 404 instead of a silent "success, 0 messages deleted"
    // gives the caller a real error to surface.
    const existing = (await sql`
      SELECT id FROM conversations WHERE id = ${conversationId}
    `) as Array<{ id: string }>;
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Transaction: both writes must succeed together, else neither.
    // A partial reset (rows deleted but summary cache still stale)
    // would silently break the "test as if fresh" contract.
    const [deletedRows] = await sql.transaction([
      sql`
        DELETE FROM messages
        WHERE conversation_id = ${conversationId}
        RETURNING id
      `,
      sql`
        UPDATE conversations
        SET summary_json = NULL,
            summary_message_id = NULL,
            summary_generated_at = NULL,
            last_message_at = NULL,
            unread_count = 0,
            updated_at = NOW()
        WHERE id = ${conversationId}
      `,
    ]);

    const deletedMessages = Array.isArray(deletedRows) ? deletedRows.length : 0;
    console.log(
      `[admin/messages-reset] Reset conversation ${conversationId}, deleted ${deletedMessages} messages`,
    );

    return res.status(200).json({ success: true, deletedMessages });
  } catch (err) {
    console.error('[admin/messages-reset] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
