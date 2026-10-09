/**
 * The gallery share message and link, for the screens that hand a gallery out.
 *
 * This used to live inside AdminNewGalleryOnly, on a creation success screen
 * that is unreachable once the record is saved. So the only copy of the
 * message a client actually receives existed on a screen Vero could never get
 * back to, and the client record itself had no way to hand out the link at all.
 * Full-mode clients can self-share from their own portal; gallery-only clients
 * cannot, which makes them exactly the ones who text her asking for the link
 * again.
 *
 * The words themselves now live in src/data/delivery-message.ts, shared with
 * the photos-are-ready email and the client screen's Copy message, so the
 * text a client is emailed and the text Vero pastes cannot drift apart. This
 * file keeps the two names its callers already use.
 *
 * ENGLISH ON PURPOSE, and deliberately not in the i18n dict: this is copy Vero
 * sends to her English-speaking clients, not admin interface text.
 */

import { deliveryMessageText, galleryPassUrl } from '../data/delivery-message';

/**
 * The one-click gallery URL.
 *
 * The password IS the identity for /portal/pass, which is why changing it
 * invalidates every link already sent.
 */
export const galleryDirectUrl = (galleryPassword: string): string => galleryPassUrl(galleryPassword);

/** The gallery-only message, ending "reply to this message" because she pastes it. */
export const buildShareMessage = (
  firstName: string,
  expiresIso: string | null,
  galleryPassword: string,
): string =>
  deliveryMessageText({ mode: 'simple', firstName, expiresIso, galleryPassword, replyTo: 'message' });
