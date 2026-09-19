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
 * THE POLICY, revised by Alex on 2026-09-19 after a second research pass threw
 * out the first one. These four numbers are the whole fee:
 *
 *   FREE RADIUS   60 miles one way, so 120 miles round trip.
 *   RATE          $0.70 per mile beyond that, on the ROUND TRIP distance.
 *   TRAVEL TIME   folded into the per mile rate. Never billed separately.
 *   ROUNDING      always UP, always to the nearest $5.
 *
 * Worked example, the routine two hour wedding that forced the revision: 103
 * miles each way is 206 round trip, minus the 120 included is 86 billable,
 * times $0.70 is $60.20, rounded up to $65. Pure IRS cost recovery on those
 * same 206 miles is $156.56 at 76 cents, so she is absorbing about $92 of
 * vehicle cost and all four hours of driving on top. That is the sentence that
 * ends any argument about the number.
 *
 * WHAT THE FIRST VERSION GOT WRONG, so that none of it comes back.
 * The ROUND TRIP BASIS was never the bug and it stays: 64% of event pros who
 * charge per mile bill the round trip, and the clearest published policies
 * state the allowance one way and then apply it to the round trip, which is
 * exactly what the constants below do. Two other things were wrong and they
 * compounded. A 30 mile free radius is a METRO number, borrowed from studios
 * measuring out of Denver and Portland; every rural comparable includes 60 one
 * way. And $1.00 per round trip mile was above every photographer comparable
 * found (0.50, 0.57, 0.66, 0.70), so a two hour job billed $150 when the field
 * charges $50 to $105 for it. The wider radius is doing most of the repair:
 * the same trip bills 86 miles instead of 146 before the rate is even touched.
 *
 * There is no taper and there are no tiers, because no published tapering table
 * exists in this industry. The wider radius does the work a taper would do,
 * with one number instead of a table.
 *
 * WHY THE DOLLAR CEILING IS GONE AND IS NOT COMING BACK
 * v1 stopped autofilling above $100 computed and told her to quote it by hand.
 * A dollar figure describes the RATE, not the job: at $1.00 a mile, $100
 * arrived at 80 miles one way, about 85 minutes of driving, which is a routine
 * booking. Change the rate and the very same $100 lands on a completely
 * different job without anybody deciding anything, which is the tell that the
 * unit was wrong. No published policy anywhere in this industry triggers on
 * dollars; every one triggers on distance or on hours, because the only real
 * discontinuity in the cost of a trip is a hotel bed, and a bed is a step
 * function of HOURS. So the ceiling is replaced by the two separate things that
 * were tangled up inside it:
 *
 *   LONG HAUL, at 3 hours one way, or 180 miles one way when the drive time
 *   box is empty. ADVISORY, and it still autofills. The mileage is presented as
 *   a floor with a checklist beside it: a hotel night, a second night if the
 *   day ends late, meals, a second shooter's travel. Nothing in this file
 *   refuses a booking on policy grounds any more.
 *
 *   IMPLAUSIBLE, which IS a refusal and is only ever about typing. Over 300
 *   miles or over 6 hours one way, or a pair of numbers implying an average
 *   speed outside 25 to 80 mph. It exists to catch 103 fat fingered as 1030,
 *   and it must never catch a real booking.
 *
 * WHY THERE IS A MANUAL OVERRIDE, AND WHY IT CHANGES THE CLAUSE
 * The computed figure is a starting point she is allowed to disagree with. A
 * $90 quote she would rather take $50 on is a favour she is doing somebody, and
 * a form that cannot express it is a form she works around. So the amount is
 * editable, the computed figure stays the default, and accepting it is still
 * one tap.
 *
 * What the override also changes is the WORDING of the contract, which is the
 * real content of this feature. The computed clause prints the round trip
 * distance, the included allowance and the rate, so the number can be
 * reproduced from the document. A typed number cannot be reproduced that way,
 * and printing the arithmetic beside it would be printing arithmetic that did
 * not produce it: an invitation to argue with the multiplication, or to read
 * the difference as a discount off a list price and ask why it is not larger.
 * The custom clause therefore states the agreed sum and gives the distance as
 * the REASON, with no rate and no multiplication anywhere in it. Which of the
 * two prints is decided by which variable carries the money, in
 * applyTravelDecision below.
 *
 * The override is not capped in either direction beyond being a positive whole
 * number of dollars. Above the computed figure is a real case and she may have
 * a reason the miles do not know about. The share-of-session warning reads the
 * FINAL amount, so an override is judged by the same rule the computed figure
 * is.
 *
 * WHY DRIVE TIME STILL NEVER TOUCHES THE ARITHMETIC
 * The minutes argument on both quote functions is OPTIONAL and sets longHaul
 * and implausible and nothing else. The fee is a function of the miles alone,
 * so the figure on a signed contract can be reproduced from the contract, and
 * cannot move because somebody looked the route up on a different day, in
 * traffic, or at all. Drive time is COLLECTED and DISPLAYED because it is what
 * Veronika actually needs in order to decide whether to take the booking, and
 * it now also decides which advice she is shown. It is still never money.
 */

