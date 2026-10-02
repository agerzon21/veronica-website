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
 * Accepts both admin (Vero) and super (Alex), Messages is a Vero-
 * facing tool.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

/**
 * What the inbox should do with each LEAD: suggest a follow-up, fold it away
 * as closed, or leave it alone. One pass, by conversation id.
 *
 * A lead: they wrote at least once, the thread is a booking inquiry (or came
 * in through the contact form and has never been summarised), it is not
 * personal or promotional (by the same reading the list itself uses: Vero's
 * flag wins, otherwise a spam classification), and it is NOT a client: no
 * portal linked to the thread and none whose email is the thread's address.
 * The link alone covers 4 of 19 portals, so it cannot be the test (see
 * _messages-detail.ts on the email fallback).
 *
 * CLOSED (folded into "Closed leads" at the bottom, like personal and
 * promotional), once nobody has written for 14 days and any of:
 *   - their date has passed: nobody books a wedding that already happened;
 *   - we wrote on two or more separate DAYS after their last message and got
 *     nothing back (Alex, 2026-10-01: "we don't want to spam them"). Days,
 *     not messages, so a reply sent in two parts a minute apart is one try;
 *   - Vero closed it herself (migration 050), and nothing was said since.
 * A new message from either side reopens it, because every rule needs the
 * silence.
 *
 * FOLLOW UP (Alex: "older leads, older than a few weeks"): silent 14 days or
 * more, not closed, fewer than two tries, and a date (when one is known) at
 * least a week away. Under a week there is nothing left to arrange.
 *
 * WHY ITS OWN QUERY. The first follow-up flag lived inside the list query as
 * `NOT c.is_promotional`, and is_promotional is NULL on almost every thread,
 * so the expression came out NULL and the flag was false on all 114 threads:
 * it never fired once. Kept apart now, and allowed to fail, so a mistake here
 * (or a database migration 050 has not reached) costs the badges, never the
 * inbox.
 */
/** The list row's lead fields, from its state (absent: an ordinary thread). */
function leadFields(l: LeadState | undefined) {
  return {
    needs_follow_up: l?.state === 'follow_up',
    // 'quiet': our message was the last word. 'unanswered': theirs was, and
    // nothing in this inbox answers it (Vero may have replied by email before
    // replies were recorded here, so the UI never says she didn't).
    follow_up_kind: l?.state === 'follow_up' ? l.kind : null,
    follow_up_days: l?.state === 'follow_up' ? l.days : null,
    closed_lead: l?.state === 'closed',
    closed_reason: l?.state === 'closed' ? l.reason : null,
  };
}

type LeadState =
  | { state: 'follow_up'; kind: 'quiet' | 'unanswered'; days: number }
  | { state: 'closed'; reason: 'date_passed' | 'no_reply' | 'closed' };

/**
 * When Vero closed each lead herself, from migration 050's column.
 *
 * Read on its own, and allowed to fail on its own, for the reason leadStates
 * is: it was part of the main query, so on a database the migration had not
 * reached that whole query failed and the inbox showed no follow-ups and no
 * closed leads at all, which is exactly how the old flag went unnoticed for
 * weeks. Found by running this handler against production before 050 was
 * applied there (2026-10-01). Now a missing column costs only her own closes.
 */
async function closedByVeroAt(sql: ReturnType<typeof getDb>): Promise<Map<string, number>> {
  try {
    const rows = (await sql`
      SELECT id, closed_at FROM conversations WHERE closed_at IS NOT NULL
    `) as Array<{ id: string; closed_at: string | Date }>;
    return new Map(rows.map((r) => [r.id, new Date(r.closed_at).getTime()]));
  } catch (err) {
    console.warn('[messages-list] closed_at unavailable (migration 050?):', err);
    return new Map();
  }
}

