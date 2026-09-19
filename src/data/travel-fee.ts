/**
 * Session travel: the arithmetic, the deep links, and nothing else.
 *
 * WHY THIS FILE HAS NO IMPORTS
 * api/admin/_travel-link.ts reaches this module, and api/admin.ts imports every
 * admin handler, so anything imported here is loaded by the entire admin API on
 * every cold start. Pulling in the i18n dictionary for a label would drag React
 * and Chakra into a serverless function that only builds a URL. The admin copy
 * therefore lives in src/components/travelCopy.ts, and this file stays pure
 * arithmetic and string building that both sides can share.
 *
 * WHY THE ORIGIN IS NOT IN HERE
 * Veronika's starting point is her home address. The client bundle is public
 * and statically built, so a constant in src/ publishes it to anyone who reads
 * the page source. The origin lives in the SESSION_ORIGIN_ADDRESS environment
 * variable and is read in exactly one place, api/admin/_travel-link.ts, behind
 * admin auth. Every function below either takes the destination alone or takes
 * an origin the CALLER supplies, which is what lets the server build the one
 * link that needs it without this module ever knowing the value.
 *
 * THE POLICY, settled by Alex on 2026-09-19 after the research in
 * QUEUED-session-location.md. These five numbers are the whole feature:
 *
 *   FREE RADIUS   30 miles one way, so 60 miles round trip.
 *   RATE          $1.00 per mile beyond that, on the ROUND TRIP distance.
 *   TRAVEL TIME   folded into the per mile rate. Never billed separately.
 *   ROUNDING      always UP, always to the nearest $5.
 *   CEILING       above $100 computed, stop autofilling and quote by hand.
 *
 * Worked example, his real booking: 53.2 miles each way is 106.4 round trip,
 * minus the 60 included is 46.4 billable, times $1.00 is $46.40, rounded up to
 * $50. That $50 is below pure IRS cost recovery for the same trip ($80.86 at 76
 * cents a mile), so she is still absorbing vehicle cost and all of the driving
 * time. That is the sentence that ends any argument about the number.
 *
 * WHY DISTANCE IS THE ONLY TRIGGER
 * The original request said "over 1 hour OR over 50 miles". The time half is
 * deliberately dropped. The fee is per mile, so mileage is measured anyway; the
 * OR could only fire uniquely on a short, slow trip where the formula returns
 * about $10, which creates the awkward conversation rather than preventing it;
 * and drive time is not deterministic, so a contract line item computed from it
 * would move depending on when somebody looked it up. Drive time is still
 * COLLECTED and DISPLAYED, because it is exactly what Veronika needs to decide
 * whether to take the booking at all. It just never touches the arithmetic.
 */

/** One way, in miles. Round trip is twice this. */
export const TRAVEL_FREE_RADIUS_MILES = 30;

/** The distance that is included in every booking at no charge. */
export const TRAVEL_FREE_ROUND_TRIP_MILES = TRAVEL_FREE_RADIUS_MILES * 2;

/** Dollars per mile beyond the included distance, applied to the round trip. */
export const TRAVEL_RATE_PER_MILE = 1;

/**
 * The fee is always rounded UP to a multiple of this.
 *
 * $50 reads as a policy. $46.40 reads as a taxi meter and invites somebody to
 * argue about the arithmetic, which costs more in conversation than the $3.60
 * is worth.
 */
export const TRAVEL_ROUNDING_STEP = 5;

/**
 * Above this the form stops filling anything in and tells her to quote it.
 *
 * Mirrors what the rest of the industry does past roughly 60 miles: the
 * standard mileage formula stops being the right tool and the job becomes a
 * custom quote. It is also the guardrail against a typo, because a stray digit
 * in the miles field is the one input error that would otherwise land on a
 * contract as a real number.
 */
export const TRAVEL_MANUAL_QUOTE_CEILING = 100;

/**
 * Floating point slack for the rounding step.
 *
 * 65 miles round trip bills 5 miles, which is $5.00, which is ALREADY a
 * multiple of 5 and must stay $5 rather than becoming $10. Without the epsilon
 * that depends on whether the division lands at 1.0000000000000002 or exactly
 * 1, which depends on the decimals she typed. Small enough that the genuinely
 * tiny fee at 60.1 round trip miles ($0.10) still rounds up to $5.
 */
const ROUNDING_EPSILON = 1e-9;

