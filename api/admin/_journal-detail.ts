/**
 * Admin: fetch a single Journal post by id, plus the list of series
 * that already exist.
 *
 * POST { password, id? }
 *   → 200 { success, post, series }   with an id
 *   → 200 { success, post: null, series }   without one
 *   → 401 bad password
 *   → 404 no such post
 *
 * WHY `id` IS OPTIONAL. The editor opens in two modes and both need the
 * series list: editing a post, and writing a new one that joins a story
 * already in progress. Without the no-id case the new-post form would
 * have to invent a series from nothing, which is exactly the mistake
 * that makes a second entry miss the story it belongs to. Returning a
 * null post is the honest answer to "load nothing", not an error.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

type Row = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  drive_folder_url: string | null;
  session_type: string | null;
  tags: string[];
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
  series_slug: string | null;
  series_part: number | null;
  series_label: string | null;
};

type MemberRow = {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  series_slug: string;
  series_part: number | null;
  series_label: string | null;
};

export type SeriesSummary = {
  slug: string;
  label: string | null;
  members: Array<{
    id: string;
    postSlug: string;
    title: string;
    status: 'draft' | 'published';
    part: number | null;
  }>;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';

  try {
    const sql = getDb();

    // Every post that belongs to a series, so the editor can offer them
    // as choices and show what is already in each one. Drafts included:
    // a story is often written both halves at once, and hiding the
    // unpublished half would make the second entry look like part one.
    const memberRows = (await sql`
      SELECT id, slug, title, status, series_slug, series_part, series_label
      FROM journal_posts
      WHERE series_slug IS NOT NULL
      ORDER BY series_slug ASC, series_part ASC NULLS LAST, published_at ASC
    `) as MemberRow[];

    const series = groupSeries(memberRows);

    if (!id) {
      return res.status(200).json({ success: true, post: null, series });
    }

    const rows = (await sql`
      SELECT
        id, slug, title, excerpt, body_markdown,
        cover_image_url, cover_image_alt, drive_folder_url,
        session_type, tags, status, published_at,
        created_at, updated_at,
        series_slug, series_part, series_label
      FROM journal_posts
      WHERE id = ${id}
      LIMIT 1
    `) as Row[];

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    return res.status(200).json({ success: true, post: rows[0], series });
  } catch (err) {
    console.error('[admin/journal-detail] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * Collapse the flat member rows into one entry per series.
 *
 * The label is stored per post rather than per series, so the members
 * of one series can in principle disagree about what it is called. The
 * first non-null wins, and because the rows arrive ordered by part that
 * is the earliest part's label, which is the one a reader meets first.
 */
function groupSeries(rows: MemberRow[]): SeriesSummary[] {
  const bySlug = new Map<string, SeriesSummary>();
  for (const r of rows) {
    let entry = bySlug.get(r.series_slug);
    if (!entry) {
      entry = { slug: r.series_slug, label: null, members: [] };
      bySlug.set(r.series_slug, entry);
    }
    if (entry.label === null && r.series_label) entry.label = r.series_label;
    entry.members.push({
      id: r.id,
      postSlug: r.slug,
      title: r.title,
      status: r.status,
      part: r.series_part,
    });
  }
  return [...bySlug.values()];
}
