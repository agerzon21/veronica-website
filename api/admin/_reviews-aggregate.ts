/**
 * Admin: read or update the manually-maintained Google Reviews aggregate.
 *
 * Two keys live in system_state:
 *   - google_review_rating (TEXT, e.g. '5.0' or '4.9')
 *   - google_review_count  (TEXT holding an integer, e.g. '15')
 *
 * The public home page shows a "5.0 · 15 reviews on Google" badge that
 * links to Vero's Google profile. Rather than hit the Places API (which
 * requires a billed key and rate-limits itself into uselessness for a
 * small business), Vero updates these two values by hand whenever new
 * reviews land — a 10-second copy-edit that runs on the order of once
 * a month.
 *
 * POST { password }
 *   → 200 { success, rating: '5.0' | null, count: 15 | null, updated_at: ISO | null }
 * POST { password, rating: string, count: number }
 *   → 200 { success, rating, count, updated_at }
 *
 * A read call is distinguished from an update by the ABSENCE of both
 * `rating` and `count` in the body. Any admin (not just super) can edit
 * — this is copy-editing, not destructive.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

const KEY_RATING = 'google_review_rating';
const KEY_COUNT = 'google_review_count';

// Accept 0-5 with an optional single decimal — matches how Google
// itself formats aggregate ratings (e.g. '4.9', '5.0').
const RATING_REGEX = /^[0-5](\.\d)?$/;

interface AggregateRow {
  key: string;
  value: string | null;
  updated_at: string | null;
}

async function readAggregate(sql: ReturnType<typeof getDb>) {
  const rows = (await sql`
    SELECT key, value, updated_at
    FROM system_state
    WHERE key IN (${KEY_RATING}, ${KEY_COUNT})
  `) as AggregateRow[];

  let rating: string | null = null;
  let count: number | null = null;
  let updatedAt: string | null = null;

  for (const r of rows) {
    // Newest updated_at across the two rows — surfaces the most recent
    // edit regardless of which field the admin touched.
    if (r.updated_at && (!updatedAt || r.updated_at > updatedAt)) {
      updatedAt = r.updated_at;
    }
    if (r.key === KEY_RATING && typeof r.value === 'string' && r.value.trim()) {
      rating = r.value.trim();
    }
    if (r.key === KEY_COUNT && typeof r.value === 'string' && r.value.trim()) {
      const parsed = Number(r.value);
      if (Number.isFinite(parsed) && parsed >= 0) count = Math.trunc(parsed);
    }
  }

  return { rating, count, updatedAt };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const body = (req.body ?? {}) as { rating?: unknown; count?: unknown };
  const wantsUpdate = body.rating !== undefined || body.count !== undefined;

  try {
    const sql = getDb();

    if (!wantsUpdate) {
      const { rating, count, updatedAt } = await readAggregate(sql);
      return res.status(200).json({ success: true, rating, count, updated_at: updatedAt });
    }

    // Update path — both fields must be present and valid. Partial
    // updates aren't supported; the admin form always sends both.
    const rating = typeof body.rating === 'string' ? body.rating.trim() : '';
    if (!RATING_REGEX.test(rating)) {
      return res.status(400).json({
        success: false,
        error: 'rating must be a numeric string between 0.0 and 5.0',
      });
    }
    const countRaw = typeof body.count === 'string' ? Number(body.count) : body.count;
    if (
      typeof countRaw !== 'number' ||
      !Number.isFinite(countRaw) ||
      countRaw < 0 ||
      !Number.isInteger(countRaw)
    ) {
      return res.status(400).json({
        success: false,
        error: 'count must be a non-negative whole number',
      });
    }
    const countStr = String(countRaw);

    // Two upserts run serially — the system_state table is tiny and
    // the round-trip cost is negligible compared to the request
    // envelope. A transaction would be overkill for two independent
    // scalars that don't need to move atomically.
    await sql`
      INSERT INTO system_state (key, updated_at, value)
      VALUES (${KEY_RATING}, NOW(), ${rating})
      ON CONFLICT (key) DO UPDATE SET value = ${rating}, updated_at = NOW()
    `;
    await sql`
      INSERT INTO system_state (key, updated_at, value)
      VALUES (${KEY_COUNT}, NOW(), ${countStr})
      ON CONFLICT (key) DO UPDATE SET value = ${countStr}, updated_at = NOW()
    `;

    const fresh = await readAggregate(sql);
    return res.status(200).json({
      success: true,
      rating: fresh.rating,
      count: fresh.count,
      updated_at: fresh.updatedAt,
    });
  } catch (err) {
    console.error('[admin/reviews-aggregate] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