/**
 * One way, in miles. Round trip is twice this.
 *
 * 60 rather than 30 because 30 is a metro number. It is stated one way because
 * that is what she reads off Maps, and applied to the round trip because that
 * is what the rate bills, which is the drafting pattern the published
 * comparables use: "60 miles (120 miles roundtrip)".
 */
export const TRAVEL_FREE_RADIUS_MILES = 60;

/** The distance that is included in every booking at no charge. */
export const TRAVEL_FREE_ROUND_TRIP_MILES = TRAVEL_FREE_RADIUS_MILES * 2;

/**
 * Dollars per mile beyond the included distance, applied to the round trip.
 *
 * IRS anchored and under the live 76 cent business rate, which is the point:
 * every comparable photographer charges below full cost recovery at this
 * distance, and so does she. $1.00 was above all of them.
 */
export const TRAVEL_RATE_PER_MILE = 0.7;

/**
 * The fee is always rounded UP to a multiple of this.
 *
 * $50 reads as a policy. $46.40 reads as a taxi meter and invites somebody to
 * argue about the arithmetic, which costs more in conversation than the $3.60
 * is worth.
 */
export const TRAVEL_ROUNDING_STEP = 5;

/**
 * Three hours one way, in minutes. The hotel conversation, not a refusal.
 *
 * This is where the published policies converge: one studio calls three hours
 * "the most amount of time we'd be fine to be driving in a car one way before
 * wanting to stay the night", and the two that escalate to a SECOND hotel night
 * both do it past three hours. Two hours each way sits inside every one of
 * their local tiers, which is exactly the instinct this revision is defending.
 */
export const TRAVEL_LONG_HAUL_MINUTES_ONE_WAY = 180;

/**
 * The same line in miles, used only when the drive time box is empty.
 *
 * Minutes are the better signal, because a hotel is bought with hours and not
 * with distance, so miles are the FALLBACK rather than a second trigger. 180
 * one way is roughly three hours at highway speed.
 */
export const TRAVEL_LONG_HAUL_MILES_ONE_WAY = 180;

/**
 * Past here it is a typo, not a booking, and the offer is withheld.
 *
 * This is the ONLY refusal left in the file and it is about typing, never about
 * policy. 300 miles one way is beyond anything she would drive to and back in a
 * day, so a number above it is a stray digit: 103 entered as 1030.
 */
export const TRAVEL_IMPLAUSIBLE_MILES_ONE_WAY = 300;

/** Six hours one way, the same typo guard in the drive time box. */
export const TRAVEL_IMPLAUSIBLE_MINUTES_ONE_WAY = 360;

