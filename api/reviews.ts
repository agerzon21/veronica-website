/**
 * Public read endpoint for reviews.
 *
 *   GET /api/reviews[?limit=N]
 *     → { success, reviews: [PublicReview, ...] }
 *
 * Returns only reviews that are BOTH visible AND featured — the site
 * shows a curated set on the homepage/testimonial section, not the
 * full moderation queue. Ordered by (sort_order ASC, publish_date DESC
 * NULLS LAST, created_at DESC) so Vero can pin favourites via
 * sort_order and everything else falls back to newest-first.
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
    const rows = (await sql`
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
    `) as PublicReview[];

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json({ success: true, reviews: rows });
  } catch (err) {
    console.error('[reviews] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