export interface TravelQuote {
  /** As typed, one way. */
  oneWayMiles: number;
  /** What the rate is actually applied to. */
  roundTripMiles: number;
  /** Round trip distance beyond the included 60. Zero when inside it. */
  billableMiles: number;
  /** Before rounding. Shown nowhere; kept so a test can prove the rounding. */
  rawFee: number;
  /** What she would actually add, rounded up to the nearest $5. */
  fee: number;
  /** Round trip distance is beyond the included radius. */
  triggered: boolean;
  /** Computed above the ceiling, so nothing is offered and nothing autofills. */
  needsManualQuote: boolean;
  /** The only state in which an amount is offered for one click acceptance. */
  autofillable: boolean;
}

/** Always up, always to a multiple of TRAVEL_ROUNDING_STEP. */
export function roundUpToStep(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount / TRAVEL_ROUNDING_STEP - ROUNDING_EPSILON) * TRAVEL_ROUNDING_STEP;
}

/**
 * The quote, from the ROUND TRIP distance.
 *
 * Null rather than a zero quote for anything that is not a usable number, so a
 * half typed "5." in the miles box cannot render an offer for $0.
 */
export function quoteTravelRoundTrip(roundTripMiles: number): TravelQuote | null {
  if (!Number.isFinite(roundTripMiles) || roundTripMiles < 0) return null;
  const billableMiles = Math.max(0, roundTripMiles - TRAVEL_FREE_ROUND_TRIP_MILES);
  const rawFee = billableMiles * TRAVEL_RATE_PER_MILE;
  const fee = roundUpToStep(rawFee);
  // Strictly greater than. 60 miles round trip is the last free booking; 60.1
  // is the first billable one. A boundary that fires AT the radius would bill
  // the routine local job the 30 miles was chosen to protect.
  const triggered = roundTripMiles > TRAVEL_FREE_ROUND_TRIP_MILES;
  const needsManualQuote = triggered && fee > TRAVEL_MANUAL_QUOTE_CEILING;
  return {
    oneWayMiles: roundTripMiles / 2,
    roundTripMiles,
    billableMiles,
    rawFee,
    fee,
    triggered,
    needsManualQuote,
    autofillable: triggered && !needsManualQuote,
  };
}

/**
 * The quote, from the ONE WAY distance.
 *
 * One way is what she is typing in, because one way is what Google Maps prints
 * when you ask it for directions. Doubling here rather than asking her to
 * double it herself is the difference between a field she can fill from the
 * screen in front of her and a field she has to do arithmetic for.
 */
export function quoteTravel(oneWayMiles: number): TravelQuote | null {
  if (!Number.isFinite(oneWayMiles) || oneWayMiles < 0) return null;
  return quoteTravelRoundTrip(oneWayMiles * 2);
}