/**
 * The slowest and fastest averages a real car journey can produce.
 *
 * The cross check that catches a fat finger in EITHER box while the other one
 * stays right. 1030 miles in 122 minutes is 506 mph; 103 miles in 1220 minutes
 * is 5 mph. Both are impossible and both mean one of the two numbers is wrong.
 * The band is deliberately wide: 25 mph allows a crawl on back roads and 80
 * allows an empty interstate, so no booking she would actually take lands
 * outside it.
 */
export const TRAVEL_IMPLAUSIBLE_MIN_MPH = 25;
export const TRAVEL_IMPLAUSIBLE_MAX_MPH = 80;

/**
 * The fee is shouted about once it passes this share of the session price.
 *
 * ONE formula for every job type, which is the whole point of doing it this
 * way. $200 is two thirds of a $300 portrait session and eight percent of a
 * $2,500 wedding, so the share already knows the difference between those two
 * jobs and a second rate card would only be a second thing to maintain and a
 * second number to defend on a contract.
 */
export const TRAVEL_SHARE_WARN_PCT = 25;

/**
 * Floating point slack for the rounding step.
 *
 * 125 miles round trip bills 5 miles, which at $0.70 is $3.50 and rounds to $5.
 * The case the epsilon exists for is a billable amount that is ALREADY a
 * multiple of 5, such as the $25.00 at 155.714 round trip miles, which must
 * stay $25 rather than becoming $30. Without the epsilon that depends on
 * whether the division lands at 5.000000000000001 or exactly 5, which depends
 * on the decimals she typed. $0.70 produces non integer raw fees far more often
 * than $1.00 did, so this matters more now than it did before. Small enough
 * that the genuinely tiny fee at 120.1 round trip miles ($0.07) still rounds up
 * to $5.
 */
const ROUNDING_EPSILON = 1e-9;

export interface TravelQuote {
  /** As typed, one way. */
  oneWayMiles: number;
  /** What the rate is actually applied to. */
  roundTripMiles: number;
  /** Round trip distance beyond the included 120. Zero when inside it. */
  billableMiles: number;
  /** Before rounding. Shown nowhere; kept so a test can prove the rounding. */
  rawFee: number;
  /** What she would actually add, rounded up to the nearest $5. */
  fee: number;
  /** Round trip distance is beyond the included radius. */
  triggered: boolean;
  /**
   * Three hours or more one way. ADVISORY ONLY, and it still autofills.
   *
   * This replaced needsManualQuote, which refused. The fee stays on offer and
   * becomes a FLOOR: the screen adds the hotel and meal checklist beside it so
   * she can raise the figure before she sends it. Reading this flag as a reason
   * to withhold a number is the bug that was just removed.
   */
  longHaul: boolean;
  /** One of the two numbers is a typo, so nothing is offered. */
  implausible: boolean;
  /** The only state in which an amount is offered for one click acceptance. */
  autofillable: boolean;
}

/** Always up, always to a multiple of TRAVEL_ROUNDING_STEP. */
export function roundUpToStep(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount / TRAVEL_ROUNDING_STEP - ROUNDING_EPSILON) * TRAVEL_ROUNDING_STEP;
}

/**
 * Three hours or more one way, from whichever number is available.
 *
 * Minutes win outright when they are there, and miles are consulted only when
 * the box is empty. That is on purpose rather than an OR: what a long haul
 * actually costs is a hotel bed, a bed is bought with hours, and 200 miles of
 * empty interstate in two and a half hours is not a hotel job however far it
 * looks on paper.
 */
function isLongHaul(oneWayMiles: number, oneWayMinutes: number | null | undefined): boolean {
  if (typeof oneWayMinutes === 'number' && Number.isFinite(oneWayMinutes) && oneWayMinutes > 0) {
    return oneWayMinutes >= TRAVEL_LONG_HAUL_MINUTES_ONE_WAY;
  }
  return oneWayMiles >= TRAVEL_LONG_HAUL_MILES_ONE_WAY;
}

