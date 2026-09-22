import heroVariants from '../data/hero-variants.json';
import heroVariantsDesktop from '../data/hero-variants-desktop.json';

/**
 * srcset builders for the photographs served at full-bleed size.
 *
 * Both manifests are written by scripts/build-hero-variants.mjs and committed,
 * never built. `npm run hero-variants:check` fails the build if either drifts
 * from what is on disk or from what is committed.
 *
 * The `?? original` fallbacks are deliberate throughout: a stale manifest or a
 * missing derivative serves the original rather than rendering a blank hero.
 * Slower, never broken.
 */
const MOBILE = heroVariants as Record<string, Record<string, string>>;
const DESKTOP = heroVariantsDesktop as {
  rungs: Record<string, Record<string, string>>;
  originalWidths: Record<string, number>;
};

/**
 * The carousel's DESKTOP candidates, for the element that is only ever shown
 * from lg up. The ORIGINAL stays the widest candidate, so a large retina
 * display still gets the untouched file; everything smaller takes a rung.
 */
export const desktopSrcSetFor = (original: string): string | undefined => {
  const rungs = DESKTOP.rungs[original];
  const width = DESKTOP.originalWidths[original];
  if (!rungs || !Object.keys(rungs).length || !width) return undefined;
  return [
    ...Object.entries(rungs).map(([w, path]) => `${path} ${w}w`),
    `${original} ${width}w`,
  ].join(', ');
};

/**
 * EVERY candidate, mobile rungs and desktop rungs together, for a page hero.
 *
 * A page hero is one <img> that serves every screen, unlike the homepage
 * carousel, which renders a separate element per breakpoint and so can take a
 * separate srcset for each. That is the whole reason this is a different
 * function rather than a parameter: there is no breakpoint to choose by, so
 * the browser gets the full ladder and picks on width.
 *
 * The two halves of the ladder were encoded at different qualities (72 for
 * mobile rungs, 78 for desktop). That is not a mistake to tidy up: a phone
 * rung is displayed at 2-3x device pixel ratio where compression artefacts
 * are invisible, and a 1440px desktop hero is not.
 *
 * Sorted by width, because a srcset is a set of candidates rather than an
 * ordered list and an unsorted one is merely harder to read in devtools.
 */
export const pageHeroSrcSet = (original: string): string | undefined => {
  const entries: Array<[number, string]> = [];
  for (const [w, path] of Object.entries(MOBILE[original] ?? {})) entries.push([Number(w), path]);
  for (const [w, path] of Object.entries(DESKTOP.rungs[original] ?? {})) entries.push([Number(w), path]);
  if (!entries.length) return undefined;

  const width = DESKTOP.originalWidths[original];
  // The original is only a candidate when its real width is known. Without it
  // the descriptor would be a guess, and a wrong `w` makes the browser pick
  // badly in BOTH directions.
  if (width) entries.push([width, original]);

  return entries
    .sort((a, b) => a[0] - b[0])
    .map(([w, path]) => `${path} ${w}w`)
    .join(', ');
};

/**
 * The widest MOBILE rung, as a plain `src` for anything that ignores srcset.
 *
 * Not the original: a browser old enough to ignore srcset is not a browser
 * worth sending 4289 pixels to.
 */
export const pageHeroFallback = (original: string): string =>
  MOBILE[original]?.['1600'] ?? original;
