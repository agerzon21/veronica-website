/**
 * Public read endpoint for Journal posts. Two actions:
 *
 *   GET /api/journal/list
 *     → { success, posts: [PostSummary, ...] }
 *     Returns all published posts, newest first. Summary shape only
 *     (no body_markdown, no photos payload) — used by the /journal
 *     timeline index. Cache-Control set so the CDN can serve most
 *     requests without touching the DB.
 *
 *   GET /api/journal/post?slug=<slug>
 *     → { success, post: PostFull }
 *     Returns a single post plus its resolved photo list. Photos come
 *     from the post's Drive folder, listed at request time — same
 *     pattern as client galleries. Vero adds/removes images in Drive
 *     and the site picks them up on the next request.
 *
 * Draft posts are 404 from both routes — this endpoint is intentionally
 * public-only. Admin editing goes through /api/admin/journal-*.
 *
 * Rewrites (vercel.json) let the frontend call /api/journal/list and
 * /api/journal/post?slug=… as clean URLs.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';
import { extractFolderId, listFolderMedia, type DriveFile } from './_drive.js';

type PostSummary = {
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  session_type: string | null;
  tags: string[];
  published_at: string;
};

type PhotoOut = {
  url: string;         // src for <img>
  fullUrl: string;     // src for lightbox / full-view
  alt: string;
  caption?: string;
};

type PostFull = PostSummary & {
  body_markdown: string;
  photos: PhotoOut[];
  updated_at: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;

  if (action === 'list') return handleList(req, res);
  if (action === 'post') return handlePost(req, res);

  return res.status(404).json({ success: false, error: 'Not found' });
}

async function handleList(_req: VercelRequest, res: VercelResponse) {
  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT
        slug, title, excerpt,
        cover_image_url, cover_image_alt,
        session_type, tags, published_at
      FROM journal_posts
      WHERE status = 'published' AND published_at IS NOT NULL
      ORDER BY published_at DESC
      LIMIT 200
    `) as PostSummary[];

    // 5-minute edge cache. Journal posts change infrequently and even
    // a brief cache dramatically cuts DB reads under a traffic spike.
    // Vero's edits show up within 5 min without any purge required.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ success: true, posts: rows });
  } catch (err) {
    console.error('[journal/list] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const rawSlug = req.query.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ success: false, error: 'slug is required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT
        slug, title, excerpt, body_markdown,
        cover_image_url, cover_image_alt, drive_folder_url,
        session_type, tags, published_at, updated_at
      FROM journal_posts
      WHERE slug = ${slug} AND status = 'published' AND published_at IS NOT NULL
      LIMIT 1
    `) as Array<{
      slug: string;
      title: string;
      excerpt: string;
      body_markdown: string;
      cover_image_url: string | null;
      cover_image_alt: string | null;
      drive_folder_url: string | null;
      session_type: string | null;
      tags: string[];
      published_at: string;
      updated_at: string;
    }>;

    const row = rows[0];
    if (!row) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Resolve the Drive folder to a photo list at request time. If
    // the folder isn't set or Drive is unreachable, we return an
    // empty photo list rather than 500 — the post is still viewable
    // (body + cover image) and Vero can see the missing gallery.
    let photos: PhotoOut[] = [];
    if (row.drive_folder_url) {
      const folderId = extractFolderId(row.drive_folder_url);
      if (folderId) {
        try {
          const files = await listFolderMedia(folderId);
          photos = files.map((f) => driveFileToPhoto(f, row.title));
        } catch (err) {
          console.error('[journal/post] Drive listing failed:', err);
        }
      }
    }

    const post: PostFull = {
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      body_markdown: row.body_markdown,
      cover_image_url: row.cover_image_url,
      cover_image_alt: row.cover_image_alt,
      photos,
      session_type: row.session_type,
      tags: row.tags,
      published_at: row.published_at,
      updated_at: row.updated_at,
    };

    // Shorter cache for individual posts than the list — Vero may
    // tweak a paragraph and want to see it live quickly.
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({ success: true, post });
  } catch (err) {
    console.error('[journal/post] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

function driveFileToPhoto(f: DriveFile, postTitle: string): PhotoOut {
  return {
    url: f.thumbnailUrl,   // sz=w800 — plenty for grid render
    fullUrl: f.viewUrl,    // sz=w2000 — lightbox
    // Drive doesn't give us alt text; use post title as a safe fallback
    // so screen readers get something meaningful instead of "image".
    alt: postTitle,
  };
}