/**
 * One of the two numbers cannot be right, so no amount is offered.
 *
 * The only refusal in the file, and it is about typing rather than about
 * policy. Each box is checked against an outer limit on its own, and then the
 * two are checked against each other, because the cross check is what catches a
 * stray digit in one box while the other stays correct.
 *
 * The speed check needs BOTH numbers to be real and positive. A blank drive
 * time is the normal case and must never imply a speed, and zero miles is a
 * booking with no journey rather than a car that did not move.
 */
function isImplausible(oneWayMiles: number, oneWayMinutes: number | null | undefined): boolean {
  if (oneWayMiles > TRAVEL_IMPLAUSIBLE_MILES_ONE_WAY) return true;
  const minutes = typeof oneWayMinutes === 'number' && Number.isFinite(oneWayMinutes)
    ? oneWayMinutes
    : null;
  if (minutes === null) return false;
  if (minutes > TRAVEL_IMPLAUSIBLE_MINUTES_ONE_WAY) return true;
  if (minutes <= 0 || oneWayMiles <= 0) return false;
  const mph = oneWayMiles / (minutes / 60);
  return mph < TRAVEL_IMPLAUSIBLE_MIN_MPH || mph > TRAVEL_IMPLAUSIBLE_MAX_MPH;
}

/**
 * The quote, from the ROUND TRIP distance.
 *
 * Null rather than a zero quote for anything that is not a usable number, so a
 * half typed "5." in the miles box cannot render an offer for $0.
 *
 * THE MINUTES ARGUMENT IS NOT PART OF THE ARITHMETIC. It is read after the fee
 * is already computed, and it sets longHaul and implausible and nothing else.
 * The fee above it is a function of roundTripMiles alone, which is what makes
 * the figure on a signed contract reproducible from the contract.
 */
export function quoteTravelRoundTrip(
  roundTripMiles: number,
  oneWayMinutes?: number | null,
): TravelQuote | null {
  if (!Number.isFinite(roundTripMiles) || roundTripMiles < 0) return null;
  const billableMiles = Math.max(0, roundTripMiles - TRAVEL_FREE_ROUND_TRIP_MILES);
  const rawFee = billableMiles * TRAVEL_RATE_PER_MILE;
  const fee = roundUpToStep(rawFee);
  // Strictly greater than. 120 miles round trip is the last free booking; 120.1
  // is the first billable one. A boundary that fires AT the radius would bill
  // the routine local job the 60 miles was chosen to protect.
  const triggered = roundTripMiles > TRAVEL_FREE_ROUND_TRIP_MILES;
  const oneWayMiles = roundTripMiles / 2;
  const implausible = isImplausible(oneWayMiles, oneWayMinutes);
  return {
    oneWayMiles,
    roundTripMiles,
    billableMiles,
    rawFee,
    fee,
    triggered,
    longHaul: isLongHaul(oneWayMiles, oneWayMinutes),
    implausible,
    // A long haul is NOT in this condition, which is the entire repair. The
    // only thing that withholds a number now is a number that cannot be true.
    autofillable: triggered && !implausible,
  };
}

/**
 * The quote, from the ONE WAY distance.
 *
 * One way is what she is typing in, because one way is what Google Maps prints
 * when you ask it for directions. Doubling here rather than asking her to
 * double it herself is the difference between a field she can fill from the
 * screen in front of her and a field she has to do arithmetic for.
 *
 * The optional minutes are ALSO one way, for the same reason: it is what the
 * screen in front of her says. They reach the advisory flags only.
 */
