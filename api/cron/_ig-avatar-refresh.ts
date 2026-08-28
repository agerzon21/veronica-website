import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_db.js';
import { fetchIgProfile } from '../_ig-profile.js';

/**
 * Refresh Instagram contact avatars.
 *
 * WHY THIS EXISTS
 * Avatars in the admin Messages tab were all blank. The cause is not a bug in
 * any one line — it is that nothing ever refreshed them.
 *
 * `enrichConversationProfile` in api/inbox/_ig-webhook.ts is the ONLY thing
 * that writes `contact_profile_pic_url`, and its single caller (:487) is gated
 * on `was_inserted || contact_name == null`. So it runs exactly once, at first
 * contact, and never again. Meanwhile Meta pre-signs those cdninstagram URLs
 * and they die in 24-72h — as little as 1-3h during a CDN rotation, per the
 * header of api/_ig-profile.ts. Every avatar was always going to rot; the only
 * question was how fast.
 *
 * (The COALESCE arg order in that UPDATE looks inverted and was initially
 * blamed. It is not the cause: because of the gate, the column is always NULL
 * when it runs, so both orderings return the same value. Reordering it alone
 * would have fixed nothing.)
 *
 * WHY A DAILY RE-FETCH AND NOT A BLOB MIRROR
 * Mirroring the bytes to Vercel Blob gives permanently stable URLs and is the
 * better long-term answer. But it is a much larger change resting on an
 * unverified assumption (every existing blob in this store is `private`; public
 * writes are untested here). A daily re-fetch needs no new storage, no new
 * dependency and no new failure mode — and since the URLs live 24-72h and this
 * runs daily, it keeps the overwhelming majority alive. The CDN-rotation tail
 * is handled on the client: PlatformAvatar now falls back to initials instead
 * of rendering a broken image.
 *
 * Escalate to the Blob mirror only if this proves insufficient in practice.
 *
 * SLOT COST: zero. Underscore-prefixed inside api/cron/, registered in the
 * HANDLERS map in api/cron.ts and chained from the existing instagram-check
 * job — no new endpoint file, no new vercel.json cron entry. api/ stays 12/12.
 */

// Meta's Graph API is rate-limited per token, and this shares a 60s invocation
// with detectAndMarkRotation and possibly a Resend send. Bound both.
const MAX_PER_RUN = 60;
const DEADLINE_MS = 40_000;
const PER_PROFILE_TIMEOUT_MS = 2_000;

type Row = { id: string; external_user_id: string };

export async function refreshIgAvatars(): Promise<{
  attempted: number;
  refreshed: number;
  failed: number;
  skipped: number;
}> {
  const startedAt = Date.now();
  let refreshed = 0;
  let failed = 0;

  // Oldest-touched first, so a run that hits the deadline still makes forward
  // progress on the staleest rows next time rather than re-walking the same head.
  const rows = (await sql`
    SELECT id, external_user_id
    FROM conversations
    WHERE platform = 'instagram'
      AND external_user_id IS NOT NULL
    ORDER BY updated_at ASC
    LIMIT ${MAX_PER_RUN}
  `) as unknown as Row[];

  for (const row of rows) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      console.warn(
        `[cron/ig-avatar-refresh] deadline hit after ${refreshed + failed}/${rows.length}; remainder next run`,
      );
      break;
    }

    let profile: Awaited<ReturnType<typeof fetchIgProfile>> = null;
    try {
      profile = await Promise.race([
        fetchIgProfile(row.external_user_id),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), PER_PROFILE_TIMEOUT_MS)),
      ]);
    } catch {
      // fetchIgProfile is documented never to throw, but a timeout race can
      // still reject upstream. Treat any error as "no profile this run".
      profile = null;
    }

    if (!profile?.profilePicUrl) {
      failed++;
      continue;
    }

    // FRESH WINS here, unlike the name/handle columns. contact_profile_pic_url
    // holds an expiring signed credential, not a human-entered value — keeping
    // the old one is strictly worse than taking the new one. Names are
    // different and are deliberately left alone by this job.
    await sql`
      UPDATE conversations
      SET contact_profile_pic_url = ${profile.profilePicUrl}
      WHERE id = ${row.id}
    `;
    refreshed++;
  }

  return { attempted: rows.length, refreshed, failed, skipped: rows.length - refreshed - failed };
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const result = await refreshIgAvatars();
    console.log(
      `[cron/ig-avatar-refresh] attempted=${result.attempted} refreshed=${result.refreshed} failed=${result.failed}`,
    );
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/ig-avatar-refresh] failed:', message);
    return res.status(500).json({ success: false, error: message });
  }
}
