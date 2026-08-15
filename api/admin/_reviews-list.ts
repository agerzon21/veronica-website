/**
 * Admin: list all reviews (visible + hidden, featured + not).
 *
 * POST { password }
 *   → 200 { success, level, reviews: [...] }
 *   → 401 on bad password
 *
 * Ordered so the newest/most-recently-published reviews rise to the
 * top — publish_date DESC with NULLs pushed to the bottom, then
 * created_at DESC as a stable tie-break. The admin table can offer
 * sort_order-based reordering later without changing this default.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

type Row = {
  id: string;
  author_name: string;
  author_photo_url: string | null;
  rating: number;
  text: string;
  publish_date: string | null;
  source: 'google' | 'yelp' | 'instagram' | 'email' | 'manual';
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

  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT
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
      FROM reviews
      ORDER BY
        publish_date DESC NULLS LAST,
        created_at DESC
    `) as Row[];

    return res.status(200).json({
      success: true,
      level: auth.level,
      reviews: rows,
    });
  } catch (err) {
    console.error('[admin/reviews-list] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
