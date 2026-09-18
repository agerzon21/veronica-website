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

/** Where the sticky chrome ends. What a section has to clear to be "in view". */
export const STICKY_BOTTOM = PORTAL_HEADER_H + PORTAL_NAV_H;

/**
 * Scroll target offset for a section heading.
 *
 * The extra 20px is breathing room, so a heading lands just below the chrome
 * rather than flush against it.
 */
export const SECTION_SCROLL_MARGIN = `${STICKY_BOTTOM + 20}px`;

/**
 * The line an active section is measured against.
 *
 * Slightly below the chrome, so a heading that has just tucked under it still
 * counts as the current section rather than flickering back to the previous
 * one on every scroll frame.
 */
export const ACTIVATION_LINE = STICKY_BOTTOM + 42;

/** Near the very top, the first nav item wins regardless of the scan. */
export const AT_TOP_THRESHOLD = STICKY_BOTTOM + 92;

/** Near the very bottom, the last nav item wins, since it may never reach the line. */
export const AT_BOTTOM_THRESHOLD = 80;

/** CSS helper for anything that has to clear the fixed header. */
export const HEADER_CLEARANCE = `${PORTAL_HEADER_H}px`;