export function quoteTravel(oneWayMiles: number, oneWayMinutes?: number | null): TravelQuote | null {
  if (!Number.isFinite(oneWayMiles) || oneWayMiles < 0) return null;
  return quoteTravelRoundTrip(oneWayMiles * 2, oneWayMinutes);
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
 * This is the guardrail that makes an absurd result obvious. "$65" alone says
 * nothing; "$65, 22% of this session" is a figure she can judge in one glance,
 * and "$200, 67% of this session" stops her before she sends it.
 *
 * Null when there is no session price to compare against, because a percentage
 * of nothing is not zero, it is meaningless.
 */
export function travelShareOfSessionPct(fee: number, sessionTotal: number): number | null {
  if (!Number.isFinite(fee) || !Number.isFinite(sessionTotal) || sessionTotal <= 0) return null;
  return Math.round((fee / sessionTotal) * 100);
}

/**
 * The same percentage, promoted from a label into a warning.
 *
 * ONE rule for every job type, rather than a wedding rate card and a session
 * rate card. The share is already the thing that knows the difference: $200 is
 * two thirds of a $300 portrait session and shouts, and the identical $200 on a
 * $2,500 wedding is eight percent and says nothing. Splitting the formula by
 * job type would mean two numbers to maintain and two to defend, for a
 * distinction this one line already draws correctly.
 *
 * Deliberately computed from the ROUNDED percentage, so the warning and the
 * figure printed beside it can never disagree. Strictly greater than, so a fee
 * that lands exactly on a quarter of the session is the last quiet one.
 */
export function travelShareIsHigh(fee: number, sessionTotal: number): boolean {
  const pct = travelShareOfSessionPct(fee, sessionTotal);
  return pct !== null && pct > TRAVEL_SHARE_WARN_PCT;
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
 * "1 hr 45 min", the way Maps prints it back.
 *
 * Drive time is shown beside the miles because it is what tells her whether a
 * booking is worth taking, and it is what decides whether she is shown the long
 * haul checklist. It is still never an input to the FEE, so nothing formatted
 * here reaches the contract.
 */
export function formatDriveTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  const whole = Math.round(minutes);
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/**
 * Read a drive time the way Google Maps prints it.
 *
 * She reads the number off the Maps screen, where it says "2 hr 2 min", and
 * types it straight in. Asking her to convert that to 122 in her head is a
 * pointless bit of arithmetic and a chance to fat finger a number.
 *
 * Accepts, in either language: a bare number of minutes ("122"), Google's own
 * wording ("2 hr 2 min", "2 hours 2 minutes", "45 min", "1 hr"), the compact
 * forms ("2h 2m", "2h"), and a clock ("2:02"). Returns whole minutes, or null
 * when it cannot tell, which leaves the field empty rather than guessing.
 *
 * NOTHING HERE CHANGES THE FEE. What comes out of this feeds the long haul
 * advice and the typo guard, and the money is worked out from the miles alone,
 * so a misread here costs a wrong line of help text and never a wrong number on
 * a contract. That is the only reason this is allowed to be lenient: the same
 * leniency on the MILES field would be a bad idea.
 */
export function parseDriveTimeMinutes(raw: string): number | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;

  // "2:02" and "2:02:30". The last part is seconds and is dropped, not rounded
  // up, because a drive time is already an estimate.
  const clock = s.match(/^(\d{1,2}):([0-5]?\d)(?::[0-5]?\d)?$/);
  if (clock) {
    const mins = Number(clock[1]) * 60 + Number(clock[2]);
    return inDriveRange(mins) ? mins : null;
  }

  // A bare number is minutes, which is what the field used to demand.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const mins = Math.round(Number(s));
    return inDriveRange(mins) ? mins : null;
  }

  // Unicode aware on purpose: \b does not match Cyrillic, so an ASCII only
  // boundary would silently refuse every Russian spelling.
  const HOURS = /(\d+(?:[.,]\d+)?)\s*(?:hrs?|hours?|h|ч|часа?|часов)(?![\p{L}])/u;
  const MINUTES = /(\d+(?:[.,]\d+)?)\s*(?:mins?|minutes?|m|м|мин|минут[аы]?)(?![\p{L}])/u;

  const num = (m: RegExpMatchArray | null) => (m ? Number(m[1].replace(',', '.')) : 0);
  const h = s.match(HOURS);
  const m = s.match(MINUTES);
  if (!h && !m) return null;

  const mins = Math.round(num(h) * 60 + num(m));
  return inDriveRange(mins) ? mins : null;
}

