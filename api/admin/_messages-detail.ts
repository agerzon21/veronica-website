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
  /**
   * The portal this thread belongs to, by the explicit link OR by email.
   * linked_client_portal_id remains the raw column; this is the resolved one,
   * and it is the one anything acting on the client should use.
   */
  client_portal_id: string | null;
  /** Their number on file, so the thread knows whether to offer one it finds. */
  linked_client_phone: string | null;
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
        c.linked_client_portal_id, c.notes, c.client_facts,
        c.last_message_at, c.unread_count, c.created_at,
        -- The explicit link first, then the email match. Both are needed.
        COALESCE(cp.id, cpe.id) AS client_portal_id,
        COALESCE(cp.client_display_name, cpe.client_display_name) AS linked_client_display_name,
        -- Whether this client already has a number on file, so the thread can
        -- offer to capture one it finds and stay quiet when it should.
        COALESCE(cp.client_phone, cpe.client_phone) AS linked_client_phone
      FROM conversations c
      LEFT JOIN client_portals cp ON cp.id = c.linked_client_portal_id
      /*
       * THE EMAIL FALLBACK, and it carries most of the weight.
       *
       * conversations.linked_client_portal_id is written in exactly one place,
       * when a portal is created FROM a thread, and nothing backfills it. On
       * the live database that is 4 of 19 portals: a client whose portal was
       * made from the Clients tab has no link at all, so anything keyed on it
       * alone is silent for the other fifteen.
       *
       * client_portals carries a UNIQUE index on LOWER(client_email) and an
       * email conversation's external_user_id IS the sender's lowercased
       * address (api/_inbox-record.ts lowercases before the upsert), so this
       * join resolves to at most one row. Restricted to the email platform
       * because an Instagram external_user_id is an opaque IGSID that must
       * never be compared against an address.
       */
      LEFT JOIN client_portals cpe
        ON cp.id IS NULL
       AND c.platform = 'email'
       AND LOWER(cpe.client_email) = LOWER(c.external_user_id)
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
