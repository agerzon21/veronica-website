/**
 * Admin: list all Journal posts (drafts + published).
 *
 * POST { password }
 *   → 200 { success, level, posts: [...] }
 *   → 401 on bad password
 *
 * Returns a summary per post — enough for the admin list view.
 * Full post content (body_markdown, resolved Drive photos) is
 * fetched on-demand via journal-detail when the editor opens.
 *
 * For each post with a Drive folder, we resolve the first photo
 * so the admin row can show it as a thumbnail (matching what
 * visitors will see as the post's cover). The fan-out is parallel
 * and errors on any one post are swallowed — a Drive hiccup on one
 * post shouldn't take down the whole list.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { extractFolderId, listFolderMedia } from '../_drive.js';

type Row = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  session_type: string | null;
  tags: string[];
  status: 'draft' | 'published';
  published_at: string | null;
  updated_at: string;
  created_at: string;
  drive_folder_url: string | null;
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
        id, slug, title, excerpt,
        session_type, tags, status, published_at,
        updated_at, created_at, drive_folder_url
      FROM journal_posts
      ORDER BY
        COALESCE(published_at, updated_at) DESC,
        updated_at DESC
    `) as Row[];

    // Resolve first Drive photo per post in parallel — same pattern
    // as the public list endpoint. Returns null cover for posts with
    // no folder or a Drive failure; the UI falls back to a book icon.
    const posts = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        cover_image_url: await resolveFirstPhotoUrl(r.drive_folder_url),
      })),
    );

    return res.status(200).json({
      success: true,
      level: auth.level,
      posts,
    });
  } catch (err) {
    console.error('[admin/journal-list] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

async function resolveFirstPhotoUrl(driveFolderUrl: string | null): Promise<string | null> {
  if (!driveFolderUrl) return null;
  const folderId = extractFolderId(driveFolderUrl);
  if (!folderId) return null;
  try {
    const files = await listFolderMedia(folderId);
    return files[0]?.thumbnailUrl ?? null;
  } catch (err) {
    console.error('[admin/journal-list] Drive listing failed for one post:', err);
    return null;
  }
}
