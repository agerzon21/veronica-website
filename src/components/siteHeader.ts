/**
 * The geometry the PUBLIC navbar and the CLIENT PORTAL header share.
 *
 * There are two fixed headers on this site and a client crosses between them:
 * the public navbar on every marketing page, and the portal's own header on
 * /portal and /portal/pass. They used to be different heights, 72 against 60,
 * which read as the page jolting upward on the way in and back down on the way
 * out. The numbers that decide that height live here, once, so the two cannot
 * drift apart again.
 *
 * WHAT DECIDES THE HEIGHT. The public navbar is padding plus its tallest child,
 * and its tallest child is the wordmark. So the height is the vertical padding
 * twice over plus the logo's ceiling, and SITE_HEADER_H says exactly that
 * rather than repeating a number somebody measured once.
 *
 * MEASURED, not assumed: 72px at 390 and at 1280, which is where both clamps
 * below are already at their 2.5rem ceiling.
 *
 * There are two widths where the public navbar is a little SHORTER, and both
 * are a clamp sitting on its floor. At 320 the wordmark eases down to 2.125rem
 * and the 36px burger becomes the tallest thing in the row, giving 68. At
 * exactly 992, where the desktop layout switches on at its tightest, the
 * desktop clamp starts at 2.125rem and the 38px link row leads, giving 70.
 *
 * The portal header does NOT follow it down either time, because its height is
 * a fixed box rather than padding around a logo: every scroll margin and
 * activation line in portalLayout.ts is derived from ONE number, and a header
 * whose height changed with the viewport would make every one of them a
 * function of width. The gap is 4px on a 320px screen and 2px at exactly 992,
 * it is in the portal's favour both times (a heading lands slightly low rather
 * than slightly under the chrome), and it closes again by 375 and by 1000.
 */

/**
 * The wordmark's height on a DESKTOP navbar.
 *
 * The full nav is 541px of links plus a 137px Contact button, which with the
 * wordmark and the 32px gutters needs about 1011px to sit still. So the desktop
 * layout only switches on at `lg` (992px) and has to run at its tightest there:
 * 34px of logo and 16px gaps at 992, easing to 40px and 24px by 1200 where the
 * container caps and extra width stops mattering. Measured with the real Jost
 * metrics, not estimated.
 */
export const SITE_LOGO_H = 'clamp(2.125rem, 5.385px + 2.885vw, 2.5rem)';

/**
 * And on a phone, where the squeeze is much tighter: 16px gutters plus the 48px
 * burger leave `vw - 80` for the wordmark. A 40px logo is 263px wide, which fits
 * every common phone (375px and up) with room to spare but runs 23px past a
 * 320px screen and pushes the burger clean off the edge. So it eases from 34px
 * at 320px to its full 40px by 375px and stays there.
 */
export const SITE_LOGO_H_MOBILE = 'clamp(2.125rem, -0.909px + 10.909vw, 2.5rem)';

/** The ceiling both clamps reach, in px. 2.5rem. */
const SITE_LOGO_H_MAX = 40;

/** The public navbar's `py={4}`, in px, top and bottom each. */
const SITE_HEADER_PAD_Y = 16;

/**
 * How tall a fixed header on this site is, at every width a phone or a desktop
 * actually has. Derived, so changing the logo's ceiling or the navbar's padding
 * moves the portal's header and everything the portal derives from it.
 */
export const SITE_HEADER_H = SITE_HEADER_PAD_Y * 2 + SITE_LOGO_H_MAX;
