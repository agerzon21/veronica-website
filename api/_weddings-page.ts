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
 * Focus values land verbatim in style attributes, so they are strictly
 * validated: either a legacy CSS keyword (the first iteration used
 * dropdowns) or, since the drag editors, a percentage pair like
 * "37% 62%" with both numbers clamped 0-100 at parse time.
 */
const FOCUS_KEYWORDS = [
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
const FOCUS_PERCENT_RE = /^(\d{1,3})% (\d{1,3})%$/;

export function asFocus(v: unknown): string {
  if (typeof v !== 'string') return '50% 50%';
  const s = v.trim();
  if ((FOCUS_KEYWORDS as readonly string[]).includes(s)) return s;
  const m = s.match(FOCUS_PERCENT_RE);
  if (m) {
    const x = Math.min(100, Number(m[1]));
    const y = Math.min(100, Number(m[2]));
    return `${x}% ${y}%`;
  }
  return '50% 50%';
}

export function isValidFocus(v: unknown): boolean {
  return (
    typeof v === 'string' &&
    ((FOCUS_KEYWORDS as readonly string[]).includes(v.trim()) || FOCUS_PERCENT_RE.test(v.trim()))
  );
}

/** Zoom multiplier for the drag editors: 1x to 3x, clamped. */
export function asZoom(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(3, Math.max(1, Math.round(n * 100) / 100));
}

export interface FeaturedEntry {
  slug: string;
  /** Focal point of the cover in the big slideshow stage. */
  focusStage: string;
  /** Focal point in the small thumbnail strip. */
  focusThumb: string;
  zoomStage: number;
  zoomThumb: number;
}

/** One curated gallery photo in the clickable Selected Work mosaic. */
export interface SelectedEntry {
  slug: string;
  focus: string;
  zoom: number;
}

export function parseSelected(raw: string | null | undefined, cap: number): SelectedEntry[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: SelectedEntry[] = [];
    for (const item of arr) {
      if (typeof item === 'string' && item.trim()) {
        out.push({ slug: item.trim(), focus: '50% 50%', zoom: 1 });
      } else if (item && typeof item === 'object' && typeof item.slug === 'string' && item.slug.trim()) {
        out.push({ slug: item.slug.trim(), focus: asFocus(item.focus), zoom: asZoom(item.zoom) });
      }
    }
    return out.slice(0, cap);
  } catch {
    return [];
  }
}

/**
 * The five PINNED photo slots. Not "heroes" anymore (Alex's correction):
 * these are the photos that must NOT reshuffle per visit, each with an
 * explicit job — 0-2 back the three package cards, 3 sits beside the
 * FAQ, 4 is the wide background of the closing quote section.
 */
export interface PinnedEntry {
  url: string;
  focus: string;
  zoom: number;
}

export function parsePinned(raw: string | null | undefined, cap: number): PinnedEntry[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: PinnedEntry[] = [];
    for (const item of arr) {
      if (typeof item === 'string') {
        out.push({ url: item.trim(), focus: '50% 50%', zoom: 1 });
      } else if (item && typeof item === 'object' && typeof item.url === 'string') {
        // Empty urls are kept: slots are POSITIONAL (0-2 packages, 3 FAQ,
        // 4 quote background), so an unfilled slot must hold its place.
        out.push({ url: item.url.trim(), focus: asFocus(item.focus), zoom: asZoom(item.zoom) });
      } else {
        out.push({ url: '', focus: '50% 50%', zoom: 1 });
      }
    }
    return out.slice(0, cap);
  } catch {
    return [];
  }
}

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
        out.push({
          slug: item.trim(),
          focusStage: '50% 50%',
          focusThumb: '50% 50%',
          zoomStage: 1,
          zoomThumb: 1,
        });
      } else if (item && typeof item === 'object' && typeof item.slug === 'string' && item.slug.trim()) {
        out.push({
          slug: item.slug.trim(),
          focusStage: asFocus(item.focusStage),
          focusThumb: asFocus(item.focusThumb),
          zoomStage: asZoom(item.zoomStage),
          zoomThumb: asZoom(item.zoomThumb),
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

    // POSITIONAL: index 0-2 = package cards, 3 = FAQ, 4 = quote section.
    // Unfilled slots stay as null so nothing shifts.
    const pinned = parsePinned(state.get(KEY_HEROES), 5).map((p) => {
      const photo = p.url ? heroToPhoto(p.url) : null;
      return photo ? { ...photo, focus: p.focus, zoom: p.zoom } : null;
    });

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
    const selectedEntries = parseSelected(state.get(KEY_SELECTED), 8);
    const selectedSlugs = selectedEntries.map((e) => e.slug);
    let selectedWork: Array<{ slug: string; url: string; alt: string; focus: string; zoom: number }> = [];
    if (selectedSlugs.length > 0) {
      const rows = (await sql`
        SELECT slug, alt FROM gallery_photos
        WHERE status = 'published' AND deleted_at IS NULL
          AND category = 'weddings' AND slug = ANY(${selectedSlugs})
      `) as Array<{ slug: string; alt: string }>;
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      selectedWork = selectedEntries
        .map((e) => {
          const row = bySlug.get(e.slug);
          if (!row) return null;
          if (!(galleryStatics as Record<string, string>)[`weddings/${e.slug}`]) return null;
          return {
            slug: e.slug,
            url: `/assets/photos/weddings/${e.slug}.webp`,
            alt: row.alt,
            focus: e.focus,
            zoom: e.zoom,
          };
        })
        .filter((r): r is { slug: string; url: string; alt: string; focus: string; zoom: number } =>
          r !== null,
        );
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

    // Short cache: Vero iterates on focus points and photo picks from the
    // admin panel and needs to see results within a minute, not five.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res
      .status(200)
      .json({ success: true, pinned, photos, vendors, featured, featuredSlugs, selectedWork });
  } catch (err) {
    console.error('[gallery/wedding-page] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
