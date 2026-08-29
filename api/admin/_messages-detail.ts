/**
 * Admin: fetch a single conversation with its full message history.
 *
 * POST { password, conversationId }
 *   → 200 { success, conversation, messages }
 *   → 400 missing conversationId
 *   → 401 wrong password
 *   → 404 no such conversation
 *
 * Returns all messages in the conversation (oldest → newest, ready
 * for direct render). No pagination for MVP — conversations are
 * expected to be short; we'll add pagination if any grow past ~200
 * messages.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

interface ConversationRow {
  id: string;
  platform: string;
  external_user_id: string;
  contact_name: string | null;
  contact_handle: string | null;
  contact_profile_pic_url: string | null;
  ai_enabled: boolean;
  // Manually marked as marketing/unrelated by Vero (migration 021).
  is_promotional: boolean;
  is_personal: boolean;
  linked_client_portal_id: string | null;
  linked_client_display_name: string | null;
  notes: string;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
}

interface MessageRow {
  id: string;
  direction: 'inbound' | 'outbound';
  sender: 'contact' | 'ai' | 'human';
  body: string;
  external_message_id: string | null;
  sent_at: string;
  ai_model: string | null;
  // Email-only fields (migration 016). NULL for Instagram/other
  // platforms; the admin UI only surfaces them when non-null.
  subject: string | null;
  in_reply_to: string | null;
  // How the message arrived, distinct from the conversation's platform
  // (which is how we reply). 'form' for contact-form submissions.
  channel: string;
  // 'sent' | 'draft' | 'failed' — a draft is an AI reply awaiting
  // Vero's approval, never delivered. See migration 019.
  status: string;
  // Resend's cached last_event for outbound email ('delivered',
  // 'bounced', …). NULL for Instagram and for anything not yet polled.
  delivery_state: string | null;
}

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

    const convoRows = (await sql`
      SELECT
        c.id, c.platform, c.external_user_id,
        c.contact_name, c.contact_handle,
        -- Prefer the permanent mirrored copy; fall back to Meta's pre-signed
        -- URL for rows the mirror has not reached yet. Aliased to the original
        -- column name so every consumer is unchanged.
        COALESCE(c.contact_avatar_url, c.contact_profile_pic_url) AS contact_profile_pic_url,
        c.ai_enabled, c.is_promotional, c.is_personal,
        c.is_personal, c.linked_client_portal_id, c.notes,
        c.last_message_at, c.unread_count, c.created_at,
        cp.client_display_name AS linked_client_display_name
      FROM conversations c
      LEFT JOIN client_portals cp ON cp.id = c.linked_client_portal_id
      WHERE c.id = ${conversationId}
      LIMIT 1
    `) as ConversationRow[];

    if (convoRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const messageRows = (await sql`
      SELECT
        id, direction, sender, body,
        external_message_id, sent_at, ai_model,
        subject, in_reply_to, channel, status, delivery_state
      FROM messages
      WHERE conversation_id = ${conversationId}
      ORDER BY sent_at ASC
    `) as MessageRow[];

    return res.status(200).json({
      success: true,
      conversation: convoRows[0],
      messages: messageRows,
    });
  } catch (err) {
    console.error('[admin/messages-detail] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
