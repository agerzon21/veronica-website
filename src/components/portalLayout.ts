/**
 * The handful of numbers that decide where the client portal's sticky chrome
 * sits, in one place.
 *
 * They were typed as literals at more than twenty sites across Portal.tsx,
 * ClientPortalView.tsx and ClientGallery.tsx: `pt="72px"`, `top="72px"`,
 * `scrollMarginTop: '140px'`, `stickyNavBottom = 120`, `ACTIVATION_LINE = 150`,
 * `AT_TOP_THRESHOLD = 200`. Every one of them encodes the same fact, the height
 * of the fixed header, and they only agreed with each other by luck.
 *
 * They are not independent. The Photos handoff compares a section's position
 * against HEADER + SECTION_NAV, and the nav's active-pill scan uses the same
 * line plus tolerance. Change one literal and the portal nav flickers on and
 * off at the Photos boundary, or the wrong pill lights up. Deriving them from
 * one another makes that impossible.
 */

/** The fixed header's height. The public navbar was 72; the portal's own is shorter. */
export const PORTAL_HEADER_H = 60;

/** The sticky section nav that sits directly under the header. */
export const PORTAL_NAV_H = 48;

/**
 * Where the sticky chrome ends on a page that has BOTH rows: a DESKTOP full
 * portal while it still has progress to report. The Photos handoff is about
 * that page's band and nothing else, which is why it is still a constant.
 *
 * There is no such band on a phone any more. Both second rows are display:none
 * below `md` and the header carries the navigation itself, so the handoff this
 * number drives is desktop-only and inert on mobile.
 */
export const STICKY_BOTTOM = PORTAL_HEADER_H + PORTAL_NAV_H;

/**
 * Chakra's `md`, as a media query.
 *
 * This is the one width in the portal that changes how much chrome is pinned
 * above a section, because it is where both second nav rows appear. It is
 * written out here, next to the heights, so the CSS that hides those rows and
 * the arithmetic that compensates for them cannot be changed independently.
 */
export const PORTAL_DESKTOP_QUERY = '(min-width: 48em)';

/**
 * Is the viewport wide enough for the portal to draw a second nav row?
 *
 * Deliberately a function, called from scroll handlers and effects, NEVER
 * during render: this app prerenders, and a width read while rendering would
 * make the prerendered HTML disagree with the client's first paint. The CSS
 * side of the same split is plain responsive display, for the same reason.
 */
const isDesktopWidth = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(PORTAL_DESKTOP_QUERY).matches;

/**
 * Breathing room below the chrome, so a heading lands just under it rather
 * than flush against it.
 */
const SCROLL_GAP = 20;

/**
 * How far below the chrome a section counts as the current one.
 *
 * The slack is what stops a heading that has just tucked under the chrome
 * flickering back to the previous section on every scroll frame. It is 22px
 * past where a tapped heading lands (the gap above), which is the whole point:
 * arriving at a section is unambiguously being in it.
 */
const ACTIVATION_SLACK = SCROLL_GAP + 22;

/** Near the very top, the first nav item wins regardless of the scan. */
const AT_TOP_SLACK = SCROLL_GAP + 72;

/** Near the very bottom, the last nav item wins, since it may never reach the line. */
export const AT_BOTTOM_THRESHOLD = 80;

/** CSS helper for anything that has to clear the fixed header. */
export const HEADER_CLEARANCE = `${PORTAL_HEADER_H}px`;

/**
 * Every number a surface needs for a scroll target, derived from the one fact
 * that differs between the portal's surfaces: how many sticky rows are pinned
 * above the content.
 *
 * Two rows on a DESKTOP full portal while it still reports progress. ONE on
 * /portal/pass and on a finished portal, where the section nav has moved up
 * INTO the header and nothing is pinned under it. A single set of constants
 * could only be right for one of those, and it was right for the two-row one:
 * every heading on /portal/pass landed a whole nav row, 48px, too low, because
 * its scroll margin was reserving space for a row that is not there.
 *
 * And ONE at every mobile width, in every state, because the phone header now
 * carries all of the navigation itself and neither second row renders below
 * `md`. That is why these numbers are RESPONSIVE rather than flat: a phone
 * asking for 128px of scroll margin would drop every heading a whole nav row
 * below chrome that is not there, which does not look broken, it just looks
 * like a badly spaced page.
 *
 * So a surface says how many rows it draws on a wide screen, once, and takes
 * all of its numbers from the answer. They have to move together: the margin
 * decides where a tapped heading lands and the activation line decides whether
 * the nav agrees it has arrived, so a surface that got one of them from here
 * and the other from a literal would light up the wrong pill on arrival.
 */
export interface PortalChromeMetrics {
  /** Bottom edge of the sticky chrome. What a section clears to be in view. */
  stickyBottom: number;
  /** The line an active section is measured against. */
  activationLine: number;
  /** Above this scroll position the first nav item wins outright. */
  atTopThreshold: number;
}

export interface PortalChrome {
  /**
   * scroll-margin-top for a section heading, as a Chakra responsive length.
   * Spread into `sx` so the browser, not a breakpoint hook, picks the width.
   */
  scrollMargin: { base: string; md: string };
  /**
   * The scan numbers for the viewport as it is RIGHT NOW.
   *
   * A function rather than a field, and the distinction matters twice over.
   * It is read inside scroll and resize handlers, where the answer has to be
   * current, and it must never be read during render, where a width would
   * leak into the prerendered HTML. Both scans already re-run on resize, so
   * crossing the breakpoint is picked up without anything subscribing to it.
   */
  metrics: () => PortalChromeMetrics;
}

const metricsFor = (navRow: boolean): PortalChromeMetrics => {
  const stickyBottom = PORTAL_HEADER_H + (navRow ? PORTAL_NAV_H : 0);
  return {
    stickyBottom,
    activationLine: stickyBottom + ACTIVATION_SLACK,
    atTopThreshold: stickyBottom + AT_TOP_SLACK,
  };
};

const scrollMarginFor = (m: PortalChromeMetrics) => `${m.stickyBottom + SCROLL_GAP}px`;

// There are exactly two sets of metrics and two chromes, so they are built once
// and handed out rather than rebuilt per call. Callers put the chrome straight
// into effect dependency lists; a fresh object each time would resubscribe
// every scroll listener in the portal on every render.
const ONE_ROW = metricsFor(false);
const TWO_ROWS = metricsFor(true);

// A phone is always one row, so the base half of both of these is the same.
const ONE_ROW_CHROME: PortalChrome = {
  scrollMargin: { base: scrollMarginFor(ONE_ROW), md: scrollMarginFor(ONE_ROW) },
  metrics: () => ONE_ROW,
};
const TWO_ROW_CHROME: PortalChrome = {
  scrollMargin: { base: scrollMarginFor(ONE_ROW), md: scrollMarginFor(TWO_ROWS) },
  metrics: () => (isDesktopWidth() ? TWO_ROWS : ONE_ROW),
};

/**
 * @param navRow true when a sticky nav row is pinned under the header on this
 * surface AT DESKTOP WIDTHS, whoever draws it: the portal's own second row, or
 * the gallery's section strip. Both are PORTAL_NAV_H tall, both pin to the same
 * offset and both are hidden below `md`, so a scroll target only has to know
 * whether one of them is there on a wide screen.
 */
export const portalChrome = (navRow: boolean): PortalChrome =>
  navRow ? TWO_ROW_CHROME : ONE_ROW_CHROME;
