/**
 * Admin: create or update a review.
 *
 * POST { password, review: { id?, author_name, text, rating, ... } }
 *   → 200 { success, review }
 *   → 400 validation failure (missing/invalid field)
 *   → 401 bad password
 *   → 404 update targeted an id that doesn't exist
 *
 * One endpoint for both create + update: if `review.id` is present we
 * UPDATE that row, otherwise we INSERT. The admin form always sends
 * the full shape either way, so no partial-patch complexity.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

type Source = 'google' | 'yelp' | 'instagram' | 'email' | 'manual';
const ALLOWED_SOURCES: readonly Source[] = ['google', 'yelp', 'instagram', 'email', 'manual'] as const;

interface ValidatedReview {
  id: string | null;
  author_name: string;
  author_photo_url: string | null;
  rating: number;
  text: string;
  publish_date: string | null;
  source: Source;
  featured: boolean;
  visible: boolean;
  sort_order: number;
}

type ValidationResult =
  | { ok: true; value: ValidatedReview }
  | { ok: false; status: number; error: string };

function validateReviewInput(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'review is required' };
  }
  const review = (body as { review?: unknown }).review;
  if (!review || typeof review !== 'object') {
    return { ok: false, status: 400, error: 'review is required' };
  }
  const r = review as Record<string, unknown>;

  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : null;

  const author_name = typeof r.author_name === 'string' ? r.author_name.trim() : '';
  if (!author_name) {
    return { ok: false, status: 400, error: 'author_name is required' };
  }

  const text = typeof r.text === 'string' ? r.text.trim() : '';
  if (!text) {
    return { ok: false, status: 400, error: 'text is required' };
  }

  // Accept numeric strings from the admin form too — <input type="number">
  // gives us a string in some browsers.
  const ratingRaw = typeof r.rating === 'string' ? Number(r.rating) : r.rating;
  if (typeof ratingRaw !== 'number' || !Number.isFinite(ratingRaw)) {
    return { ok: false, status: 400, error: 'rating is required' };
  }
  const rating = Math.trunc(ratingRaw);
  if (rating < 1 || rating > 5) {
    return { ok: false, status: 400, error: 'rating must be between 1 and 5' };
  }

  const author_photo_url =
    typeof r.author_photo_url === 'string' && r.author_photo_url.trim()
      ? r.author_photo_url.trim()
      : null;

  // Accept a plain YYYY-MM-DD (from <input type="date">) or an ISO
  // timestamp. We store as DATE in Postgres so either shape works —
  // just reject obvious garbage.
  let publish_date: string | null = null;
  if (typeof r.publish_date === 'string' && r.publish_date.trim()) {
    const raw = r.publish_date.trim();
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, status: 400, error: 'publish_date is not a valid date' };
    }
    publish_date = raw;
  }

  const sourceRaw = typeof r.source === 'string' ? r.source.trim().toLowerCase() : 'manual';
  const source = (ALLOWED_SOURCES as readonly string[]).includes(sourceRaw)
    ? (sourceRaw as Source)
    : null;
  if (!source) {
    return {
      ok: false,
      status: 400,
      error: `source must be one of ${ALLOWED_SOURCES.join(', ')}`,
    };
  }

  const featured = r.featured === true;
  // visible defaults to true — an admin who forgets to set it gets a
  // publishable review, not a hidden one they then wonder about.
  const visible = r.visible === false ? false : true;

  const sortRaw = typeof r.sort_order === 'string' ? Number(r.sort_order) : r.sort_order;
  const sort_order =
    typeof sortRaw === 'number' && Number.isFinite(sortRaw) ? Math.trunc(sortRaw) : 0;

  return {
    ok: true,
    value: {
      id,
      author_name,
      author_photo_url,
      rating,
      text,
      publish_date,
      source,
      featured,
      visible,
      sort_order,
    },
  };
}

type ReturnedRow = {
  id: string;
  author_name: string;
  author_photo_url: string | null;
  rating: number;
  text: string;
  publish_date: string | null;
  source: Source;
  featured: boolean;
  visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const validated = validateReviewInput(req.body);
  if (!validated.ok) {
    return res.status(validated.status).json({ success: false, error: validated.error });
  }
  const v = validated.value;

  try {
    const sql = getDb();

    if (v.id) {
      const rows = (await sql`
        UPDATE reviews
        SET
          author_name = ${v.author_name},
          author_photo_url = ${v.author_photo_url},
          rating = ${v.rating},
          text = ${v.text},
          publish_date = ${v.publish_date},
          source = ${v.source},
          featured = ${v.featured},
          visible = ${v.visible},
          sort_order = ${v.sort_order}
        WHERE id = ${v.id}
        RETURNING
          id,
          author_name,
          author_photo_url,
          rating,
          text,
          to_char(publish_date, 'YYYY-MM-DD') AS publish_date,
          source,
          featured,
          visible,
          sort_order,
          created_at,
          updated_at
      `) as ReturnedRow[];

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Review not found' });
      }

      return res.status(200).json({ success: true, review: rows[0] });
    }

    const rows = (await sql`
      INSERT INTO reviews (
        author_name, author_photo_url, rating, text,
        publish_date, source, featured, visible, sort_order
      )
      VALUES (
        ${v.author_name}, ${v.author_photo_url}, ${v.rating}, ${v.text},
        ${v.publish_date}, ${v.source}, ${v.featured}, ${v.visible}, ${v.sort_order}
      )
      RETURNING
        id,
        author_name,
        author_photo_url,
        rating,
        text,
        to_char(publish_date, 'YYYY-MM-DD') AS publish_date,
        source,
        featured,
        visible,
        sort_order,
        created_at,
        updated_at
    `) as ReturnedRow[];

    return res.status(200).json({ success: true, review: rows[0] });
  } catch (err) {
    console.error('[admin/reviews-upsert] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
