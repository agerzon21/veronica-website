#!/usr/bin/env node
/**
 * One-shot backfill for the conversations.contact_name / contact_handle /
 * contact_profile_pic_url columns.
 *
 * Fetches every conversation where contact_name IS NULL and calls the
 * Meta Graph API to enrich it with the sender's real profile. Skips
 * silently on API errors — a stale/blocked IGSID means "leave it blank
 * and move on" (this is the same policy the webhook auto-enrich path
 * uses).
 *
 * When to run this:
 *   - Once, after the auto-enrich feature ships, to fill in the rows
 *     that predate it.
 *   - Occasionally, if you notice a batch of unfilled conversations
 *     (shouldn't happen — webhook enriches on every new DM).
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-ig-profiles.mjs
 *
 * Requires POSTGRES_URL and IG_ACCESS_TOKEN in the env. `.env.local`
 * mirrors production for local dev — sync it via `vercel env pull`.
 *
 * Uses direct fetch + a copy of the failure-mode categorization from
 * api/_ig-profile.ts (can't import the .ts helper from a plain .mjs
 * script — no tsc step in this path). Keep them roughly in sync.
 */

import { neon } from '@neondatabase/serverless';

const POSTGRES_URL = process.env.POSTGRES_URL;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

if (!POSTGRES_URL) {
  console.error('POSTGRES_URL missing — did you `vercel env pull` recently?');
  process.exit(1);
}
if (!IG_ACCESS_TOKEN) {
  console.error('IG_ACCESS_TOKEN missing — did you `vercel env pull` recently?');
  process.exit(1);
}

const IG_GRAPH_HOST = 'https://graph.instagram.com';
const IG_API_VERSION = 'v25.0';
const PROFILE_FIELDS = ['name', 'username', 'profile_pic'].join(',');
// 200ms between calls — nowhere near the BUC ceiling but polite, and
// keeps us from tripping any burst detection during a backfill.
const DELAY_MS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchProfile(igsid) {
  const url = new URL(`${IG_GRAPH_HOST}/${IG_API_VERSION}/${encodeURIComponent(igsid)}`);
  url.searchParams.set('fields', PROFILE_FIELDS);
  url.searchParams.set('access_token', IG_ACCESS_TOKEN);

  let res;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch (err) {
    return { ok: false, reason: `network: ${err.message}` };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: `non-json HTTP ${res.status}` };
  }

  if (!res.ok) {
    const e = body?.error ?? {};
    return {
      ok: false,
      reason: `HTTP ${res.status} code=${e.code ?? '-'} sub=${e.error_subcode ?? '-'} "${e.message ?? 'unknown'}"`,
    };
  }

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  const username =
    typeof body.username === 'string' && body.username.trim() ? body.username.trim() : null;
  const profilePicUrl =
    typeof body.profile_pic === 'string' && body.profile_pic.trim()
      ? body.profile_pic.trim()
      : null;

  if (!name && !username && !profilePicUrl) {
    return { ok: false, reason: 'empty profile response' };
  }
  return { ok: true, profile: { name, username, profilePicUrl } };
}

async function main() {
  const sql = neon(POSTGRES_URL);

  const rows = await sql`
    SELECT id, external_user_id
    FROM conversations
    WHERE platform = 'instagram' AND contact_name IS NULL
    ORDER BY last_message_at DESC NULLS LAST, created_at DESC
  `;

  if (rows.length === 0) {
    console.log('Nothing to backfill — every Instagram conversation already has contact_name.');
    return;
  }

  console.log(`Backfilling ${rows.length} conversation(s)...\n`);
  let filled = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const { id, external_user_id: igsid } = rows[i];
    const label = `[${i + 1}/${rows.length}] igsid=${igsid} convo=${id.slice(0, 8)}…`;

    const result = await fetchProfile(igsid);
    if (!result.ok) {
      console.log(`${label} SKIP (${result.reason})`);
      skipped++;
    } else {
      const { name, username, profilePicUrl } = result.profile;
      await sql`
        UPDATE conversations
        SET contact_name = ${name},
            contact_handle = ${username},
            contact_profile_pic_url = ${profilePicUrl},
            updated_at = NOW()
        WHERE id = ${id}
      `;
      console.log(
        `${label} OK name="${name ?? '-'}" @${username ?? '-'} pic=${profilePicUrl ? 'yes' : 'no'}`,
      );
      filled++;
    }

    if (i < rows.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\nDone. Filled ${filled}, skipped ${skipped}, total ${rows.length}.`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
