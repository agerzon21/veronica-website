import type { VercelRequest, VercelResponse } from '@vercel/node';
import sharp from 'sharp';
import { getDb } from '../_db.js';
import { fetchIgProfile } from '../_ig-profile.js';
import { runGuarded, type CronTrigger } from './_guard.js';

/**
 * Store Instagram contact avatars in our own database, permanently.
 *
 * THE PROBLEM
 * Meta never gives out a stable image URL. `profile_pic` comes back as a
 * PRE-SIGNED cdninstagram link that expires in 24-72h — as little as 1-3h
 * during a CDN rotation (see api/_ig-profile.ts). We stored that string at
 * first contact and nothing ever renewed it, so every avatar in the admin
 * inbox eventually 403'd and rendered as a broken image. Nothing "broke": the
 * value was always on a timer.
 *
 * THE FIX, AND WHY IT IS THIS BORING
 * Download each avatar once, shrink it to 96px WebP (~2-4KB — they render in a
 * 44px circle), and store it inline as a base64 data URI in the column. It
 * comes back with the conversation row and renders directly. Never expires.
 *
 * Two more elaborate versions were tried first and both were the wrong amount
 * of machinery:
 *   - A daily job re-fetching a fresh signed URL. Works, but needs a cron
 *     forever and still leaves a gap when Meta rotates a URL early.
 *   - Mirroring the bytes to Vercel Blob. Failed outright: `access` is a
 *     STORE-level setting and this store is private because it holds signed
 *     contracts, which must stay private. It would have needed a whole second
 *     Blob store to hold a couple dozen thumbnails.
 * Total storage for every contact Vero has: under 100KB of text.
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

      // Downscale hard, then store the bytes INLINE as a data URI.
      //
      // These render in a 44px circle. Meta hands back ~14KB at full size; at
      // 96px (2x for retina) WebP lands around 2-4KB, so all of Vero's contacts
      // together are well under 100KB of text in the database.
      //
      // No Blob store, no CDN, no proxy endpoint, no dashboard setup. The
      // earlier Blob attempt failed because access is a STORE-level setting and
      // this store is private (it holds signed contracts, which must stay
      // private) — so it would have needed a second store just to hold a
      // handful of thumbnails. That was the wrong amount of machinery for the
      // problem.
      const resized = await sharp(buf)
        .resize(96, 96, { fit: 'cover', position: 'attention' })
        .webp({ quality: 80 })
        .toBuffer();

      const url = `data:image/webp;base64,${resized.toString('base64')}`;

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
