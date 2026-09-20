/**
 * The gallery share message and link, in one place.
 *
 * This used to live inside AdminNewGalleryOnly, on a creation success screen
 * that is unreachable once the record is saved. So the only copy of the
 * message a client actually receives existed on a screen Vero could never get
 * back to, and the client record itself had no way to hand out the link at all.
 * Full-mode clients can self-share from their own portal; gallery-only clients
 * cannot, which makes them exactly the ones who text her asking for the link
 * again.
 *
 * Kept as a module rather than duplicated so the wording cannot drift between
 * the screen that creates a gallery and the screen that re-sends it.
 *
 * ENGLISH ON PURPOSE, and deliberately not in the i18n dict: this is copy Vero
 * sends to her English-speaking clients, not admin interface text. The admin
 * panel around it is Russian.
 */

const SITE = 'https://vero.photography';

/**
 * "December 1, 2026", read as UTC so it cannot slip a day either way.
 *
 * Takes BOTH shapes on purpose. The create screen passes a plain yyyy-mm-dd,
 * while the client record passes `gallery_expires_at` straight out of Postgres
 * as a full timestamp. The original only split on hyphens, so a timestamp made
 * the day parse as NaN and the function returned its own input: the message to
 * the client would have read "stay online until 2026-12-01T12:00:00Z". Taking
 * only the date part handles both, and an unparseable value still falls back
 * to the raw string rather than printing "Invalid Date".
 */
const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

/**
 * The one-click gallery URL.
 *
 * The password IS the identity for /portal/pass, which is why changing it
 * invalidates every link already sent.
 */
export const galleryDirectUrl = (galleryPassword: string): string =>
  `${SITE}/portal/pass?password=${encodeURIComponent(galleryPassword)}`;

export const buildShareMessage = (
  firstName: string,
  expiresIso: string | null,
  galleryPassword: string,
): string => {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const expLine = expiresIso
    ? `\nThe gallery will stay online until ${fmtDate(expiresIso)}. Please download and back up your favourites before then.\n`
    : '';
  return `${greeting}

Your photos are ready ✨

Open your gallery (one-click access):
${galleryDirectUrl(galleryPassword)}

If that link doesn't work, you can also go to ${SITE}/portal/pass and enter the password manually:

Password: ${galleryPassword}
${expLine}
If you have any questions or want to order prints, just reply to this message.

Warmly,
Veronika`;
};
