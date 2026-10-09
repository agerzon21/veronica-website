/**
 * The "your photos are ready" message, as plain text, in ONE place.
 *
 * It used to exist three times: the email's text body for full accounts and
 * for gallery-only bookings (api/admin/_portal-deliver.ts), and the share
 * message Vero copies from a client screen (src/components/galleryShare.ts).
 * Since 2026-10-09 she can also copy the delivery message itself, to send by
 * WhatsApp or Instagram when there is no email or the client prefers a text.
 * Four copies of one message is how wording drifts, so all of them read this.
 *
 * The only thing that differs by channel is the last line: an email says
 * "reply to this email", anything she pastes elsewhere says "reply to this
 * message".
 *
 * ENGLISH ON PURPOSE: this is what her clients read, not admin interface text.
 * No long dashes, by the house rule, and none in any template below.
 *
 * Imported by api/, so its own imports (none) would need .js extensions.
 */

export const SITE_ORIGIN = 'https://vero.photography';

export type DeliveryMode = 'full' | 'simple';

// Words a booking's display name carries that are not anybody's name.
const NOT_A_NAME = /^(wedding|weddings|proposal|engagement|elopement|anniversary|portraits?|family|maternity|newborn|couples?|session|photoshoot|shoot|minis?|aerial|christmas|\d+)$/i;

/**
 * Who the message greets. Empty greets "there".
 *
 * The stored first name wins. Display names are labels for Vero's list
 * ("Wedding Sam & Alex 2026", "Proposal Sam 2026"), and until
 * 2026-10-09 the photos-are-ready email greeted with the display name, so
 * gallery-only clients got greetings like "Hi Proposal Sam 2026," although the
 * first name had been stored at creation for exactly this greeting
 * (partner_1_first_name, 24 of 26 bookings). The label is only read when
 * that is empty: before any "&" or ",", minus the session words and the
 * year, first word left.
 */
export function deliveryFirstName(
  clientLabel: string | null | undefined,
  storedFirstName?: string | null,
): string {
  const stored = storedFirstName?.trim();
  if (stored) return stored;
  if (!clientLabel) return '';
  const words = clientLabel.split(/[&,]/)[0].trim().split(/\s+/).filter((w) => w && !NOT_A_NAME.test(w));
  return words[0] ?? '';
}

/**
 * "January 7, 2027", from a plain yyyy-mm-dd, a full timestamp, or a Date,
 * read so it cannot slip a day. An unparseable string comes back as given
 * rather than as "Invalid Date".
 *
 * A Date is what the database driver hands back for gallery_expires_at,
 * which is a DATE column: it arrives as LOCAL midnight of the stored day, so
 * its local parts are that day. Taking only strings made a resend of the
 * photos-are-ready email throw before sending (caught in review, unshipped).
 */
export function deliveryDate(value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return utcLongDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (!value) return '';
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return utcLongDate(y, m, d);
}

function utcLongDate(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The one-click gallery link. The password IS the identity for /portal/pass. */
export function galleryPassUrl(galleryPassword: string, origin: string = SITE_ORIGIN): string {
  return `${origin}/portal/pass?password=${encodeURIComponent(galleryPassword)}`;
}

export function deliveryMessageText(input: {
  mode: DeliveryMode;
  /** Already reduced to a first name (deliveryFirstName). Empty greets "there". */
  firstName: string;
  /** When the gallery goes offline. Null leaves the line out. */
  expiresIso: string | Date | null;
  galleryPassword: string;
  origin?: string;
  /** How the client would answer: the email's own thread, or whatever she pasted it into. */
  replyTo: 'email' | 'message';
}): string {
  const origin = input.origin ?? SITE_ORIGIN;
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hi there,';
  const passUrl = galleryPassUrl(input.galleryPassword, origin);
  const expiry = input.expiresIso
    ? `The gallery will stay online until ${deliveryDate(input.expiresIso)}. Please download and back up your favourites before then.`
    : null;
  const closing = `If you have any questions or want to order prints, just reply to this ${input.replyTo}.`;

  // Full accounts get their own login AND the pass link, because those are
  // two different doors: /portal is theirs alone (email and password), while
  // /portal/pass is the one they forward to family without handing over a
  // login. Gallery-only bookings have only the pass.
  const body =
    input.mode === 'full'
      ? [
          'Your photos are ready. You can view and download them at:',
          `${origin}/portal`,
          'Want to share these with family or friends? Anyone with the link below can view the gallery, no account needed.',
          passUrl,
          'You can change that gallery password any time from your portal, so the link stays yours to control.',
        ]
      : [
          'Your photos are ready ✨',
          `Open your gallery (one-click access):\n${passUrl}`,
          `If that link doesn't work, you can also go to ${origin}/portal/pass and enter the password manually:`,
          `Password: ${input.galleryPassword}`,
        ];

  return [greeting, ...body, ...(expiry ? [expiry] : []), closing, 'Warmly,\nVeronika'].join('\n\n');
}
