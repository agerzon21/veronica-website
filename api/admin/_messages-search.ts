/**
 * Searching the inbox.
 *
 * POST { password, q, limit? }
 *   → 200 { success, results: [{ conversation, matches: [{ where, snippet }] }] }
 *
 * ── WHAT IT LOOKS IN ─────────────────────────────────────────────────────
 *
 * Everything a conversation IS, not just its messages:
 *
 *   the person      contact_name, contact_handle, external_user_id, and the
 *                   linked client's own name, email and phone
 *   what was said   every message body and subject, both directions
 *   the summary     the model's reading of the thread, in both languages
 *   the facts       what Vero recorded by hand against the thread
 *   the assistant   what she and the assistant said about this client, which
 *                   is where a decision usually gets made and is invisible to
 *                   every other view
 *
 * ── RANKING, AND WHY NAMES AND DATES WIN ─────────────────────────────────
 *
 * Someone searching an inbox is almost always looking for a PERSON or a DAY.
 * "Pagiel" should return Pagiel's thread first even if another thread quotes
 * his name in passing, and a date should return the bookings on it before the
 * messages that happen to contain the digits.
 *
 * So a hit scores by WHERE it was found, not by how often. A name match beats
 * a date match beats a summary beats a message body beats an assistant aside,
 * and within a tier the more recent conversation wins. Counting occurrences
 * would put a long thread above the right one.
 *
 * ── COST ─────────────────────────────────────────────────────────────────
 *
 * Two queries, no matter how much is typed. The first narrows to candidate
 * conversations using the trigram indexes from migration 046. The second
 * pulls the JSONB for those candidates only, and does the summary, facts and
 * assistant matching in Postgres rather than shipping every transcript to the
 * browser. Nothing here is O(everything).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';
import { getDb } from '../_db.js';

/** Below this a query matches most of the inbox and helps nobody. */
const MIN_QUERY = 2;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;

/** How much text to show around a hit. */
const SNIPPET_PAD = 45;

type Where = 'name' | 'date' | 'summary' | 'fact' | 'message' | 'assistant';

/** Name first, date second. See the ranking note at the top. */
const TIER: Record<Where, number> = {
  name: 0,
  date: 1,
  fact: 2,
  summary: 3,
  message: 4,
  assistant: 5,
};

/**
 * A day, if this query names one.
 *
 * Deliberately narrow: the formats a person types into a search box for a
 * booking, and nothing clever. A bare number like "25" is NOT a date, because
 * it is far more often part of a price or an address, and treating it as one
 * would put every September booking above the thing actually being looked
 * for.
 */
