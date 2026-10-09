/**
 * What a client is called, in one place.
 *
 * client_display_name is Vero's label for the booking in her list ("Wedding
 * Sam & Alex 2026", "Proposal Sam 2026", "Senior Photos"), and until
 * 2026-10-09 it was also what every email and portal screen greeted the
 * client with: "Hi Wedding Sam,", "Welcome, Proposal Sam 2026". The first
 * names were stored at creation for exactly this (partner_1_first_name and
 * partner_2_first_name, filled on 24 of 26 bookings), and the New Client
 * form already promised "The first name is used in the portal greeting".
 * Now it is.
 *
 * The label is read only when no first name was stored: before any "&" or
 * ",", without the session words and the year.
 *
 * Imported by api/, so any relative import here needs a .js extension.
 */

// Words a booking label carries that are not anybody's name.
const NOT_A_NAME =
  /^(wedding|weddings|proposal|engagement|elopement|anniversary|portraits?|family|maternity|newborn|couples?|session|photoshoot|shoot|minis?|aerial|christmas|\d+)$/i;

/** The label without its session words and year, "&" kept: "Sam & Alex". */
function nameFromLabel(label: string): string {
  return label
    .split(/\s+/)
    .filter((w) => w && !NOT_A_NAME.test(w))
    .join(' ')
    .replace(/^[\s&,]+|[\s&,]+$/g, '')
    .trim();
}

/**
 * One person, for "Hi Sam," at the top of an email. Empty when there is no
 * name, which the caller turns into "Hi there,".
 */
export function greetingName(clientLabel: string | null | undefined, storedFirstName?: string | null): string {
  const stored = storedFirstName?.trim();
  if (stored) return stored;
  if (!clientLabel) return '';
  return nameFromLabel(clientLabel.split(/[&,]/)[0]).split(/\s+/)[0] ?? '';
}

/**
 * Everyone on the booking, for "Welcome, Sam & Alex" on their portal and
 * "Sam & Alex has shared their photo gallery". Both stored first names when
 * there are two. A gallery-only booking stores only the first, so its label
 * is used when it names that person and someone else ("Wedding Sam & Alex
 * 2026"), and the one first name otherwise: "Senior Photos" names nobody.
 */
export function welcomeNames(
  clientLabel: string | null | undefined,
  firstName1?: string | null,
  firstName2?: string | null,
): string {
  const a = firstName1?.trim();
  const b = firstName2?.trim();
  if (a && b) return `${a} & ${b}`;
  const fromLabel = clientLabel ? nameFromLabel(clientLabel) : '';
  const couple = /[&,]/.test(fromLabel);
  if (a) return couple && fromLabel.toLowerCase().startsWith(a.toLowerCase()) ? fromLabel : a;
  return couple ? fromLabel : greetingName(clientLabel);
}
