/**
 * The public gallery's categories: the one list the gallery API, the Drive
 * sync, the admin Gallery tab and the public pages all read.
 *
 * WHERE A PHOTO'S CATEGORY COMES FROM. The Drive gallery folder has one
 * subfolder per category, named like these slugs (case does not matter).
 * The sync (api/cron/_gallery-sync.ts) files each new photo under its
 * subfolder's name, as a draft, and gallery_photos.category is CHECKed
 * against this same list (migration 053).
 *
 * ADDING ONE: a migration widening that CHECK, this list, its tile and hero
 * (src/components/GalleryCategories.tsx, src/pages/Gallery.tsx), its SEO
 * entry (src/components/SEO.tsx), its page copy (CATEGORY_META in
 * scripts/prerender-photos.mjs) and its admin label (gallery.categoryNames
 * in src/i18n/admin.ts). The build scripts read this file directly
 * (scripts/gallery-categories.mjs), and the prerender refuses to build when
 * a category here has no page copy.
 *
 * Imports nothing: api/ reaches this file (scripts/check-api-imports.mjs).
 */

export const GALLERY_CATEGORIES = ['portraits', 'weddings', 'family', 'maternity', 'proposals', 'aerial'] as const;

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];

export function isGalleryCategory(v: unknown): v is GalleryCategory {
  return typeof v === 'string' && (GALLERY_CATEGORIES as readonly string[]).includes(v);
}

/**
 * Categories with a tile but no public gallery yet. The tile says "Coming
 * soon", the page 404s, and their photos stay off every public list, the
 * sitemap and related photos, even once published in the admin, so photos
 * can be synced, reviewed and published ahead of the opening.
 *
 * OPENING ONE is a single change: take it off this list, give it a cover in
 * GalleryCategories.tsx and Gallery.tsx (and build that photo's hero
 * variants, scripts/build-hero-variants.mjs), add its SEO entry, and add it to
 * the /gallery/:category rewrite in vercel.json.
 */
export const GALLERY_COMING_SOON: readonly GalleryCategory[] = ['aerial'];

/** A category whose gallery the public can see. */
export function isPublicGalleryCategory(v: unknown): v is GalleryCategory {
  return isGalleryCategory(v) && !GALLERY_COMING_SOON.includes(v);
}
