/**
 * Admin: list all conversations with the metadata the inbox UI needs
 * to render the left rail (name, last-message preview, unread count,
 * ai_enabled state, linked client if any).
 *
 * Also returns the global AI kill switch state so the Messages tab
 * can show its "AI: On / Paused" indicator in a single fetch.
 *
 * POST { password }
 *   → 200 { success, level, globalAiState, conversations }
 *   → 401 wrong password
 *   → 405 non-POST
 *
 * Accepts both admin (Vero) and super (Alex) — Messages is a Vero-
 * facing tool.
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
  last_message_at: string | null;
  unread_count: number;
  linked_client_portal_id: string | null;
  linked_client_display_name: string | null;
  created_at: string;
  last_message_body: string | null;
  last_message_direction: 'inbound' | 'outbound' | null;
  last_message_sender: 'contact' | 'ai' | 'human' | null;
  // Cached AI triage verdict, if a summary has been generated. Used by
  // the inbox to fold promotional / unrelated mail out of the way.
  classification: string | null;
  is_promotional: boolean;
  has_draft: boolean;
}

const PREVIEW_MAX_CHARS = 120;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  try {
    const sql = getDb();

    // Global kill switch state — read once, return in the same
    // payload so the inbox doesn't need a separate roundtrip.
    const stateRows = (await sql`
      SELECT value FROM system_state WHERE key = 'messaging_ai_state' LIMIT 1
    `) as Array<{ value: string | null }>;
    const globalAiState = stateRows[0]?.value === 'off' ? 'off' : 'on';

    // Conversation list with the last message inlined via a LATERAL
    // join so we can render "Alex: sure, thanks!" previews without
    // a second query per row. LEFT JOIN on client_portals adds the
    // linked-client display name when the conversation has been
    // promoted to a real client (session 4 wires this up).
    const rows = (await sql`
      SELECT
        c.id, c.platform, c.external_user_id,
        c.contact_name, c.contact_handle,
        -- Prefer the permanent mirrored copy; fall back to Meta's pre-signed
        -- URL for rows the mirror has not reached yet. Aliased to the original
        -- column name so every consumer is unchanged.
        COALESCE(c.contact_avatar_url, c.contact_profile_pic_url) AS contact_profile_pic_url,
        c.ai_enabled, c.last_message_at, c.unread_count,
        c.linked_client_portal_id, c.created_at,
        cp.client_display_name AS linked_client_display_name,
        last_msg.body      AS last_message_body,
        last_msg.direction AS last_message_direction,
        last_msg.sender    AS last_message_sender,
        c.summary_json->>'classification' AS classification,
        c.is_promotional,
        EXISTS (
          SELECT 1 FROM messages d
          WHERE d.conversation_id = c.id AND d.status = 'draft'
        ) AS has_draft
      FROM conversations c
      LEFT JOIN client_portals cp ON cp.id = c.linked_client_portal_id
      LEFT JOIN LATERAL (
        SELECT body, direction, sender
        FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.sent_at DESC
        LIMIT 1
      ) last_msg ON TRUE
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
    `) as ConversationRow[];

    return res.status(200).json({
      success: true,
      level: auth.level,
      globalAiState,
      conversations: rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        external_user_id: r.external_user_id,
        contact_name: r.contact_name,
        contact_handle: r.contact_handle,
        contact_profile_pic_url: r.contact_profile_pic_url,
        ai_enabled: r.ai_enabled,
        last_message_at: r.last_message_at,
        unread_count: r.unread_count,
        linked_client_portal_id: r.linked_client_portal_id,
        linked_client_display_name: r.linked_client_display_name,
        created_at: r.created_at,
        last_message_direction: r.last_message_direction,
        last_message_sender: r.last_message_sender,
        classification: r.classification,
        is_promotional: r.is_promotional,
        has_draft: r.has_draft,
        // Truncate the preview so the inbox rail stays tidy. Full
        // body is fetched via messages-detail when Vero opens the
        // conversation.
        last_message_preview: r.last_message_body
          ? r.last_message_body.length > PREVIEW_MAX_CHARS
            ? r.last_message_body.slice(0, PREVIEW_MAX_CHARS) + '…'
            : r.last_message_body
          : null,
      })),
    });
  } catch (err) {
    console.error('[admin/messages-list] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
