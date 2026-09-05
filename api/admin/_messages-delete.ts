/**
 * Admin: delete a conversation outright.
 *
 * POST { password, conversationId }
 *   → 200 { success, deletedMessages }
 *   → 400 missing conversationId
 *   → 401 wrong password
 *   → 404 no such conversation
 *
 * Distinct from messages-reset, which wipes the MESSAGES but keeps the
 * conversation row so the same Instagram account lands back in it — the
 * behaviour Vero relies on to re-test the AI without a second test
 * account. Useful for that, useless for tidying: it leaves an empty row
 * in the inbox forever with no way to remove it. This is that way.
 *
 * ─── What this actually destroys ────────────────────────────────
 *
 *   messages              — CASCADE from the FK (migration 005). Gone.
 *   conversation_summary  — columns on the row itself. Gone.
 *   ai_reply_intents      — CASCADE. Gone, which is correct: the claim
 *                           is a per-conversation lock with no meaning
 *                           once the conversation doesn't exist.
 *
 * ─── What survives, deliberately ────────────────────────────────
 *
 *   contact_submissions   — the lead record keeps its name, email,
 *                           shoot type, date and location;
 *                           conversation_id is ON DELETE SET NULL
 *                           (migration 017). Deleting a cluttered thread
 *                           must not destroy the enquiry that created
 *                           it — those are the business's records.
 *   client_portals        — untouched. The FK points the other way
 *                           (conversations → portals), so removing a
 *                           conversation cannot affect a real client.
 *
 * Admin-level, matching messages-reset. This is Vero's inbox; needing
 * Alex to tidy it would guarantee it never gets tidied. The safeguard is
 * the confirm dialog, which names the contact and the message count.
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

    const [existing] = (await sql`
      SELECT c.id, c.platform, c.contact_name, c.external_user_id,
             (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count
      FROM conversations c
      WHERE c.id = ${conversationId}
      LIMIT 1
    `) as Array<{
      id: string;
      platform: string;
      contact_name: string | null;
      external_user_id: string;
      message_count: number;
    }>;

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Single statement — messages and any reply-intent claim cascade.
    // The assistant transcript for this thread is keyed by slot, not by a
    // foreign key, so nothing cascades. Without this the row outlives the
    // conversation it discusses, forever.
    await sql`DELETE FROM assistant_chats WHERE slot = ${'conv:' + String(conversationId).toLowerCase()}`;
    await sql`DELETE FROM conversations WHERE id = ${conversationId}`;

    console.log(
      `[admin/messages-delete] deleted ${existing.platform} conversation ` +
        `"${existing.contact_name ?? existing.external_user_id}" ` +
        `(${existing.message_count} messages)`,
    );

    return res
      .status(200)
      .json({ success: true, deletedMessages: existing.message_count });
  } catch (err) {
    console.error('[admin/messages-delete] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
