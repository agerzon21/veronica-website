/**
 * Public read endpoint for Journal posts. Two actions:
 *
 *   GET /api/journal/list
 *     → { success, posts: [PostSummary, ...] }
 *     Returns all published posts, newest first. Each post's cover
 *     image + a small preview array (used by the timeline card's
 *     expanded state) are resolved from the Drive folder at request
 *     time. Cache-Control set so the CDN can serve most requests
 *     without re-listing Drive.
 *
 *   GET /api/journal/post?slug=<slug>
 *     → { success, post: PostFull }
 *     Returns a single post. The first photo in the Drive folder
 *     becomes the cover (shown as the hero above the body); the
 *     remaining photos form the gallery — no duplicate render of
 *     the hero at the bottom.
 *
 * There is no separate cover_image_url field any more — Vero orders
 * her photos in Drive (prefixing filenames 01, 02, 03…) and the first
 * is treated as the cover. `cover_image_alt` is repurposed as alt
 * text for that first photo.
 *
 * Draft posts are 404 from both routes. Admin editing goes through
 * /api/admin/journal-*.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';
import { extractFolderId, listFolderMedia, type DriveFile } from './_drive.js';

// How many photos to return per post in the list response — enough
// for the timeline card's small cover thumb + a 4–5 photo preview
// grid shown when the card is expanded, without pulling the full
// gallery for every post.
const LIST_PREVIEW_PHOTOS = 5;

type PostSummary = {
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string | null;   // convenience: same as photos[0]?.url
  cover_image_alt: string | null;
  photos: PhotoOut[];               // up to LIST_PREVIEW_PHOTOS
  session_type: string | null;
  tags: string[];
  published_at: string;
  /**
   * Set only when this entry belongs to a multi-part story.
   *
   * The list carries the three columns but NOT the sibling entries, unlike
   * the single-post response. A caller that wants the whole story already has
   * every published entry in this same array and can group by series_slug;
   * resolving siblings per row would mean a Drive listing per part on a
   * response that already fans out once per post.
   */
  series_slug: string | null;
  series_part: number | null;
  series_label: string | null;
};

type PhotoOut = {
  url: string;         // src for <img>
  fullUrl: string;     // src for lightbox / full-view
  alt: string;
  caption?: string;
};

type PostFull = Omit<PostSummary, 'photos'> & {
  body_markdown: string;
  cover_photo: PhotoOut | null;     // first photo, rendered as hero
  photos: PhotoOut[];               // gallery (everything AFTER the cover)
  updated_at: string;
  /** Every published entry in that story, this one included, in order. */
  series: Array<{ slug: string; title: string; excerpt: string; part: number | null; cover: string | null }>;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;

  if (action === 'list') return handleList(req, res);
  if (action === 'post') return handlePost(req, res);

  return res.status(404).json({ success: false, error: 'Not found' });
}

interface ListRow {
  slug: string;
  title: string;
  excerpt: string;
  cover_image_alt: string | null;
  drive_folder_url: string | null;
  session_type: string | null;
  tags: string[];
  published_at: string;
  series_slug: string | null;
  series_part: number | null;
  series_label: string | null;
}

