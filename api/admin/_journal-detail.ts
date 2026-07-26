/**
 * Admin: fetch a single Journal post by id.
 *
 * POST { password, id }
 *   → 200 { success, post }
 *   → 400 missing id
 *   → 401 bad password
 *   → 404 no such post
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
  photos: Array<{ url: string; alt?: string; caption?: string }>;
  session_type: string | null;
  tags: string[];
  status: 'draft' | 'published';
  published_at: string | null;
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

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!id) {
    return res.status(400).json({ success: false, error: 'id is required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT
        id, slug, title, excerpt, body_markdown,
        cover_image_url, cover_image_alt, photos,
        session_type, tags, status, published_at,
        created_at, updated_at
      FROM journal_posts
      WHERE id = ${id}
      LIMIT 1
    `) as Row[];

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    return res.status(200).json({ success: true, post: rows[0] });
  } catch (err) {
    console.error('[admin/journal-detail] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
