import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';
import { getDb } from '../_db.js';
import { fetchIgProfile } from '../_ig-profile.js';
import { runGuarded, type CronTrigger } from './_guard.js';

/**
 * Mirror Instagram contact avatars into Vercel Blob, permanently.
 *
 * THE PROBLEM
 * Meta never gives out a stable image URL. `profile_pic` comes back as a
 * PRE-SIGNED cdninstagram link that expires in 24-72h — as little as 1-3h
 * during a CDN rotation (see api/_ig-profile.ts). We stored that string at
 * first contact and nothing ever renewed it, so every avatar in the admin
 * inbox eventually 403'd and rendered as a broken image. Nothing "broke": the
 * value was always on a timer.
 *
 * WHY MIRRORING, NOT A DAILY RE-FETCH
 * The first version of this job re-fetched a fresh signed URL every day. It
 * worked, but it is the wrong shape — it needs a cron forever, it can drift,
 * and a URL can still die between runs. Downloading the bytes ONCE and hosting
 * them ourselves is permanent: after a row is mirrored it never needs touching
 * again, so this job drains its own queue and then does nothing. A run
 * reporting "0 mirrored" is the intended end state, not a failure.
 *
 * QUOTA SAFETY
 * api/photo.ts's header records that proxying image bytes through a Function
 * "blew our Vercel Hobby quota in two days". That was a READ path — every
 * gallery view streamed megabytes through the origin. This is a WRITE path that
 * runs at most a few dozen times ever, at ~8-14KB per avatar, and reads go
 * browser -> Blob CDN directly, never through us. Different shape entirely.
 *
 * SLOT COST: zero. Underscore-prefixed inside api/cron/, registered in the
 * HANDLERS map in api/cron.ts, and chained from instagram-check. No new
 * endpoint file, no new vercel.json cron entry. api/ stays 12/12.
 */

export const CRON_META = {
  name: 'ig-avatar-refresh',
  path: '/api/cron/ig-avatar-refresh',
  schedule: 'chained daily after instagram-check',
  description:
    'Mirrors Instagram contact avatars into our own storage so they stop expiring. Meta only hands out pre-signed URLs that die within 24-72h; this downloads each one once and serves a permanent copy. Drains to zero work once every contact is mirrored — a run reporting "0 mirrored" means everything is already done, not that it failed.',
} as const;

// Bounded so this shares instagram-check's 60s invocation safely. The queue
// drains over a few runs rather than risking a timeout on the first one.
const MAX_PER_RUN = 25;
const DEADLINE_MS = 35_000;
const PROFILE_TIMEOUT_MS = 2_000;
const DOWNLOAD_TIMEOUT_MS = 4_000;
const MAX_FAILURES = 3;
// Meta avatars are ~8-14KB. Anything wildly larger is not an avatar — refuse it
// rather than storing whatever we were handed.
const MAX_BYTES = 512 * 1024;

type Row = {
  id: string;
  external_user_id: string;
  contact_profile_pic_url: string | null;
};

const withTimeout = async <T>(p: Promise<T>, ms: number): Promise<T | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export async function refreshIgAvatars(): Promise<{
  pending: number;
  mirrored: number;
  failed: number;
}> {
  const sql = getDb();
  const startedAt = Date.now();
  let mirrored = 0;
  let failed = 0;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn('[cron/ig-avatar-refresh] BLOB_READ_WRITE_TOKEN missing — skipping');
    return { pending: 0, mirrored: 0, failed: 0 };
  }

  // Only rows with no permanent avatar yet. Once mirrored, a row leaves this
  // queue forever — which is why this job trends to zero.
  const rows = (await sql`
    SELECT id, external_user_id, contact_profile_pic_url
    FROM conversations
    WHERE platform = 'instagram'
      AND external_user_id IS NOT NULL
      AND contact_avatar_url IS NULL
      AND contact_avatar_failures < ${MAX_FAILURES}
    ORDER BY updated_at DESC
    LIMIT ${MAX_PER_RUN}
  `) as unknown as Row[];

  for (const row of rows) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      console.warn(
        `[cron/ig-avatar-refresh] deadline hit after ${mirrored + failed}/${rows.length}; remainder next run`,
      );
      break;
    }

    try {
      // Always re-fetch rather than trusting the stored URL: for any row that
      // has been sitting a while the stored one is already dead, which is the
      // whole problem this job exists to solve. Fall back to the stored URL
      // only if the Graph call fails.
      const profile = await withTimeout(fetchIgProfile(row.external_user_id), PROFILE_TIMEOUT_MS);
      const sourceUrl = profile?.profilePicUrl ?? row.contact_profile_pic_url;
      if (!sourceUrl) throw new Error('no profile picture available');

      const res = await withTimeout(fetch(sourceUrl), DOWNLOAD_TIMEOUT_MS);
      if (!res) throw new Error('download timed out');
      if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('empty body');
      if (buf.length > MAX_BYTES) throw new Error(`unexpectedly large: ${buf.length} bytes`);

      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      if (!contentType.startsWith('image/')) throw new Error(`not an image: ${contentType}`);

      // Deterministic pathname keyed on the IGSID, so re-mirroring a contact
      // overwrites in place rather than accumulating orphans.
      //
      // access:'public' so reads go browser -> Blob CDN directly. A private
      // blob would have to be proxied through a Function on every inbox render
      // — exactly the pattern that blew the Hobby quota once already.
      // NOTE: every other blob in this store is 'private'; this is the first
      // public write. If the store rejects it, the throw is caught per-row
      // below and surfaces in the run history rather than killing the job.
      //
      // allowOverwrite is mandatory: @vercel/blob v2 defaults it to false and
      // throws "This blob already exists" on any retry.
      const { url } = await put(`ig-avatars/${row.external_user_id}`, buf, {
        access: 'public',
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60 * 60 * 24 * 30,
      });

      await sql`
        UPDATE conversations
        SET contact_avatar_url = ${url},
            contact_avatar_mirrored_at = NOW(),
            contact_avatar_failures = 0
        WHERE id = ${row.id}
      `;
      mirrored++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron/ig-avatar-refresh] ${row.external_user_id}: ${message}`);
      // Give up on a row after MAX_FAILURES so a deleted account is not retried
      // on every run forever.
      await sql`
        UPDATE conversations
        SET contact_avatar_failures = contact_avatar_failures + 1
        WHERE id = ${row.id}
      `;
    }
  }

  return { pending: rows.length, mirrored, failed };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // req.query.trigger, NOT req.headers: api/admin/_crons-run-now.ts builds its
  // request as { ...req, query: {...} }, and spreading a VercelRequest does not
  // carry `headers` (a prototype getter on IncomingMessage). Matches
  // _instagram-check.ts and _gallery-sync.ts.
  const rawTrigger = req.query?.trigger;
  const trigger: CronTrigger =
    (Array.isArray(rawTrigger) ? rawTrigger[0] : rawTrigger) === 'manual' ? 'manual' : 'schedule';

  const result = await runGuarded({ ...CRON_META, trigger }, refreshIgAvatars);

  if (result.skipped) {
    return res.status(200).json({ ok: true, action: 'skipped-cron-disabled' });
  }
  if (result.error) {
    return res.status(500).json({ ok: false, error: result.error });
  }
  return res.status(200).json({ ok: true, ...(result.ok ?? {}) });
}
