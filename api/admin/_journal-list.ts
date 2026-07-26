/**
 * Admin: list all Journal posts (drafts + published).
 *
 * POST { password }
 *   → 200 { success, level, posts: [...] }
 *   → 401 on bad password
 *
 * Returns a summary per post — enough for the admin list view.
 * Full post content (body_markdown, photos array) is fetched on-demand
 * via journal-detail when the editor opens.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

type Row = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string | null;
  session_type: string | null;
  tags: string[];
  status: 'draft' | 'published';
  published_at: string | null;
  updated_at: string;
  created_at: string;
  photo_count: number;
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
    // jsonb_array_length gives the photo count without pulling the full
    // photos array over the wire — the list view only shows "N photos"
    // in a stat, no need for the payload.
    const rows = (await sql`
      SELECT
        id, slug, title, excerpt, cover_image_url,
        session_type, tags, status, published_at,
        updated_at, created_at,
        jsonb_array_length(photos) AS photo_count
      FROM journal_posts
      ORDER BY
        COALESCE(published_at, updated_at) DESC,
        updated_at DESC
    `) as Row[];

    return res.status(200).json({
      success: true,
      level: auth.level,
      posts: rows,
    });
  } catch (err) {
    console.error('[admin/journal-list] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
