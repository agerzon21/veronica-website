/**
 * Public read endpoint for gallery photos. Two actions:
 *
 *   GET /api/gallery/list?category=weddings
 *     → { success, photos: [PublicPhoto, ...] }
 *     Lists published photos in one category. Ordered by
 *     (sort_order DESC, published_at DESC). Edge-cached so gallery
 *     browsing doesn't hit the DB per view.
 *
 *   GET /api/gallery/post?category=weddings&slug=first-dance
 *     → { success, photo: PublicPhoto }
 *     Returns a single photo — powers /photo/<category>/<slug>.
 *
 * Both endpoints return null for width/height when Drive didn't
 * report dimensions; the client falls back to 3:2 in that case
 * (same as photos.ts's FALLBACK_DIMS did in the file-based era).
 *
 * URLs handed back are /api/photo?id=<drive_file_id> — the existing
 * proxy at /api/photo does the WebP transcode + edge cache. No
 * change to how images actually load.
 */

import galleryStatics from './_gallery-statics.json' with { type: 'json' };
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';

type Category = 'portraits' | 'weddings' | 'family' | 'maternity';
const CATEGORIES: readonly Category[] = ['portraits', 'weddings', 'family', 'maternity'] as const;

type PublicPhoto = {
  id: string;               // = slug — the URL identifier the frontend uses everywhere
  slug: string;
  category: Category;
  url: string;              // /api/photo?id=<drive_file_id> — served through the resizing proxy
  originalUrl: string;      // /api/photo?id=<drive_file_id> (unresized fallback)
  driveViewUrl: string;     // https://drive.google.com/file/d/<id>/view — for "open original"
  alt: string;
  title: string;            // suffixed with " | Vero Photography" for compatibility with existing consumers
  description: string;
  keywords: string[];
  width: number | null;
  height: number | null;
};

interface Row {
  slug: string;
  category: Category;
  drive_file_id: string;
  title: string;
  alt: string;
  description: string;
  keywords: string[];
  width: number | null;
  height: number | null;
}