/**
 * A sane drive time. Zero is not a journey and anything past a full day is a
 * typo, most likely a phone number or a date pasted into the wrong box.
 */
function inDriveRange(mins: number): boolean {
  return Number.isFinite(mins) && mins > 0 && mins <= 24 * 60;
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
  /**
   * True when `fee` is a figure Veronika typed rather than the one the miles
   * produced. It changes WHICH CLAUSE the contract prints and nothing else.
   *
   * Optional on purpose, so every existing caller that builds a decision out of
   * a quote keeps meaning exactly what it meant before: computed.
   */
  custom?: boolean;
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
  /** She typed this figure. The screen says so, and the contract reads differently. */
  custom: boolean;
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
   * sections are gated on these keys and prune themselves away when they are
   * absent or blank.
   *
   * THE TWO MONEY KEYS ARE MUTUALLY EXCLUSIVE, and that exclusivity is a
   * property of this function rather than of whoever calls it. Exactly one of
   * travel_fee_amount and travel_custom_amount is ever non-blank, and the other
   * is written as an empty string rather than omitted, so merging this over a
   * previously saved set positively CLEARS the clause that is no longer in
   * force. Omitting it would leave a stale key behind and print both clauses.
   */
  variables: Record<string, string>;
}

/**
 * Read a travel amount Veronika typed over the computed one.
 *
 * WHOLE DOLLARS, always. formatTravelFee prints whole dollars, so $50.40 would
 * reach the contract as "$50" while the Total Payment carried the 40 cents, and
 * the client would be signing a document whose own two numbers disagree. The
 * computed path gets whole dollars free from the $5 rounding step; the typed
 * path has to be given them here.
 *
 * A "$" and thousands separators are tolerated because she will paste or type
 * them without thinking. Null for blank, zero, negative, or anything that is
 * not a number, which leaves the computed figure standing rather than putting a
 * hole in the clause. Zero is deliberately NOT an override: charging nothing is
 * what the decline button already does, and it says so in one tap.
 */
export function parseTravelOverride(raw: string): number | null {
  const trimmed = (raw ?? '').trim().replace(/^\$/, '').replace(/,/g, '').trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  const whole = Math.round(n);
  return whole > 0 ? whole : null;
}

/**
 * The amount that actually lands on the contract.
 *
 * Her figure when she typed one, the computed figure otherwise. It is a
 * function rather than a `??` at the call site so that the share warning, the
 * total, the line item and the clause are all reading the SAME number: the
 * thing that goes wrong with an override is one surface keeping the old figure,
 * and there is now exactly one place for that to be got right.
 *
 * Deliberately NOT capped at the computed figure. An override above it is a
 * real case, and she may have a reason the arithmetic does not know about.
 */
export function finalTravelFee(computedFee: number, override: number | null): number {
  if (override === null || !Number.isFinite(override) || override <= 0) return computedFee;
  return Math.round(override);
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
  const custom = decision.custom === true;
  const amount = formatTravelFee(decision.fee);
  const miles = formatMiles(decision.roundTripMiles);
  return {
    contractTotal: base + decision.fee,
    lineItem: {
      roundTripMiles: miles,
      amount,
      fee: decision.fee,
      custom,
    },
    // Which key carries the money is what chooses the clause. The computed
    // clause shows the arithmetic, so the number on it can be reproduced from
    // the page; the custom clause states the agreed sum and the distance that
    // is the reason for it, and shows no arithmetic at all, because a contract
    // that shows arithmetic invites arguing with the arithmetic and the
    // arithmetic is not what produced this number.
    variables: {
      travel_fee_amount: custom ? '' : amount,
      travel_custom_amount: custom ? amount : '',
      travel_round_trip_miles: miles,
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
