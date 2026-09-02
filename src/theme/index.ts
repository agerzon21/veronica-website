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
  fonts: {
    // Cormorant Garamond for display, Jost for everything else. Loaded in
    // index.html; see the note there on why they are self-hosted and preloaded.
    //
    // The serif fallback on `heading` is deliberate — if the webfont is slow,
    // Georgia shifts the layout far less than the system sans would, which
    // protects a CLS of 0.
    heading: `'Cormorant Garamond', Georgia, 'Times New Roman', serif`,
    body: `'Jost', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`,
  },

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
   * ONE type system. Every heading, label and paragraph on the public site
   * resolves to one of these.
   *
   * WHY: an audit of the public pages found 258 distinct type treatments. The
   * same gold eyebrow existed at four letter-spacings (0.2 / 0.25 / 0.3 / 0.4em)
   * and four sizes including two written as raw pixel strings. The h1 was
   * uppercase with 0.3em tracking on Contact, sentence case at 0.02em on
   * Journal, a third size ramp on Gallery, and hidden offscreen entirely on
   * About. The divider rule under a title was 40px on nine pages and 35px on
   * eleven, and sat ABOVE the title on five pages and BELOW it on three.
   *
   * That is what "the site feels unsynched" was describing.
   *
   * SCALE CONTRAST IS DELIBERATE. The old range ran 48px down to 12px, roughly
   * 4:1, with everything bunched in the middle — which reads as unfinished
   * rather than minimal. pageTitle now runs 40 / 64 / 80px against an 11px
   * eyebrow, about 7:1. The white space is unchanged; the commitment is not.
   *
   * Sized down twice from the first attempt at 44/72/92. 80px still read as
   * "exactly the same" as 92 — which it nearly is, a 13% step. Now 36/52/68,
   * a 26% cut from 92 at the top and a real reduction at every breakpoint.
   *
   * Worth knowing when judging this: Chakra's lg breakpoint is 62em/992px, so
   * a browser window narrower than that never sees the lg size at all. Between
   * 48em and 62em the title is the md value.
   *
   * fontFamily is set EXPLICITLY on every display token. Chakra's <Text>
   * resolves fonts.body, and 32 of the site's 34 headings are <Text as="h1">,
   * so a heading face declared only in `fonts.heading` would render on nothing.
   *
   * Negative marginRight on tracked uppercase cancels the trailing letter-space
   * so centred labels are optically centred. It replaces the hand-tuned
   * `pl="0.3em"` nudges that were doing this by eye.
   */
  /**
   * Layout scale. The audit found seven text-column widths (400 / 440 / 480 /
   * 500 / 620 / 720 / 820px), four header top-paddings (80 / 96 / 112 / 128px)
   * and section padding chosen per page. Contact and ThankYou — the same flow,
   * one click apart — used 400px and 440px.
   *
   * Measures are in `ch` so the column follows the type size rather than
   * approximating it in pixels.
   */
  sizes: {
    measure: '46ch',
    measureWide: '68ch',
    contentNarrow: '45rem',
    content: '62.5rem',
    contentWide: '75rem',
  },

  /**
   * Vertical rhythm. Two section sizes and one page-top, applied everywhere,
   * so the eye learns the interval instead of meeting a new one per page.
   *
   * `pageTop` clears the fixed 72px navbar with room to spare — that height
   * was hardcoded in three separate files and halved in a fourth.
   */
  layerStyles: {
    pageTop: { pt: { base: '5.5rem', md: '7rem' } },
    section: { py: { base: '3.5rem', md: '6rem' } },
    sectionTight: { py: { base: '2.5rem', md: '4rem' } },
    sectionFlush: { py: { base: '2rem', md: '3rem' } },
  },

  textStyles: {
    // ── Display: Cormorant Garamond, one ramp, sentence case ──
    pageTitle: {
      fontFamily: 'heading',
      fontSize: { base: '2.25rem', md: '3.25rem', lg: '4.25rem' },
      fontWeight: '300',
      letterSpacing: { base: '0.005em', md: '0em' },
      lineHeight: 1.02,
      color: 'gray.800',
    },
    contentTitle: {
      fontFamily: 'heading',
      fontSize: { base: '1.875rem', md: '2.75rem', lg: '3.25rem' },
      fontWeight: '300',
      letterSpacing: '0.005em',
      lineHeight: 1.12,
      color: 'gray.800',
    },
    sectionTitle: {
      fontFamily: 'heading',
      fontSize: { base: '1.5rem', md: '2rem' },
      // Weight steps UP as size comes down. A 300-weight serif at 24px looks
      // anaemic beside 300-weight body copy; at 92px it looks composed.
      fontWeight: '400',
      letterSpacing: '0.01em',
      lineHeight: 1.2,
      color: 'gray.800',
    },
    cardTitle: {
      fontFamily: 'heading',
      fontSize: { base: '1.25rem', md: '1.375rem' },
      fontWeight: '500',
      letterSpacing: '0.01em',
      lineHeight: 1.3,
      color: 'gray.800',
    },

    // ── Body: Jost ──
    bodyLead: {
      fontFamily: 'body',
      fontSize: { base: '1rem', md: '1.125rem' },
      fontWeight: '300',
      letterSpacing: '0.01em',
      lineHeight: 1.75,
      color: 'gray.600',
    },
    bodyCopy: {
      fontFamily: 'body',
      fontSize: { base: '0.9375rem', md: '1rem' },
      fontWeight: '300',
      letterSpacing: '0.01em',
      lineHeight: 1.85,
      color: 'gray.700',
    },

    // ── Labels. Tracking is the only thing separating these three, so the
    //    values are far enough apart to read as intentional: 0.14 / 0.2 / 0.32.
    eyebrow: {
      fontFamily: 'body',
      fontSize: '0.6875rem',
      fontWeight: '500',
      letterSpacing: '0.32em',
      textTransform: 'uppercase',
      lineHeight: 1,
      color: 'brand.accentText',
      marginRight: '-0.32em',
    },
    eyebrowOnDark: {
      fontFamily: 'body',
      fontSize: '0.6875rem',
      fontWeight: '500',
      letterSpacing: '0.32em',
      textTransform: 'uppercase',
      lineHeight: 1,
      // The light gold has plenty of contrast on a photograph, and accentText
      // goes muddy there. Colour is the ONLY difference from `eyebrow`.
      color: 'brand.accent',
      marginRight: '-0.32em',
    },
    metaCaption: {
      fontFamily: 'body',
      fontSize: '0.6875rem',
      fontWeight: '400',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      lineHeight: 1.4,
      color: 'gray.500',
      marginRight: '-0.14em',
    },
    ctaLabel: {
      fontFamily: 'body',
      // Larger on mobile, smaller on desktop — deliberate, and already correct
      // in CTAButton. It buys the 44px touch target without a shouty desktop
      // label.
      fontSize: { base: '0.8125rem', md: '0.75rem' },
      fontWeight: '400',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      lineHeight: 1,
      marginRight: '-0.2em',
    },
    /**
     * A link in the full-screen mobile menu.
     *
     * The sweep initially reused ctaLabel here, which is a 13px desktop-navbar
     * treatment. In a full-screen overlay that shrinks content inside an
     * already-empty column — the opposite of the brief — and, with no padding
     * on the links, left roughly 13px tap targets against a 44px minimum.
     *
     * Sentence case, not uppercase: at this size tracked caps read as shouting.
     */
    menuLink: {
      fontFamily: 'body',
      fontSize: { base: '1.5rem', md: '1.75rem' },
      fontWeight: '300',
      letterSpacing: '0.01em',
      lineHeight: 1.2,
    },

    formLabel: {
      fontFamily: 'body',
      fontSize: '0.6875rem',
      fontWeight: '500',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      lineHeight: 1,
      color: 'brand.accentText',
      marginRight: '-0.18em',
    },
  },
});

export default theme;
