/**
 * Which dates a customer named, and how far away each one is, worked out in
 * CODE rather than by the model.
 *
 * WHY THIS EXISTS
 * The reply prompt was told today's date and asked to notice when a customer's
 * date had already passed. On 2026-10-07 a customer asked about a proposal on
 * "October 24th of this year", and the Instagram bot answered, unreviewed,
 * "October 24th is already past. Did you mean a different date?". It was 17
 * days away. The customer had to point out the date to it, and Vero had to
 * apologise for her own assistant. gpt-4o-mini cannot be trusted to compare two
 * dates, and a rule asking it to cannot make it.
 *
 * So the comparison happens here, the verdict goes into the prompt as a fact,
 * and api/_ai-reply.ts refuses a reply that says a date has passed when none
 * of the dates found here has.
 *
 * Deliberately narrow: month names (English and Russian), ISO dates and US
 * slashed dates. "Next Saturday" and other relative phrases are left to the
 * model; they do not produce the "already past" failure, because they cannot
 * be in the past.
 *
 * Underscore-prefixed so Vercel does not expose it as a route.
 */

export interface MentionedDate {
  /** What the customer typed, for quoting back. */
  text: string;
  /** YYYY-MM-DD. */
  ymd: string;
  /** Whole days from today in Eastern time. Negative: in the past. */
  daysFromToday: number;
  /** False when the year was inferred because the customer did not give one. */
  yearGiven: boolean;
}

const MONTHS_EN: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MONTHS_RU: Array<[RegExp, number]> = [
  [/^январ/, 1], [/^феврал/, 2], [/^март/, 3], [/^апрел/, 4], [/^ма[яй]/, 5], [/^июн/, 6],
  [/^июл/, 7], [/^август/, 8], [/^сентябр/, 9], [/^октябр/, 10], [/^ноябр/, 11], [/^декабр/, 12],
];

const MONTH_EN =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';
const YEAR = '(?:,?\\s*(\\d{4}))?';

/** Today in America/New_York, which is where the business and its calendar are. */
export function easternToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const ymdOf = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Every date the text names, each with its distance from today.
 *
 * Without a year: this year's, unless that has already gone, in which case
 * next year's. Someone typing "March 3rd" in October means the coming March,
 * not one seven months ago. "This year" and "next year" in the text are
 * honoured, so "October 24th of this year" stays this year.
 */
export function mentionedDates(text: string, today: string): MentionedDate[] {
  const out: MentionedDate[] = [];
  const seen = new Set<string>();
  const thisYear = +today.slice(0, 4);
  const saysThisYear = /\bthis year\b|\bэтого года\b|\bв этом году\b/i.test(text);
  const saysNextYear = /\bnext year\b|\bследующего года\b|\bв следующем году\b/i.test(text);

  const add = (raw: string, y: number | null, m: number, d: number) => {
    let year = y ?? (saysNextYear ? thisYear + 1 : thisYear);
    if (!isRealDate(year, m, d)) return;
    if (y === null && !saysThisYear && !saysNextYear && ymdOf(year, m, d) < today) year += 1;
    const ymd = ymdOf(year, m, d);
    if (seen.has(ymd)) return;
    seen.add(ymd);
    out.push({ text: raw.trim(), ymd, daysFromToday: daysBetween(today, ymd), yearGiven: y !== null });
  };

  // "October 24th", "Oct 24, 2027"
  for (const mt of text.matchAll(new RegExp(`\\b${MONTH_EN}\\.?\\s+${DAY}\\b${YEAR}`, 'gi'))) {
    add(mt[0], mt[3] ? +mt[3] : null, MONTHS_EN[mt[1].toLowerCase().slice(0, 3)], +mt[2]);
  }
  // "24th of October", "24 October 2027"
  for (const mt of text.matchAll(new RegExp(`\\b${DAY}\\s+(?:of\\s+)?${MONTH_EN}\\b${YEAR}`, 'gi'))) {
    add(mt[0], mt[3] ? +mt[3] : null, MONTHS_EN[mt[2].toLowerCase().slice(0, 3)], +mt[1]);
  }
  // "24 октября", "24 октября 2027"
  for (const mt of text.matchAll(/(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?/gi)) {
    const month = MONTHS_RU.find(([re]) => re.test(mt[2].toLowerCase()))?.[1];
    if (month) add(mt[0], mt[3] ? +mt[3] : null, month, +mt[1]);
  }
  // ISO, "2027-08-14"
  for (const mt of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(mt[0], +mt[1], +mt[2], +mt[3]);
  // US slashed, "10/24" or "10/24/2026". Slashes only: "1.5 hours" and
  // "8-12 people" are not dates.
  for (const mt of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g)) {
    const y = mt[3] ? (mt[3].length === 2 ? 2000 + +mt[3] : +mt[3]) : null;
    add(mt[0], y, +mt[1], +mt[2]);
  }
  return out;
}

const WEEKDAY = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** The prompt block: each date as a settled fact the model does not recompute. */
export function datesBlock(dates: MentionedDate[]): string | null {
  if (dates.length === 0) return null;
  const lines = dates.map((d) => {
    const when =
      d.daysFromToday < 0
        ? `${-d.daysFromToday} days AGO. This date is in the past.`
        : d.daysFromToday === 0
          ? 'TODAY.'
          : d.daysFromToday === 1
            ? 'TOMORROW.'
            : `${d.daysFromToday} days from today, in the FUTURE.`;
    return `- "${d.text}" = ${WEEKDAY(d.ymd)}: ${when}`;
  });
  return [
    '## DATES THE CUSTOMER NAMED (worked out by the system, not by you)',
    'Trust these over your own arithmetic. Never tell a customer a date has passed, is wrong, or is too soon unless a line below says it is in the past or today, and never comment on how much notice they are giving.',
    ...lines,
  ].join('\n');
}

/**
 * A reply that says a date has passed when none of the customer's dates has.
 * The exact failure that reached a customer, caught on the way out.
 */
const PAST_CLAIM =
  /\b(?:already\s+(?:past|passed|gone|over|happened)|has\s+(?:already\s+)?passed|is\s+(?:already\s+)?(?:in\s+the\s+)?past|in\s+the\s+past)\b|уже\s+прош|прошедш/i;

/** A sentence is about a date when it names one, or says "date" or "day". */
const ABOUT_A_DATE = new RegExp(
  `\\b(?:date|day|${MONTH_EN.slice(1, -1)})\\b|\\b\\d{1,2}(?:st|nd|rd|th)\\b|\\d{1,2}\\/\\d{1,2}|дат|числ`,
  'i',
);

export function falsePastClaim(reply: string, dates: MentionedDate[]): string | null {
  if (dates.some((d) => d.daysFromToday < 0)) return null;
  // Sentence by sentence: "couples I have photographed in the past" is not a
  // claim about their date, and must not stop an ordinary reply.
  for (const sentence of reply.split(/(?<=[.!?])\s+|\n+/)) {
    const m = sentence.match(PAST_CLAIM);
    if (m && ABOUT_A_DATE.test(sentence)) return sentence.trim();
  }
  return null;
}
