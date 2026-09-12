/**
 * Public payload for the /wedding-photography page, dispatched from
 * api/gallery.ts as GET /api/gallery/wedding-page (underscore file —
 * NOT a serverless function; the 12-function budget is spent).
 *
 * One request returns everything dynamic the page shows:
 *
 *   { success,
 *     heroes:  [{ url, fullUrl }],          // admin-pinned constants
 *     photos:  [{ url, fullUrl, alt }],     // the sprinkle pool (Drive folder)
 *     vendors: [{ name, category, blurb, websiteUrl, instagram, photoUrl }],
 *     featuredSlugs: [slug, ...] }          // ordered journal picks
 *
 * The page pairs featuredSlugs with /api/journal/list (also edge-cached)
 * to get titles/covers — journal already resolves those, no duplication.
 *
 * Failure posture mirrors api/journal.ts: a Drive hiccup returns empty
 * arrays, never a 500 — the page falls back to its built-in photo strip.
 */

import galleryStatics from './_gallery-statics.json' with { type: 'json' };
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';
import { extractFolderId, listFolderMedia, normalizeImageUrl } from './_drive.js';

export const KEY_HEROES = 'weddings_page_heroes';
export const KEY_FOLDER = 'weddings_page_drive_folder';
export const KEY_FEATURED = 'weddings_featured_posts';
export const KEY_SELECTED = 'weddings_selected_work';

/** Parse a system_state JSON-array value defensively. */
function parseStringArray(raw: string | null | undefined, cap: number): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .slice(0, cap);
  } catch {
    return [];
  }
}

/**
 * CSS object-position keywords the focus controls may use. An allowlist
 * because these values land verbatim in a style attribute.
 */
export const FOCUS_VALUES = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'left top',
  'right top',
  'left bottom',
  'right bottom',
] as const;
export type FocusValue = (typeof FOCUS_VALUES)[number];

export interface FeaturedEntry {
  slug: string;
  /** Focal point of the cover in the big slideshow stage. */
  focusStage: FocusValue;
  /** Focal point in the small thumbnail strip. */
  focusThumb: FocusValue;
}

const asFocus = (v: unknown): FocusValue =>
  typeof v === 'string' && (FOCUS_VALUES as readonly string[]).includes(v)
    ? (v as FocusValue)
    : 'center';

/**
 * The featured list started life as a plain array of slugs; it is now an
 * array of { slug, focusStage, focusThumb } so Vero can stop cover crops
 * from cutting faces. Both shapes parse — old stored values keep working
 * with centered defaults.
 */
export function parseFeatured(raw: string | null | undefined, cap: number): FeaturedEntry[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: FeaturedEntry[] = [];
    for (const item of arr) {
      if (typeof item === 'string' && item.trim()) {
        out.push({ slug: item.trim(), focusStage: 'center', focusThumb: 'center' });
      } else if (item && typeof item === 'object' && typeof item.slug === 'string' && item.slug.trim()) {
        out.push({
          slug: item.slug.trim(),
          focusStage: asFocus(item.focusStage),
          focusThumb: asFocus(item.focusThumb),
        });
      }
    }
    return out.slice(0, cap);
  } catch {
    return [];
  }
}

/** A pinned hero entry: Drive link or direct URL → {url w800, fullUrl w2000}. */
function heroToPhoto(raw: string): { url: string; fullUrl: string } | null {
  const normalized = normalizeImageUrl(raw);
  if (!normalized) return null;
  // normalizeImageUrl yields the w2000 thumbnail for Drive links; derive
  // the w800 sibling for small renders. Non-Drive URLs are used as-is
  // for both sizes.
  const small = normalized.replace(/([?&]sz=)w\d+/, '$1w800');
  return { url: small, fullUrl: normalized };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const sql = getDb();

    const stateRows = (await sql`
      SELECT key, value FROM system_state
      WHERE key IN (${KEY_HEROES}, ${KEY_FOLDER}, ${KEY_FEATURED}, ${KEY_SELECTED})
    `) as Array<{ key: string; value: string | null }>;
    const state = new Map(stateRows.map((r) => [r.key, r.value]));

    const heroes = parseStringArray(state.get(KEY_HEROES), 6)
      .map(heroToPhoto)
      .filter((h): h is { url: string; fullUrl: string } => h !== null);

    const featured = parseFeatured(state.get(KEY_FEATURED), 10);
    // Transitional: pages cached before the focus upgrade read this.
    const featuredSlugs = featured.map((f) => f.slug);

    // The sprinkle pool. Same degrade-to-empty posture as journal:
    // Drive being slow or the folder being unset must not 500 the page.
    let photos: Array<{ url: string; fullUrl: string; alt: string }> = [];
    const folderRaw = (state.get(KEY_FOLDER) ?? '').trim();
    if (folderRaw) {
      try {
        const folderId = extractFolderId(folderRaw);
        if (folderId) {
          const files = await listFolderMedia(folderId);
          photos = files.map((f) => ({
            url: f.thumbnailUrl,
            fullUrl: f.viewUrl,
            alt: 'Wedding photography by Veronika Gerzon',
          }));
        }
      } catch (err) {
        console.error('[gallery/wedding-page] Drive listing failed:', err);
      }
    }

    // The clickable Selected Work mosaic: admin-curated PUBLIC GALLERY
    // photos (distinct from the ambient hero/folder pools). Resolved
    // against gallery_photos + the static-file manifest so a renamed or
    // unpublished slug silently drops out instead of 404ing a tile.
    const selectedSlugs = parseStringArray(state.get(KEY_SELECTED), 8);
    let selectedWork: Array<{ slug: string; url: string; alt: string }> = [];
    if (selectedSlugs.length > 0) {
      const rows = (await sql`
        SELECT slug, alt FROM gallery_photos
        WHERE status = 'published' AND deleted_at IS NULL
          AND category = 'weddings' AND slug = ANY(${selectedSlugs})
      `) as Array<{ slug: string; alt: string }>;
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      selectedWork = selectedSlugs
        .map((slug) => bySlug.get(slug))
        .filter((r): r is { slug: string; alt: string } => Boolean(r))
        .filter((r) => Boolean((galleryStatics as Record<string, string>)[`weddings/${r.slug}`]))
        .map((r) => ({
          slug: r.slug,
          url: `/assets/photos/weddings/${r.slug}.webp`,
          alt: r.alt,
        }));
    }

    const vendorRows = (await sql`
      SELECT name, category, blurb, website_url, instagram, photo_url
      FROM wedding_vendors
      WHERE active = TRUE
      ORDER BY sort_order, created_at
    `) as Array<{
      name: string;
      category: string;
      blurb: string;
      website_url: string | null;
      instagram: string | null;
      photo_url: string | null;
    }>;

    const vendors = vendorRows.map((v) => ({
      name: v.name,
      category: v.category,
      blurb: v.blurb,
      websiteUrl: v.website_url,
      instagram: v.instagram,
      photoUrl: normalizeImageUrl(v.photo_url),
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res
      .status(200)
      .json({ success: true, heroes, photos, vendors, featured, featuredSlugs, selectedWork });
  } catch (err) {
    console.error('[gallery/wedding-page] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