/** Parses a text input, returning null for blank or nonsense rather than NaN. */
export function parseMiles(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * The fee as a percentage of the session price, rounded to a whole number.
 *
 * This is the guardrail that makes an absurd result obvious. "$50" alone says
 * nothing; "$50, 17% of this session" is a figure she can judge in one glance,
 * and "$95, 63% of this session" stops her before she sends it.
 *
 * Null when there is no session price to compare against, because a percentage
 * of nothing is not zero, it is meaningless.
 */
export function travelShareOfSessionPct(fee: number, sessionTotal: number): number | null {
  if (!Number.isFinite(fee) || !Number.isFinite(sessionTotal) || sessionTotal <= 0) return null;
  return Math.round((fee / sessionTotal) * 100);
}

/** "106.4", "120". One decimal, without a pointless trailing zero. */
export function formatMiles(miles: number): string {
  if (!Number.isFinite(miles)) return '';
  const fixed = miles.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

/** "$50". Whole dollars, because the rounding step guarantees whole dollars. */
export function formatTravelFee(fee: number): string {
  return `$${Math.round(fee)}`;
}

/**
 * "1 h 45 m". Display only, and deliberately so.
 *
 * Drive time is shown beside the miles because it is what tells her whether a
 * booking is worth taking. It is never an input to the fee, so nothing here
 * feeds quoteTravel and nothing here reaches the contract.
 */
export function formatDriveTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  const whole = Math.round(minutes);
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  if (h === 0) return `${m} m`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} m`;
}

// ── The decision, as data ────────────────────────────────────────────────
//
// PSEUDO OPTIONAL, ALWAYS. The fee is offered to Veronika and never applied on
// her behalf, the same philosophy as the overtime clause: it exists to protect
// her from a bad actor, never to force a charge onto somebody she likes. So
// there are exactly three states and declining is a real, terminal one rather
// than "not yet accepted", which is what stops the offer from nagging.

export type TravelStatus = 'none' | 'accepted' | 'declined';

export interface TravelDecision {
  status: TravelStatus;
  /** Only meaningful when accepted. */
  fee: number;
  /** Only meaningful when accepted. Round trip, which is what the rate bills. */
  roundTripMiles: number;
}

export const NO_TRAVEL_DECISION: TravelDecision = {
  status: 'none',
  fee: 0,
  roundTripMiles: 0,
};

export interface TravelLineItem {
  /** Round trip miles, formatted, so the line explains itself. */
  roundTripMiles: string;
  /** "$50". */
  amount: string;
  /** The raw number, for whoever has to add it up. */
  fee: number;
}

export interface TravelApplication {
  /** What the client is being asked to agree to. Session price plus travel. */
  contractTotal: number;
  /** Non-null ONLY when accepted. This is the visible line item. */
  lineItem: TravelLineItem | null;
  /**
   * The contract variables to merge in. Empty on every path but acceptance,
   * which is what makes declining leave the rendered contract byte for byte
   * identical to a booking that never had a travel question at all: the TRAVEL
   * section is gated on these two keys and prunes itself away when they are
   * absent or blank.
   */
  variables: Record<string, string>;
}

/**
 * Fold a decision into the session price.
 *
 * The session price and the travel fee are held SEPARATELY right up to this
 * point, rather than the acceptance mutating the total field. That is what
 * makes "declining changes nothing" true by construction instead of by careful
 * bookkeeping: there is no fee to take back out, no stale amount to reconcile
 * when she corrects the mileage, and no way for a rounding difference to
 * accumulate in the number the client signs for.
 */
export function applyTravelDecision(
  sessionTotal: number,
  decision: TravelDecision,
): TravelApplication {
  const base = Number.isFinite(sessionTotal) ? sessionTotal : 0;
  if (decision.status !== 'accepted' || decision.fee <= 0) {
    return { contractTotal: base, lineItem: null, variables: {} };
  }
  return {
    contractTotal: base + decision.fee,
    lineItem: {
      roundTripMiles: formatMiles(decision.roundTripMiles),
      amount: formatTravelFee(decision.fee),
      fee: decision.fee,
    },
    variables: {
      travel_fee_amount: formatTravelFee(decision.fee),
      travel_round_trip_miles: formatMiles(decision.roundTripMiles),
    },
  };
}

// ── Deep links ───────────────────────────────────────────────────────────
//
// All three are plain URLs. No SDK, no API key, no account, nothing to rotate
// and no quota to watch, which is the entire reason v1 is a manual miles field
// with a link rather than an automated lookup. The repo sits at exactly 12 of
// the 12 top level API handlers the Vercel free tier allows, so an automated
// distance lookup would have to become another action inside api/admin.ts with
// a key to rotate and a quota to watch, for something that happens a few times
// a month.

/** Percent encoding, not URLSearchParams: a space must be %20 and not a plus. */
const q = (value: string): string => encodeURIComponent(value.trim());

/** Waze. Takes a destination only, so this is safe to build in the browser. */
export function wazeLink(destination: string): string {
  return `https://waze.com/ul?q=${q(destination)}`;
}

/** Apple Maps. Destination only, same as Waze. */
export function appleMapsLink(destination: string): string {
  return `https://maps.apple.com/?q=${q(destination)}`;
}

/** Google Maps as a plain search. Destination only. */
export function googleMapsLink(destination: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${q(destination)}`;
}

/**
 * Google Maps DIRECTIONS, which is the one link that can carry an origin.
 *
 * Called with no origin, Maps fills in the viewer's current location. That is
 * the right behaviour for the navigate buttons on the client screen, where the
 * question is "get me there from where I am".
 *
 * Called WITH an origin, it measures from a fixed point, which is the right
 * behaviour for the look it up button on the contract form, where the question
 * is "how far is this from base" and the answer ends up on a signed contract.
 * That call happens server side in api/admin/_travel-link.ts so the origin is
 * read from the environment rather than shipped in the bundle. Nothing in src/
 * ever passes a second argument.
 */
export function googleDirectionsLink(destination: string, origin?: string): string {
  const base = `https://www.google.com/maps/dir/?api=1&destination=${q(destination)}`;
  const from = (origin ?? '').trim();
  return from ? `${base}&origin=${q(from)}` : base;
}
