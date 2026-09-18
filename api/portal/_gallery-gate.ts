import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The one predicate that decides whether a portal's photo DATA may leave the
 * server.
 *
 * Why it exists: pasting a Drive URL used to publish the photos instantly.
 * /api/portal/client and /api/portal/gallery both served the folder listing
 * the moment drive_url was non-null, so the contract clause "full payment
 * must be received before delivery of any images" was enforced by nothing at
 * all. "Mark as Delivered" only sent the photos-ready email and started the
 * retention clock, so it gated nothing. Now it is the release switch, and
 * this is what reads it.
 *
 * Scope: full portals only, deliberately.
 *   - A simple (gallery-only) portal has no contract and no separate delivery
 *     step. api/admin/_portals-create.ts stamps gallery_delivered_at at
 *     creation time when a drive_url comes in with it, but leaves it null when
 *     Vero creates the row before the photos exist and pastes the URL later
 *     via portal-update, which never touches that column. Gating simple
 *     portals on it would therefore black out galleries that are meant to be
 *     open. They keep their old behaviour.
 *   - api/admin/_portal-deliver.ts does set gallery_delivered_at on simple
 *     portals as well (it has no mode filter), so the column is not a
 *     full-portal-only signal. That is exactly why the mode check lives here
 *     rather than being inferred from the column being populated.
 *
 * Both readers must use this, and for the same reason: every full portal also
 * has a gallery_password, which its client is encouraged to hand to guests, so
 * /api/portal/gallery serves full portals too. Gating only the logged-in
 * portal would leave the password path wide open and the fix worthless.
 */

export type GalleryGateRow = {
  mode: 'simple' | 'full';
  gallery_delivered_at: string | null;
};

/**
 * True when the photo data (drive_url, rootFiles, sections) may be returned.
 *
 * Withholding means withholding the data itself. Callers must not return the
 * Drive URL or the file listing and then hide them client side.
 */
export function isGalleryReleased(row: GalleryGateRow): boolean {
  if (row.mode !== 'full') return true;
  return row.gallery_delivered_at !== null;
}

/**
 * Client-facing copy for the closed gate.
 *
 * Says nothing about money on purpose: guests the client forwarded the gallery
 * link to land on this same message, and the balance is between Veronika and
 * her client, not something to announce to a wedding guest.
 */
export const GALLERY_WITHHELD_MESSAGE =
  'These photos have not been released yet. Veronika will open the gallery as soon as everything is ready.';

/**
 * A short-lived signed token that lets ADMIN preview an undelivered gallery.
 *
 * Gating on delivery took away something Vero actually used: the "Preview
 * Client Gallery" button opens the real client surface, and before delivery
 * that surface is now the withheld notice. She needs to check the gallery
 * looks right BEFORE releasing it, which is the whole point of previewing.
 *
 * The token is derived, not stored: an HMAC over the portal id and a coarse
 * time window, so there is no table to clean up and nothing to leak. Both the
 * current and previous window are accepted, so a link is good for between 30
 * and 60 minutes and a preview opened just before a boundary does not die
 * mid-scroll.
 *
 * Keyed off CONTRACT_AUDIT_SECRET with its own prefix so a token minted here
 * can never be confused with a contract audit HMAC. If that secret is missing
 * the functions refuse rather than degrade: no secret means no bypass, which
 * fails closed.
 */
const PREVIEW_WINDOW_MS = 30 * 60 * 1000;

function previewDigest(portalId: string, window: number): string | null {
  const secret = process.env.CONTRACT_AUDIT_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret)
    .update(`gallery-preview:${portalId}:${window}`)
    .digest('hex');
}

/** Mint a token for the admin panel to append to its preview link. */
export function makeGalleryPreviewToken(portalId: string): string | null {
  return previewDigest(portalId, Math.floor(Date.now() / PREVIEW_WINDOW_MS));
}

/** True when `token` is a live preview token for this portal. */
export function verifyGalleryPreviewToken(portalId: string, token: string): boolean {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const now = Math.floor(Date.now() / PREVIEW_WINDOW_MS);
  for (const window of [now, now - 1]) {
    const expected = previewDigest(portalId, window);
    if (!expected) return false;
    // Constant time, so a wrong token cannot be narrowed by timing.
    if (timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))) {
      return true;
    }
  }
  return false;
}
