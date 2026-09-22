/**
 * The gallery grid's srcset, built by convention rather than from a manifest.
 *
 * scripts/build-grid-variants.mjs writes
 *   public/assets/grid/<category>/<slug>-g{400,800,1600}.webp
 * for every photograph under public/assets/photos/<category>/, during the
 * build, immediately after build-gallery-statics.mjs has downloaded the ones
 * that are not in git. `npm run grid-variants:check` runs straight afterwards
 * and fails the build if a single rung is missing, which is the contract that
 * lets this file construct URLs instead of importing a map: 232 photographs
 * times three rungs is roughly 40KB of JSON in the bundle to express a rule
 * that fits on one line.
 *
 * DEV SERVES ORIGINALS, deliberately. The derivatives are gitignored, so a
 * fresh clone running `npm run dev` has none of them, and a srcset candidate
 * that 404s does not fall back to another candidate: Chrome fails the image.
 * Returning undefined there means dev shows the full-size original, which is
 * heavy and correct. Everything below is exercised by the real build, which
 * is what the harness serves.
 */

/** Must match WIDTHS in scripts/build-grid-variants.mjs. */
const WIDTHS = [400, 800, 1600];

/**
 * Only the four public-gallery folders, and only a bare `.webp` slug.
 *
 * Anything else — a Drive thumbnail, a site asset, a URL carrying a query —
 * gets no srcset and keeps its own src. The gallery has had photographs from
 * more than one source before and will again.
 */
const GALLERY_PHOTO = /^\/assets\/photos\/(portraits|weddings|family|maternity)\/([^/?#]+)\.webp$/;

export function gridSrcSet(url: string | undefined): string | undefined {
  if (!url || !import.meta.env.PROD) return undefined;
  const match = GALLERY_PHOTO.exec(url);
  if (!match) return undefined;
  const [, category, slug] = match;
  return WIDTHS.map((w) => `/assets/grid/${category}/${slug}-g${w}.webp ${w}w`).join(', ');
}
