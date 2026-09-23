/**
 * Where a booking happens, when it happens in more than one place.
 *
 * NO IMPORTS, deliberately. api/ reaches into this module, and an
 * extensionless relative import in anything api/ can see kills the WHOLE
 * admin API with FUNCTION_INVOCATION_FAILED while the build and the
 * typecheck both pass. scripts/check-api-imports.mjs guards the rule; keeping
 * this file import-free means it can never be the one that trips it.
 *
 * ── THE INVARIANT ────────────────────────────────────────────────────────
 *
 * client_portals.session_locations is the ordered list. session_location is
 * the FIRST entry's address, and nothing else. Eight readers take the single
 * address, including the row the paying client sees in their own portal and
 * the destination the Maps button opens, so it has to keep being a real
 * address and never a summary of several.
 *
 * primaryAddress() is the one function that decides what "the address" means,
 * so the mirror is written from one place and the two cannot drift.
 */

export interface SessionLocation {
  /** What it IS: "Proposal", "Ceremony", "Reception". May be empty. */
  label: string;
  /** A real street address. Never prose, never a list. */
  address: string;
  /** Free text, same register as event_time: "3:00 PM", "around sunset". */
  starts_at: string;
  ends_at: string;
}

export const EMPTY_LOCATION: SessionLocation = { label: '', address: '', starts_at: '', ends_at: '' };

/** At most this many. Past four the day-of list stops being scannable. */
export const MAX_LOCATIONS = 6;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Whatever came out of the database, as a list this code can rely on.
 *
 * Tolerant on purpose: the column is nullable, older rows have never been
 * written to, and a hand-edited row could hold anything. A screen that throws
 * because a JSONB column held a surprise is worse than one that shows no
 * locations.
 */
export function parseLocations(raw: unknown): SessionLocation[] {
  if (!Array.isArray(raw)) return [];
  const out: SessionLocation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const loc: SessionLocation = {
      label: str(r.label),
      address: str(r.address),
      starts_at: str(r.starts_at),
      ends_at: str(r.ends_at),
    };
    // An entry with nothing in it is not a place.
    if (!loc.label && !loc.address && !loc.starts_at && !loc.ends_at) continue;
    out.push(loc);
    if (out.length >= MAX_LOCATIONS) break;
  }
  return out;
}

/**
 * The single address, for the readers that can only hold one.
 *
 * The first entry that actually has an address. Not the first entry: a list
 * whose opening row is a time she has not pinned an address to yet must not
 * blank the Maps button for the place she DOES know.
 */
export function primaryAddress(locations: SessionLocation[]): string {
  for (const l of locations) if (l.address) return l.address;
  return '';
}

/** Is this booking in more than one place? Drives whether a schedule renders. */
export function isMultiLocation(locations: SessionLocation[]): boolean {
  return locations.filter((l) => l.address || l.label).length > 1;
}

/**
 * One line per place, for the contract and for the client's portal.
 *
 * "Proposal, Mountain View Vineyard, 3:00 PM to 3:30 PM". Every part is
 * optional, and the separators come out with them, so a place with only an
 * address reads as the address and nothing else.
 */
export function formatLocationLine(l: SessionLocation): string {
  const when = l.starts_at && l.ends_at ? `${l.starts_at} to ${l.ends_at}` : l.starts_at || l.ends_at;
  return [l.label, l.address, when].filter(Boolean).join(', ');
}

/**
 * The whole schedule as contract prose.
 *
 * Returns '' for a single-location booking, which is what keeps the contract's
 * optional SESSION SCHEDULE section from rendering on the bookings that do not
 * need it: pruneEmptyOptionalSections drops a section whose gate variable is
 * blank.
 */
export function formatSchedule(locations: SessionLocation[]): string {
  if (!isMultiLocation(locations)) return '';
  return locations
    .map((l) => formatLocationLine(l))
    .filter(Boolean)
    .join('\n');
}

/**
 * A maps URL for one place.
 *
 * `?api=1` is Google's documented Maps URL form and is the one that opens the
 * native app on a phone rather than the web page. On iOS a plain maps.google
 * link hands off to Apple Maps or Google Maps depending on what is installed,
 * which is the behaviour wanted: she picks the navigator, not the site.
 */
export function directionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}