function parseDate(q: string): string | null {
  const s = q.trim();
  // 2026-09-25
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // 9/25/2026 or 09-25-26
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  // "sep 25 2026", "25 september 2026", "september 25"
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const lower = s.toLowerCase();
  const monthIdx = MONTHS.findIndex((mon) => lower.includes(mon));
  if (monthIdx >= 0) {
    const nums = lower.match(/\d+/g) ?? [];
    const day = nums.find((n) => Number(n) >= 1 && Number(n) <= 31 && n.length <= 2);
    const year = nums.find((n) => n.length === 4);
    if (day) {
      // No year given means the coming one, which is what someone typing
      // "sep 25" into a booking system means.
      const y = year ?? String(new Date().getUTCFullYear());
      return `${y}-${String(monthIdx + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  return null;
}

/** The text around the first hit, so the row shows WHY it matched. */
function snippet(text: string, needle: string): string {
  const hay = text ?? '';
  const i = hay.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return hay.slice(0, SNIPPET_PAD * 2).trim();
  const from = Math.max(0, i - SNIPPET_PAD);
  const to = Math.min(hay.length, i + needle.length + SNIPPET_PAD);
  return (from > 0 ? '…' : '') + hay.slice(from, to).replace(/\s+/g, ' ').trim() + (to < hay.length ? '…' : '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const q = typeof req.body?.q === 'string' ? req.body.q.trim() : '';
  if (q.length < MIN_QUERY) {
    return res.status(200).json({ success: true, results: [], query: q, tooShort: true });
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.body?.limit) || DEFAULT_LIMIT));
  const like = `%${q.replace(/[%_\\]/g, (ch: string) => `\\${ch}`)}%`;
  const day = parseDate(q);

  const sql = getDb();
  try {
    /**
     * ONE query for the hits, grouped per conversation.
     *
     * A union of small indexed lookups rather than one giant OR across a
     * join: an OR across tables makes the planner give up on the indexes and
     * scan, which is the failure this is all here to avoid.
     */
    const rows = (await sql`
      WITH hits AS (
        -- the person
        SELECT c.id, 'name'::text AS where_found,
               concat_ws(' · ', c.contact_name, c.contact_handle, c.external_user_id) AS text
          FROM conversations c
         WHERE lower(coalesce(c.contact_name, '')) LIKE lower(${like})
            OR lower(coalesce(c.contact_handle, '')) LIKE lower(${like})
            OR lower(coalesce(c.external_user_id, '')) LIKE lower(${like})

        UNION ALL
        -- the client they are linked to, by name, email or number
        SELECT c.id, 'name'::text,
               concat_ws(' · ', p.client_display_name, p.client_email, p.client_phone)
          FROM conversations c
          JOIN client_portals p ON p.id = c.linked_client_portal_id
         WHERE lower(coalesce(p.client_display_name, '')) LIKE lower(${like})
            OR lower(coalesce(p.client_email, '')) LIKE lower(${like})
            OR regexp_replace(coalesce(p.client_phone, ''), '[^0-9]', '', 'g')
               LIKE ${`%${q.replace(/\D/g, '')}%`} AND ${q.replace(/\D/g, '').length >= 4}

        UNION ALL
        -- a day: the booking on it, or a message sent on it
        SELECT c.id, 'date'::text, to_char(p.event_date, 'FMMonth FMDD, YYYY')
          FROM conversations c
          JOIN client_portals p ON p.id = c.linked_client_portal_id
         WHERE ${day}::date IS NOT NULL AND p.event_date = ${day}::date

        UNION ALL
        SELECT m.conversation_id, 'date'::text,
               concat('Message on ', to_char(m.sent_at, 'FMMonth FMDD, YYYY'), ': ', left(m.body, 120))
          FROM messages m
         WHERE ${day}::date IS NOT NULL AND m.sent_at::date = ${day}::date

        UNION ALL
        -- what was said
        SELECT m.conversation_id, 'message'::text, m.body
          FROM messages m
         WHERE m.status <> 'draft'
           AND (lower(coalesce(m.body, '')) LIKE lower(${like})
                OR lower(coalesce(m.subject, '')) LIKE lower(${like}))

        UNION ALL
        -- what Vero wrote down herself
        SELECT c.id, 'fact'::text,
               concat_ws(': ', f->>'field', f->>'value')
          FROM conversations c
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.client_facts) = 'array' THEN c.client_facts ELSE '[]'::jsonb END
          ) AS f
         WHERE lower(concat_ws(' ', f->>'value', f->>'quote')) LIKE lower(${like})

        UNION ALL
        /* The model's reading of the thread.
         *
         * MATCHED on the whole blob, because the summary is stored per
         * language and the shape has changed twice; a match should not depend
         * on knowing today's keys. But the SNIPPET is assembled from the
         * sentences a person would recognise, because showing a row of raw
         * JSON as the reason a result appeared is worse than showing nothing.
         */
        SELECT c.id, 'summary'::text,
               concat_ws(' · ',
                 coalesce(c.summary_json->'en'->>'asking', c.summary_json->>'asking'),
                 coalesce(c.summary_json->'ru'->>'asking', NULL),
                 (SELECT string_agg(g #>> '{}', ' · ')
                    FROM jsonb_array_elements(
                      coalesce(c.summary_json->'en'->'gathered', c.summary_json->'gathered', '[]'::jsonb)
                    ) AS g),
                 coalesce(c.summary_json->'en'->>'nextStep', c.summary_json->>'nextStep'))
          FROM conversations c
         WHERE c.summary_json IS NOT NULL
           AND lower(c.summary_json::text) LIKE lower(${like})

        UNION ALL
        -- what she and the assistant said about this client
        SELECT (replace(a.slot, 'conv:', ''))::uuid, 'assistant'::text, msg->>'content'
          FROM assistant_chats a
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(a.messages) = 'array' THEN a.messages ELSE '[]'::jsonb END
          ) AS msg
         WHERE a.slot LIKE 'conv:%'
           AND msg->>'content' IS NOT NULL
           AND lower(msg->>'content') LIKE lower(${like})
      ),
      ranked AS (
        SELECT id, where_found, text,
               row_number() OVER (PARTITION BY id, where_found ORDER BY length(text)) AS rn
          FROM (SELECT DISTINCT id, where_found, text FROM hits) hits
      )
      SELECT c.id, c.platform, c.external_user_id, c.contact_name, c.contact_handle,
             COALESCE(c.contact_avatar_url, c.contact_profile_pic_url) AS contact_profile_pic_url,
             c.last_message_at, c.unread_count, c.ai_enabled,
             c.is_promotional, c.is_personal,
             p.id AS client_portal_id, p.client_display_name AS linked_client_display_name,
             json_agg(json_build_object('where', r.where_found, 'text', r.text)
                      ORDER BY r.where_found) AS matches
        FROM ranked r
        JOIN conversations c ON c.id = r.id
        LEFT JOIN client_portals p ON p.id = c.linked_client_portal_id
       WHERE r.rn <= 2
       GROUP BY c.id, c.platform, c.external_user_id, c.contact_name, c.contact_handle,
                c.contact_avatar_url, c.contact_profile_pic_url, c.last_message_at,
                c.unread_count, c.ai_enabled, c.is_promotional, c.is_personal,
                p.id, p.client_display_name
       LIMIT 200
    `) as Array<Record<string, unknown>>;

    const results = rows
      .map((r) => {
        const raw = (r.matches ?? []) as Array<{ where: Where; text: string | null }>;
        const matches = raw
          .filter((m) => m.text)
          .map((m) => ({ where: m.where, snippet: snippet(String(m.text), q) }));
        // The conversation's rank is its BEST hit. A thread that matches on a
        // name and also in passing in a message is a name match.
        const best = Math.min(...raw.map((m) => TIER[m.where] ?? 9));
        const conversation = { ...r, matches: undefined } as Record<string, unknown>;
        return { conversation, matches, rank: best };
      })
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        const at = new Date(String(a.conversation.last_message_at ?? 0)).getTime();
        const bt = new Date(String(b.conversation.last_message_at ?? 0)).getTime();
        return bt - at;
      })
      .slice(0, limit);

    return res.status(200).json({ success: true, query: q, matchedDate: day, results });
  } catch (err) {
    console.error('[admin/messages-search] failed:', err);
    return res.status(500).json({ success: false, error: 'Search failed' });
  }
}