const TITLE_SUFFIX = ' | Vero Photography';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;

  if (action === 'list') return handleList(req, res);
  if (action === 'post') return handlePost(req, res);
  if (action === 'related') return handleRelated(req, res);

  return res.status(404).json({ success: false, error: 'Not found' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const rawCat = req.query.category;
  const category = Array.isArray(rawCat) ? rawCat[0] : rawCat;
  if (category && !CATEGORIES.includes(category as Category)) {
    return res.status(400).json({ success: false, error: 'Invalid category' });
  }

  try {
    const sql = getDb();
    const rows = category
      ? ((await sql`
          SELECT slug, category, drive_file_id, title, alt, description, keywords, width, height
          FROM gallery_photos
          WHERE status = 'published'
            AND deleted_at IS NULL
            AND category = ${category}
          ORDER BY sort_order DESC, published_at DESC NULLS LAST
        `) as Row[])
      : ((await sql`
          SELECT slug, category, drive_file_id, title, alt, description, keywords, width, height
          FROM gallery_photos
          WHERE status = 'published'
            AND deleted_at IS NULL
          ORDER BY sort_order DESC, published_at DESC NULLS LAST
        `) as Row[]);

    const photos = rows.filter(hasStatic).map(rowToPublic);

    // 5-minute edge cache with generous SWR. Gallery pages get lots
    // of traffic; hitting the DB per view is unnecessary. Vero's
    // edits (draft→published, description tweaks) show up within
    // 5 min; the deploy hook fired by the sync cron also refreshes
    // the prerendered per-photo HTML pages.
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=600',
    );
    return res.status(200).json({ success: true, photos });
  } catch (err) {
    console.error('[gallery/list] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const rawSlug = req.query.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const rawCat = req.query.category;
  const category = Array.isArray(rawCat) ? rawCat[0] : rawCat;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ success: false, error: 'slug is required' });
  }

  try {
    const sql = getDb();
    // Category is optional in the query (individual photo route
    // has it in the URL); we filter on it if provided both to be
    // defensive and to avoid returning a same-slugged photo from
    // a different category (shouldn't happen due to UNIQUE(slug),
    // but explicit is better).
    const rows = category && CATEGORIES.includes(category as Category)
      ? ((await sql`
          SELECT slug, category, drive_file_id, title, alt, description, keywords, width, height
          FROM gallery_photos
          WHERE status = 'published'
            AND deleted_at IS NULL
            AND category = ${category}
            AND slug = ${slug}
          LIMIT 1
        `) as Row[])
      : ((await sql`
          SELECT slug, category, drive_file_id, title, alt, description, keywords, width, height
          FROM gallery_photos
          WHERE status = 'published'
            AND deleted_at IS NULL
            AND slug = ${slug}
          LIMIT 1
        `) as Row[]);

    const row = rows[0];
    if (!row) return res.status(404).json({ success: false, error: 'Photo not found' });

    // Shorter cache for individual posts than the list — Vero may
    // tweak a caption and want to see it live quickly.
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=120, stale-while-revalidate=600',
    );
    // Not exported yet, so there is no file to point at. 404 rather than
    // hand back a URL that would 404 as an image.
    if (!hasStatic(row)) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    return res.status(200).json({ success: true, photo: rowToPublic(row) });
  } catch (err) {
    console.error('[gallery/post] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * Related photos — for the "you might also like" strip on each
 * individual photo page. Same scoring algo photos.ts used to
 * compute in-memory: rank by keyword overlap, break ties by
 * same-category, then randomly. Moving it server-side keeps the
 * client from having to fetch the entire photo set just to
 * compute a top-6 list.
 */
async function handleRelated(req: VercelRequest, res: VercelResponse) {
  const rawSlug = req.query.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const rawLimit = req.query.limit;
  const limitStr = Array.isArray(rawLimit) ? rawLimit[0] : rawLimit;
  const limit = Math.max(1, Math.min(24, Number(limitStr) || 6));

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ success: false, error: 'slug is required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT slug, category, drive_file_id, title, alt, description, keywords, width, height
      FROM gallery_photos
      WHERE status = 'published' AND deleted_at IS NULL
    `) as Row[];

    const target = rows.find((r) => r.slug === slug);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Photo not found' });
    }
    const targetKeywords = new Set(target.keywords);

    const scored = rows
      .filter((r) => r.slug !== target.slug)
      .map((r) => {
        let overlap = 0;
        for (const k of r.keywords) if (targetKeywords.has(k)) overlap++;
        const sameCategory = r.category === target.category ? 1 : 0;
        return { row: r, overlap, sameCategory };
      })
      .filter((s) => s.overlap > 0)
      .sort((a, b) => {
        if (b.overlap !== a.overlap) return b.overlap - a.overlap;
        if (b.sameCategory !== a.sameCategory) return b.sameCategory - a.sameCategory;
        return Math.random() - 0.5;
      });

    const photos = scored
      .filter((s) => hasStatic(s.row))
      .slice(0, limit)
      .map((s) => rowToPublic(s.row));

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=600',
    );
    return res.status(200).json({ success: true, photos });
  } catch (err) {
    console.error('[gallery/related] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * Slug key -> static path, written by scripts/build-gallery-statics.mjs during
 * the build. A photo absent from here has no file in this deployment, so it is
 * hidden rather than served as a broken link; the nightly sync triggers a
 * rebuild that bakes it in.
 */
function hasStatic(row: Row): boolean {
  return Boolean((galleryStatics as Record<string, string>)[`${row.category}/${row.slug}`]);
}

function rowToPublic(row: Row): PublicPhoto {
  return {
    id: row.slug,
    slug: row.slug,
    category: row.category,
    // Static file, not the /api/photo proxy.
    //
    // The proxy meant every photo crossed Compute -> CDN, which Vercel bills as
    // Fast Origin Transfer, and the CDN cache resets on every deploy so the
    // whole set was re-fetched each time: ~532 KB per photo, ~121 MB per
    // deploy, for a gallery almost nobody browses. It also made the endpoint a
    // free quota drain, since any junk query param was a cache miss.
    //
    // Byte-for-byte this is a wash — measured across 8 photos, static is 2%
    // heavier in aggregate, some larger and some smaller — because the exporter
    // uses the same 2400px/q82 settings the proxy did.
    url: `/assets/photos/${row.category}/${row.slug}.webp`,
    originalUrl: `/assets/photos/${row.category}/${row.slug}.webp`,
    driveViewUrl: `https://drive.google.com/file/d/${row.drive_file_id}/view`,
    alt: row.alt,
    // Suffix matches how photos.ts built titles historically, so
    // existing consumers (SEO component, IndividualPhoto page)
    // don't need special-case handling.
    title: row.title ? `${row.title}${TITLE_SUFFIX}` : '',
    description: row.description,
    keywords: row.keywords,
    width: row.width,
    height: row.height,
  };
}
