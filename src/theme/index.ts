import { extendTheme } from '@chakra-ui/react';

/**
 * The design tokens.
 *
 * WHY THIS FILE EXISTS (AGAIN)
 * There was a src/theme/index.ts before. It was never passed to
 * <ChakraProvider>, so it silently did nothing for its entire life and was
 * deleted as dead code in 26426d0. This one IS wired — see src/App.tsx. If you
 * are editing this file, confirm the `theme` prop is still there before
 * assuming a change had no effect.
 *
 * It also does NOT bring back the old file's `touchAction: 'pan-y'` global.
 * That killed pinch-zoom over contract text in the client portal and
 * horizontal swipe on the portal pill strips.
 *
 * WHAT PROBLEM THIS SOLVES
 * An audit found TWENTY-ONE distinct gold-family hex values across 606
 * occurrences — including #8a6e35 and #8f7239, two near-identical darks doing
 * the same job. Same button type rendered differently depending on which file
 * you were in. These tokens are the single source of truth so a colour can be
 * changed in one place.
 *
 * NAMES ARE SEMANTIC, NOT VISUAL. `brand.accentText`, not `brand.darkGold` —
 * so a future palette change does not leave every token lying about itself.
 *
 * ── ACCESSIBILITY ──
 * The signature gold #c9a96e is 2.24:1 on white. That is fine for borders,
 * icons, dividers and hover accents (non-text, no WCAG text requirement) and
 * those keep the exact colour they have today. It FAILS for text and for white
 * text on a gold fill, both of which need 4.5:1. Hence the split between
 * `accent` (decorative, unchanged) and `accentText` (readable, darker).
 */

// ── Raw palette ────────────────────────────────────────────────────────────
// Measured contrast against white is noted for anything used as text.
const GOLD = '#c9a96e'; //  2.24:1 — decorative only, never text
const GOLD_TEXT = '#8a6e35'; //  4.81:1 — passes AA. Already used 39x in the codebase.
const GOLD_STRONG = '#b8964f'; //  2.79:1 — hover/active FILLS only, never text
const GOLD_SOFT = '#d4b87a'; //  1.92:1 — hover fill on dark
const GOLD_BORDER = '#e8d9a8'; //  1.41:1 — borders on cream
const CREAM = '#fdf9f0';
const CREAM_SUNKEN = '#f5efe4';

export const brand = {
  /** The signature gold. Borders, icons, dividers, rules, decorative fills. NEVER text. */
  accent: GOLD,
  /** Gold as readable text on a light background. 4.81:1. */
  accentText: GOLD_TEXT,
  /** Hover/active fill. Not for text. */
  accentStrong: GOLD_STRONG,
  /** Hover fill against dark backgrounds. */
  accentSoft: GOLD_SOFT,
  /** Hairline borders on cream surfaces. */
  accentBorder: GOLD_BORDER,
  /** Warm page/card surface. */
  surface: CREAM,
  /** Recessed surface — inputs, wells. */
  surfaceSunken: CREAM_SUNKEN,
} as const;

const theme = extendTheme({
  colors: {
    brand,
  },

  /**
   * Gold focus rings and bezels were written as raw CSS strings at 41 sites —
   * `boxShadow: '0 0 0 1px #c9a96e'`. A colour token cannot reach inside a CSS
   * string, so those need their own scale or they silently keep the hardcoded
   * hex while everything around them is tokenised.
   */
  shadows: {
    accentFocus: `0 0 0 1px ${GOLD}`,
    accentFocusThick: `0 0 0 2px ${GOLD}`,
    accentGlow: `0 0 0 3px ${GOLD}33`,
  },

  /**
   * The site's small uppercase label ("ADMIN", "SCROLL", section eyebrows) was
   * hand-rolled with slightly different fontSize/letterSpacing/color in dozens
   * of places. One definition, used via `textStyle="eyebrow"`.
   *
   * Deliberately uses accentText, not accent: these are TEXT, and gold text was
   * the site's main contrast failure at 2.24:1.
   */
  textStyles: {
    eyebrow: {
      fontSize: 'xs',
      fontWeight: '500',
      letterSpacing: '0.25em',
      textTransform: 'uppercase',
      color: 'brand.accentText',
    },
    eyebrowOnDark: {
      fontSize: 'xs',
      fontWeight: '500',
      letterSpacing: '0.25em',
      textTransform: 'uppercase',
      // On a dark background the light gold has plenty of contrast, so the
      // signature colour is correct here.
      color: 'brand.accent',
    },
  },
});

export default theme;
