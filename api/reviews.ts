/**
 * Public read endpoint for reviews.
 *
 *   GET /api/reviews[?limit=N]
 *     → { success, reviews: [PublicReview, ...], aggregate: { rating, count } }
 *
 * Returns only reviews that are BOTH visible AND featured — the site
 * shows a curated set on the homepage/testimonial section, not the
 * full moderation queue. Ordered by (sort_order ASC, publish_date DESC
 * NULLS LAST, created_at DESC) so Vero can pin favourites via
 * sort_order and everything else falls back to newest-first.
 *
 * The `aggregate` block is the manually-maintained "5.0 · 15 reviews"
 * badge shown on the home page. Kept in system_state so Vero can edit
 * it from admin without hitting the Places API (see
 * api/admin/_reviews-aggregate.ts).
 *
 * Minimal payload — the admin view carries the moderation metadata
 * (visible/featured/source/sort_order), the public payload doesn't
 * need any of it.
 *
 * Edge-cached (max-age=300, s-maxage=1800): reviews change on the
 * order of days/weeks, so a 30-min CDN cache dramatically cuts DB
 * load without users seeing stale content in practice.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';

// Hard ceiling on ?limit even if a caller passes something huge —
// no client legitimately needs more than this, and it caps the
// worst-case response size.
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

type PublicReview = {
  id: string;
  author_name: string;
  author_photo_url: string | null;
  rating: number;
  text: string;
  publish_date: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawLimit = req.query.limit;
  const limitStr = Array.isArray(rawLimit) ? rawLimit[0] : rawLimit;
  let limit = DEFAULT_LIMIT;
  if (typeof limitStr === 'string' && limitStr.trim()) {
    const parsed = Number(limitStr);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(Math.trunc(parsed), MAX_LIMIT);
    }
  }

  try {
    const sql = getDb();
    // Two independent queries fire in parallel — Neon serverless keeps
    // its own pooled connection, so the round-trips overlap cleanly.
    const [rows, aggregateRows] = await Promise.all([
      sql`
        SELECT
          id,
          author_name,
          author_photo_url,
          rating,
          text,
          to_char(publish_date, 'YYYY-MM-DD') AS publish_date
        FROM reviews
        WHERE visible = true AND featured = true
        ORDER BY
          sort_order ASC,
          publish_date DESC NULLS LAST,
          created_at DESC
        LIMIT ${limit}
      ` as Promise<PublicReview[]>,
      sql`
        SELECT key, value
        FROM system_state
        WHERE key IN ('google_review_rating', 'google_review_count')
      ` as Promise<Array<{ key: string; value: string | null }>>,
    ]);

    // Parse the aggregate; if either row is missing or malformed we
    // return null for that field so the client's fallback can kick in
    // rather than crashing with an undefined access.
    let rating: string | null = null;
    let count: number | null = null;
    for (const r of aggregateRows) {
      if (r.key === 'google_review_rating' && typeof r.value === 'string' && r.value.trim()) {
        rating = r.value.trim();
      } else if (r.key === 'google_review_count' && typeof r.value === 'string' && r.value.trim()) {
        const parsed = Number(r.value);
        if (Number.isFinite(parsed) && parsed >= 0) count = Math.trunc(parsed);
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json({
      success: true,
      reviews: rows,
      aggregate: { rating, count },
    });
  } catch (err) {
    console.error('[reviews] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
