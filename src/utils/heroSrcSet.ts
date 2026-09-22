import heroVariantsDesktop from '../data/hero-variants-desktop.json';
import photoSrcsets from '../data/photo-srcsets.json';

/**
 * srcset lookups for the photographs that have generated derivatives.
 *
 * NOTHING IS COMPUTED HERE. scripts/build-hero-variants.mjs writes
 * src/data/photo-srcsets.json with the finished candidate list for each
 * photograph, and this file looks it up. That is not laziness, it is the only
 * way to guarantee one particular thing: scripts/prerender-photos.mjs emits a
 * <link rel="preload"> for the LCP hero of each static page, and a preload
 * whose candidate list differs from the img's by a single character is not a
 * slow preload, it is a SECOND DOWNLOAD of the largest image on the page.
 * TypeScript and plain .mjs cannot share a function; they can share a JSON
 * file. `npm run hero-variants:check` fails the build if it drifts.
 *
 * The `?? undefined` fallbacks are deliberate: a photograph with no entry
 * gets no srcset and keeps its own src. Heavier, never broken.
 */
const SRCSETS = photoSrcsets as Record<string, { srcset: string; src: string }>;

const DESKTOP = heroVariantsDesktop as {
  rungs: Record<string, Record<string, string>>;
  originalWidths: Record<string, number>;
};

/**
 * The homepage carousel's DESKTOP candidates, for the element that is only
 * ever shown from lg up. Still computed, because the carousel renders a
 * separate element per breakpoint and so takes a separate srcset for each —
 * it is the one caller that must NOT get the full ladder.
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
 * Every candidate for a photograph served at one element across all screens:
 * a full-bleed page hero, or an inline photograph in a column.
 *
 * The two halves of a hero ladder were encoded at different qualities (72 for
 * mobile rungs, 78 for desktop and inline). Not a mistake to tidy up: a phone
 * rung is displayed at 2-3x device pixel ratio where compression artefacts
 * are invisible, and a 1440px desktop hero is not.
 */
export const pageHeroSrcSet = (original: string): string | undefined =>
  SRCSETS[original]?.srcset;

/**
 * The `src` to pair with it: the widest MOBILE rung where there is one.
 *
 * Not the original. A browser old enough to ignore srcset is not one to hand
 * a 4289px photograph to.
 */
export const pageHeroFallback = (original: string): string =>
  SRCSETS[original]?.src ?? original;

/** Is this photograph optimised at all? Used to decide whether to preload. */
export const hasSrcSet = (original: string): boolean => Boolean(SRCSETS[original]);