// "Today" is Scranton's today, written out, never CURRENT_DATE: Neon runs on
// UTC, so from 8 PM Eastern CURRENT_DATE is already tomorrow, and a lead whose
// shoot is today was closed as "date passed" four hours early.
async function leadStates(sql: ReturnType<typeof getDb>): Promise<Map<string, LeadState>> {
  const out = new Map<string, LeadState>();
  const closedAt = await closedByVeroAt(sql);
  try {
    const rows = (await sql`
      WITH last AS (
        SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.direction, m.sent_at
        FROM messages m
        WHERE m.status <> 'draft'
        ORDER BY m.conversation_id, m.sent_at DESC
      )
      SELECT c.id, last.direction, last.sent_at AS last_at,
             ((NOW() AT TIME ZONE 'America/New_York')::date - (last.sent_at AT TIME ZONE 'America/New_York')::date) AS days,
             COALESCE(
               CASE WHEN c.summary_json->'booking'->>'event_date' ~ '^\\d{4}-\\d{2}-\\d{2}$'
                    THEN (c.summary_json->'booking'->>'event_date')::date END,
               CASE WHEN sub.preferred_date ~ '^\\d{4}-\\d{2}-\\d{2}$'
                    THEN sub.preferred_date::date END
             ) - (NOW() AT TIME ZONE 'America/New_York')::date AS days_to_date,
             (
               SELECT COUNT(DISTINCT (o.sent_at AT TIME ZONE 'America/New_York')::date)
               FROM messages o
               WHERE o.conversation_id = c.id
                 AND o.direction = 'outbound'
                 AND o.status <> 'draft'
                 AND o.sent_at > COALESCE(
                   (SELECT MAX(i2.sent_at) FROM messages i2
                     WHERE i2.conversation_id = c.id AND i2.direction = 'inbound'),
                   'epoch'::timestamptz)
             ) AS tries
      FROM conversations c
      JOIN last ON last.conversation_id = c.id
      LEFT JOIN client_portals cp ON cp.id = c.linked_client_portal_id
      LEFT JOIN client_portals cpe
        ON cp.id IS NULL
       AND c.platform = 'email'
       AND LOWER(cpe.client_email) = LOWER(c.external_user_id)
      LEFT JOIN LATERAL (
        SELECT s.preferred_date FROM contact_submissions s
        WHERE s.conversation_id = c.id
        ORDER BY s.created_at DESC
        LIMIT 1
      ) sub ON TRUE
      WHERE cp.id IS NULL AND cpe.id IS NULL
        AND COALESCE(c.is_promotional, COALESCE(c.summary_json->>'classification', '') = 'spam-or-unrelated') = FALSE
        AND c.is_personal = FALSE
        AND EXISTS (SELECT 1 FROM messages i WHERE i.conversation_id = c.id AND i.direction = 'inbound')
        AND (
          c.summary_json->>'classification' = 'booking-inquiry'
          OR (
            c.summary_json->>'classification' IS NULL
            AND EXISTS (SELECT 1 FROM contact_submissions s2 WHERE s2.conversation_id = c.id)
          )
        )
    `) as Array<{
      id: string;
      direction: string;
      last_at: string | Date;
      days: number | string;
      days_to_date: number | string | null;
      tries: number | string;
    }>;
    for (const r of rows) {
      const days = Number(r.days);
      const toDate = r.days_to_date === null ? null : Number(r.days_to_date);
      const tries = Number(r.tries);
      if (days < 14) continue; // anything said in the last two weeks is live
      // Her close stands until someone says something after it.
      const closed = closedAt.get(r.id);
      if (closed !== undefined && closed >= new Date(r.last_at).getTime()) {
        out.set(r.id, { state: 'closed', reason: 'closed' });
      } else if (toDate !== null && toDate < 0) {
        out.set(r.id, { state: 'closed', reason: 'date_passed' });
      } else if (tries >= 2) {
        out.set(r.id, { state: 'closed', reason: 'no_reply' });
      } else if (toDate === null || toDate >= 7) {
        out.set(r.id, { state: 'follow_up', kind: r.direction === 'outbound' ? 'quiet' : 'unanswered', days });
      }
    }
  } catch (err) {
    console.warn('[messages-list] lead states unavailable:', err);
  }
  return out;
}

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
  is_personal: boolean;
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

    // Global kill switch state, read once, return in the same
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
        c.is_personal,
        EXISTS (
          SELECT 1 FROM messages d
          WHERE d.conversation_id = c.id AND d.status = 'draft'
        ) AS has_draft
      FROM conversations c
      LEFT JOIN client_portals cp ON cp.id = c.linked_client_portal_id
      LEFT JOIN LATERAL (
        SELECT body, direction, sender, sent_at
        FROM messages m
        WHERE m.conversation_id = c.id
          -- Drafts are proposed replies nobody has sent. Including them made
          -- the rail read "You: ..." for a message that was never sent, so a
          -- thread still waiting on Vero looked already answered. has_draft
          -- above is how the rail signals an unsent draft exists.
          AND m.status <> 'draft'
        ORDER BY m.sent_at DESC
        LIMIT 1
      ) last_msg ON TRUE
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
    `) as ConversationRow[];

    const leads = await leadStates(sql);

    /**
     * Starred threads (migration 050). Its own read and allowed to fail, for
     * the same reason as the follow-ups: the inbox must never go down over a
     * column a deploy expected and the database does not have yet.
     */
    const starred = new Set<string>();
    try {
      const starRows = (await sql`
        SELECT id FROM conversations WHERE starred_at IS NOT NULL
      `) as Array<{ id: string }>;
      for (const r of starRows) starred.add(r.id);
    } catch {
      /* pre-migration-050 database: nothing is starred */
    }

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
      is_personal: r.is_personal,
        has_draft: r.has_draft,
        starred: starred.has(r.id),
        ...leadFields(leads.get(r.id)),
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
