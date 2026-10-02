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
 * Anything else, a Drive thumbnail, a site asset, a URL carrying a query
 * gets no srcset and keeps its own src. The gallery has had photographs from
 * more than one source before and will again.
 */
const GALLERY_PHOTO = /^\/assets\/photos\/(portraits|weddings|family|maternity)\/([^/?#]+)\.webp$/;

/**
 * `originalWidth` drops the rungs that are not really that wide.
 *
 * build-grid-variants.mjs resizes withoutEnlargement, so for a photograph
 * narrower than a rung that rung is the SAME pixels re-encoded at q76 while
 * its `w` descriptor still claims the rung's width. 11 of the 232 published
 * photographs are narrower than 1600. A grid tile downscales far enough to
 * hide that, so the gallery passes nothing and keeps the list it has today;
 * a caller that paints the photograph large passes the width so the original
 * stays the only full-detail candidate. Painted through Chrome into the
 * individual photo page's box at 1440x1200 DPR 2, the g1600 of the six such
 * photographs with local files measured 0.73x to 0.92x of the original's mean
 * absolute Laplacian, for 7 to 31 KiB.
 */
export function gridSrcSet(url: string | undefined, originalWidth?: number | null): string | undefined {
  if (!url || !import.meta.env.PROD) return undefined;
  const match = GALLERY_PHOTO.exec(url);
  if (!match) return undefined;
  const [, category, slug] = match;
  const rungs = WIDTHS.filter((w) => originalWidth == null || w < originalWidth).map(
    (w) => `/assets/grid/${category}/${slug}-g${w}.webp ${w}w`,
  );
  // AND THE ORIGINAL, whenever the caller told us how wide it is. One rule:
  // pass a width and the original becomes the top candidate; pass nothing and
  // the list is exactly the three rungs it has always been.
  //
  // Two callers paint past the top rung and would otherwise be capped at
  // 1600: the individual photo page, and the four /gallery category panels,
  // which are 65vh tall and scale by HEIGHT under object-fit: cover, so they
  // consume about 0.98 * vh of source width (measured 2880 device px on a
  // 1440x900 laptop at DPR 2 against a 3500px original). Capping those would
  // take a photograph the visitor can see at full resolution today and soften
  // it, which is the one trade a photographer's portfolio cannot make.
  //
  // A caller that passes nothing keeps exactly the list it has always had.
  if (originalWidth) {
    rungs.push(`${url} ${originalWidth}w`);
  }
  if (!rungs.length) return undefined;
  return rungs.join(', ');
}