async function handleList(_req: VercelRequest, res: VercelResponse) {
  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT
        slug, title, excerpt,
        cover_image_alt, drive_folder_url,
        session_type, tags, published_at,
        series_slug, series_part, series_label
      FROM journal_posts
      WHERE status = 'published' AND published_at IS NOT NULL
      ORDER BY published_at DESC
      LIMIT 200
    `) as ListRow[];

    // Fan out Drive listings in parallel so the card can render its
    // cover thumb + preview grid without a second request. 5-minute
    // edge cache below means most requests skip this entirely.
    const posts: PostSummary[] = await Promise.all(
      rows.map(async (r) => {
        const previewPhotos = await listPreviewPhotos(r.drive_folder_url, r.title);
        const cover = previewPhotos[0] ?? null;
        // First photo's alt gets the explicit cover_image_alt if Vero
        // set one; everything else falls back to the post title.
        if (cover && r.cover_image_alt) cover.alt = r.cover_image_alt;
        return {
          slug: r.slug,
          title: r.title,
          excerpt: r.excerpt,
          cover_image_url: cover?.url ?? null,
          cover_image_alt: r.cover_image_alt,
          photos: previewPhotos,
          session_type: r.session_type,
          tags: r.tags,
          published_at: r.published_at,
          series_slug: r.series_slug,
          series_part: r.series_part,
          series_label: r.series_label,
        };
      }),
    );

    // 5-minute edge cache. Journal posts change infrequently (weekly
    // or slower) and even a brief cache dramatically cuts Drive
    // fanout under a traffic spike. Vero's edits show up within
    // 5 min without any purge required.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ success: true, posts });
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
        cover_image_alt, drive_folder_url,
        session_type, tags, published_at, updated_at,
        series_slug, series_part, series_label
      FROM journal_posts
      WHERE slug = ${slug} AND status = 'published' AND published_at IS NOT NULL
      LIMIT 1
    `) as Array<{
      slug: string;
      title: string;
      excerpt: string;
      body_markdown: string;
      cover_image_alt: string | null;
      drive_folder_url: string | null;
      session_type: string | null;
      tags: string[];
      published_at: string;
      updated_at: string;
      series_slug: string | null;
      series_part: number | null;
      series_label: string | null;
    }>;

    const row = rows[0];
    if (!row) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Resolve the Drive folder to a photo list at request time. If the
    // folder isn't set or Drive is unreachable, we return an empty
    // photo list rather than 500 — the post is still viewable (body
    // + no cover) and Vero can see the missing gallery.
    const allPhotos = await listAllPhotos(row.drive_folder_url, row.title);
    const coverPhoto = allPhotos[0] ?? null;
    if (coverPhoto && row.cover_image_alt) coverPhoto.alt = row.cover_image_alt;
    // Gallery photos = everything AFTER the cover. This is how we
    // dedupe — the hero at the top is the same file as photos[0], so
    // if we included it in the grid too it'd render twice.
    const galleryPhotos = allPhotos.slice(1);

    /**
     * The other entries in this story, if it is part of one.
     *
     * Published only, because an unpublished part two must not be announced at
     * the bottom of part one before it exists. Ordered by part number, which
     * is the whole reason series_part is a column rather than a tag.
     *
     * Allowed to fail: a companion link is a nicety, and a post that 500s
     * because its sibling lookup threw would be a far worse outcome than a
     * post with no link at the bottom.
     */
    let series: Array<{ slug: string; title: string; excerpt: string; part: number | null; cover: string | null }> = [];
    if (row.series_slug) {
      try {
        const sibs = (await sql`
          SELECT slug, title, excerpt, series_part, drive_folder_url
          FROM journal_posts
          WHERE series_slug = ${row.series_slug}
            AND status = 'published' AND published_at IS NOT NULL
          ORDER BY series_part ASC NULLS LAST, published_at ASC
        `) as Array<{ slug: string; title: string; excerpt: string; series_part: number | null; drive_folder_url: string | null }>;
        // The cover is the first photo in each sibling's Drive folder, the
        // same rule this endpoint already uses for the post's own cover.
        series = await Promise.all(
          sibs.map(async (sib) => ({
            slug: sib.slug,
            title: sib.title,
            excerpt: sib.excerpt,
            part: sib.series_part,
            cover:
              sib.slug === row.slug
                ? coverPhoto?.url ?? null
                : (await listAllPhotos(sib.drive_folder_url, sib.title))[0]?.url ?? null,
          })),
        );
      } catch (err) {
        console.error('[journal] series lookup failed (continuing):', err);
      }
    }

    const post: PostFull = {
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      body_markdown: row.body_markdown,
      cover_image_url: coverPhoto?.url ?? null,
      cover_image_alt: row.cover_image_alt,
      cover_photo: coverPhoto,
      photos: galleryPhotos,
      session_type: row.session_type,
      tags: row.tags,
      published_at: row.published_at,
      updated_at: row.updated_at,
      series_slug: row.series_slug,
      series_part: row.series_part,
      series_label: row.series_label,
      series,
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

/**
 * List up to LIST_PREVIEW_PHOTOS photos from a Drive folder. Returns
 * empty array if the folder isn't set, invalid, or Drive fails — the
 * caller decides how to render that state. Silent on error so a Drive
 * hiccup on one post doesn't take down the whole list response.
 */
async function listPreviewPhotos(
  driveFolderUrl: string | null,
  postTitle: string,
): Promise<PhotoOut[]> {
  if (!driveFolderUrl) return [];
  const folderId = extractFolderId(driveFolderUrl);
  if (!folderId) return [];
  try {
    const files = await listFolderMedia(folderId);
    return files.slice(0, LIST_PREVIEW_PHOTOS).map((f) => driveFileToPhoto(f, postTitle));
  } catch (err) {
    console.error('[journal/list] Drive listing failed for one post:', err);
    return [];
  }
}

async function listAllPhotos(
  driveFolderUrl: string | null,
  postTitle: string,
): Promise<PhotoOut[]> {
  if (!driveFolderUrl) return [];
  const folderId = extractFolderId(driveFolderUrl);
  if (!folderId) return [];
  try {
    const files = await listFolderMedia(folderId);
    return files.map((f) => driveFileToPhoto(f, postTitle));
  } catch (err) {
    console.error('[journal/post] Drive listing failed:', err);
    return [];
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
