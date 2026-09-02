/**
 * Is a rebuild actually needed?
 *
 * Prerendered pages are a build-time snapshot, so publishing a photo or editing
 * a journal post changes the database and the live SPA while the static HTML
 * search engines read stays behind. Without this the rebuild button had no way
 * to know that, so it fired unconditionally and spent a build even when nothing
 * had changed.
 *
 * Compares a live fingerprint of the published content against the one the last
 * build stamped into /build-manifest.json. Counts catch publishes, unpublishes
 * and deletions; max(updated_at) catches edits to something already published.
 * The two queries are duplicated verbatim from scripts/prerender-photos.mjs and
 * must stay identical — that symmetry is the whole mechanism.
 *
 * POST { password }
 *   → 200 { success, pending, reason, deployed, current, builtAt }
 *   → 401 / 405
 *
 * `pending` is deliberately TRUE when the manifest cannot be read. An unknown
 * state must not present as "nothing to publish" — that would quietly stop Vero
 * ever rebuilding.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';
import { getDb } from '../_db.js';

const SITE = process.env.SITE_ORIGIN || 'https://vero.photography';

export interface ContentFingerprint {
  photos: { published: number; latest: string | null } | null;
  journal: { published: number; latest: string | null } | null;
}

export async function currentFingerprint(): Promise<ContentFingerprint> {
  const sql = getDb();
  const [ph] = (await sql`
    SELECT count(*)::int AS published, max(updated_at) AS latest
    FROM gallery_photos
    WHERE status = 'published' AND deleted_at IS NULL
  `) as Array<{ published: number; latest: string | null }>;
  const [jo] = (await sql`
    SELECT count(*)::int AS published, max(updated_at) AS latest
    FROM journal_posts
    WHERE status = 'published' AND published_at IS NOT NULL
  `) as Array<{ published: number; latest: string | null }>;
  const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);
  return {
    photos: { published: ph.published, latest: iso(ph.latest) },
    journal: { published: jo.published, latest: iso(jo.latest) },
  };
}

export async function deployedFingerprint(): Promise<
  { ok: true; manifest: ContentFingerprint & { builtAt?: string } } | { ok: false }
> {
  try {
    const res = await fetch(`${SITE}/build-manifest.json`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) return { ok: false };
    return { ok: true, manifest: (await res.json()) as ContentFingerprint & { builtAt?: string } };
  } catch {
    return { ok: false };
  }
}

/** Returns null when nothing changed, or a short machine-readable reason. */
export function diffReason(
  deployed: ContentFingerprint | null,
  current: ContentFingerprint,
): string | null {
  if (!deployed || !deployed.photos || !deployed.journal) return 'unknown';
  if (deployed.photos.published !== current.photos!.published) return 'photos-count';
  if (deployed.journal.published !== current.journal!.published) return 'journal-count';
  if (deployed.photos.latest !== current.photos!.latest) return 'photos-edited';
  if (deployed.journal.latest !== current.journal!.latest) return 'journal-edited';
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const current = await currentFingerprint();
  const deployed = await deployedFingerprint();
  const reason = diffReason(deployed.ok ? deployed.manifest : null, current);

  return res.status(200).json({
    success: true,
    pending: reason !== null,
    reason,
    builtAt: deployed.ok ? deployed.manifest.builtAt ?? null : null,
    deployed: deployed.ok ? deployed.manifest : null,
    current,
    // Surfaced so the UI can say WHAT changed rather than just "something did".
    delta: deployed.ok && deployed.manifest.photos && deployed.manifest.journal
      ? {
          photos: current.photos!.published - deployed.manifest.photos.published,
          journal: current.journal!.published - deployed.manifest.journal.published,
        }
      : null,
  });
}
