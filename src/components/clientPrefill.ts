/**
 * What a conversation knows about a booking, on its way into the new-client form.
 *
 * The summariser already extracts these as typed data (see BookingFields in
 * api/admin/_messages-summary.ts) precisely so this hand-off does not have to
 * re-parse prose. This module is the shared shape plus the small amount of
 * translation the form needs: the summary speaks in the customer's words
 * ("3:00 PM to 6:00 PM"), the form wants <input type="time"> values.
 *
 * Kept free of React and of anything browser-only on purpose. The summariser
 * imports the session-type helpers at the bottom of this file, the same way
 * other handlers already import src/data/contract-template, so the server and
 * the form cannot hold different opinions about which shoots name two people.
 */

// The .js extension is REQUIRED, not stylistic. This module is imported by
// api/admin/_messages-summary.ts, and the api functions run as real Node ESM
// (package.json is type: module), where an extensionless relative specifier
// throws ERR_MODULE_NOT_FOUND at load. api/admin.ts imports every admin
// handler, so that one throw took the entire admin API down with
// FUNCTION_INVOCATION_FAILED. Vite resolves the .js back to this .ts happily.
import { CONTRACT_TEMPLATES, CONTRACT_TYPE_ORDER } from '../data/contract-template.js';

/**
 * The contract details a thread established, as data rather than prose.
 *
 * Mirrors BookingFields in api/admin/_messages-summary.ts, which is where
 * these are produced. The browser cannot import that module (it pulls in the
 * OpenAI client and the database connection), so the shape is written out
 * once here and both ends of the hand-off read this one.
 */
export interface PrefillBooking {
  session_type: string | null;
  event_date: string | null;
  event_time: string | null;
  event_location: string | null;
  client_full_name: string | null;
  /** Wedding and engagement only. Null on every other type, by design. */
  partner_full_name: string | null;
  client_email: string | null;
  total_amount: string | null;
  retainer_amount: string | null;
  /** Maternity only: the client's estimated due date, YYYY-MM-DD. */
  due_date: string | null;
  /** Engagement only, and optional even there: the wedding this leads up to. */
  wedding_date: string | null;
  /** 'other' only: what is actually being photographed. */
  session_scope: string | null;
  /** Verbatim sentences behind the two values that cost money to get wrong. */
  total_amount_quote: string | null;
  event_date_quote: string | null;
  /**
   * Everything either side said about how long the session runs. Empty when
   * the thread never says, which is a real answer and not a failure: see
   * DurationStatement for why this is a list and not one agreed number.
   */
  session_durations: DurationStatement[];
}

/**
 * Something one side of the thread said about how long the session runs.
 *
 * A list rather than a single agreed number, because real threads do not
 * produce one. In the thread this was built for, Vero wrote that 1.5 hours
 * would be the maximum duration for the session and the customer answered
 * that he was sure an hour would be more than enough. Both sentences are
 * true statements about the same booking, and neither is a correction of the
 * other, so an extractor asked for "the duration" has to pick a winner while
 * it is still reading prose, with no way to explain itself afterwards.
 *
 * So the summariser reports what it found with the speaker attached, and
 * pickCoverageDuration below decides. The rule it applies is the owner's:
 * the contract carries what the PHOTOGRAPHER committed to, not the shorter
 * guess the customer floated, because the end time on the contract is the
 * line the overtime clause bills from. That clause exists to protect her
 * from a client who will not leave, is never automatic, and staying longer
 * is always her own decision. None of that survives being compressed into a
 * prompt instruction the model may or may not have followed on any given
 * run, so it lives here, in code, next to the tests that pin it.
 */
export interface DurationStatement {
  /** 'photographer' covers both Vero and the AI assistant replying as her. */
  speaker: 'photographer' | 'client';
  /** The length in the words it was said in, e.g. "1.5 hours", "полтора часа". */
  text: string;
  /** The sentence it was said in, word for word, so the form can show its source. */
  quote: string;
}

export interface ClientPrefill extends PrefillBooking {
  conversationId: string;
  /** Platform display name, used only as a last-resort label. */
  displayName: string;
  /**
   * The wedding package this lead arrived with, as the contact form resolved
   * it: "Full Wedding Day; Up to 8 hours; from $1,200". Null on every thread
   * that did not come from the website with a package chosen.
   *
   * ON ClientPrefill AND NOT ON PrefillBooking, deliberately. PrefillBooking
   * mirrors BookingFields in api/admin/_messages-summary.ts, so a field there
   * means a prompt change and a SUMMARY_VERSION bump, which re-runs the model
   * over every thread on next view and hands a package name to something that
   * can paraphrase it. This value is read straight out of the submission's own
   * message body instead, so it is the string the server resolved, byte for
   * byte, on every run.
   */
  wedding_package: string | null;
}

/** One clock reading found in a sentence, before anything is decided about it. */
interface ClockReading {
  h: number;
  m: number;
  /** 'a', 'p', or null when nothing marked it. */
  mer: string | null;
  /** True for "11:30" and false for a bare "11". Decides how far we trust it. */
  hadColon: boolean;
}

/**
 * Every clock reading in a string, in the order they appear.
 *
 * Shared by the window parser and the start-time parser so one string cannot
 * be read two different ways by two functions on the same screen.
 */
function readClockTimes(raw: string): ClockReading[] {
  const text = raw.toLowerCase();
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/g;
  const hits: ClockReading[] = [];
  for (const m of text.matchAll(re)) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (!Number.isFinite(h) || h > 23 || min > 59) continue;
    hits.push({ h, m: min, mer: m[3] ? m[3][0] : null, hadColon: Boolean(m[2]) });
  }
  return hits;
}

const to24 = (h: number, mer: string | null): number | null => {
  if (!mer) return h <= 23 ? h : null;
  if (h < 1 || h > 12) return null;
  if (mer === 'p') return h === 12 ? 12 : h + 12;
  return h === 12 ? 0 : h;
};

const fmtHhmm = (h: number, m: number) =>
  `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

/**
 * Pull start and end out of however the coverage window was worded.
 *
 * Deliberately conservative: anything it cannot read confidently returns
 * nulls, and the form keeps its own defaults. A wrong time silently seeded
 * into a contract is far worse than an empty one, because nobody re-reads a
 * field that already looks filled in.
 *
 * Handles "3:00 PM to 6:00 PM", "3pm-6pm", "15:00 to 18:00", "3 to 6 pm",
 * and the Russian "с 15:00 до 18:00".
 */
export function parseCoverageWindow(
  raw: string | null,
): { start: string | null; end: string | null } {
  if (!raw) return { start: null, end: null };
  const hits = readClockTimes(raw);
  if (hits.length < 2) return { start: null, end: null };

  const [a, b] = hits;
  // "3 to 6 pm" — the marker on the second reading governs both.
  const merA = a.mer ?? b.mer;
  const merB = b.mer ?? a.mer;

  const hA = to24(a.h, merA);
  const hB = to24(b.h, merB);
  if (hA === null || hB === null) return { start: null, end: null };

  const start = fmtHhmm(hA, a.m);
  const end = fmtHhmm(hB, b.m);
  // An end before the start means we misread it. Don't guess.
  if (end <= start) return { start: null, end: null };
  return { start, end };
}

/**
 * The start time out of a string that names one time rather than a window.
 *
 * Threads say "11:30 AM" far more often than they say "11:30 AM to 1:00 PM",
 * and until this existed that value was extracted, shown to Vero on the
 * prefill card, and then thrown away: the form fell back to its own 5 PM
 * default while the card above it said 11:30 AM.
 *
 * One reading is trusted less than two, because a window brings its own
 * corroboration and a lone number does not. A bare hour with neither a
 * meridiem nor a colon ("at 3") is refused outright: that is the coin flip
 * that puts a morning session on a contract at three in the afternoon, and
 * the whole point of this module is that an empty field beats a wrong one.
 * "3pm", "15:00" and "11:30" all carry enough to read.
 */
export function parseStartTime(raw: string | null): string | null {
  if (!raw) return null;
  const hits = readClockTimes(raw);
  const first = hits[0];
  if (!first) return null;
  if (!first.mer && !first.hadColon) return null;
  const h = to24(first.h, first.mer);
  if (h === null) return null;
  return fmtHhmm(h, first.m);
}

/** Counts, spelled out, in both languages the inbox speaks. ё is folded to е. */
const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  // "полтора часа" is the single most common way a Russian speaker says 1.5
  // hours, and it never contains a digit, so it has to be a word here or the
  // scan below finds no count at all.
  полтора: 1.5,
  полутора: 1.5,
  один: 1,
  одного: 1,
  одна: 1,
  два: 2,
  две: 2,
  двух: 2,
  три: 3,
  трех: 3,
  четыре: 4,
  четырех: 4,
  пять: 5,
  пяти: 5,
  шесть: 6,
  шести: 6,
  семь: 7,
  семи: 7,
  восемь: 8,
  восьми: 8,
  девять: 9,
  девяти: 9,
  десять: 10,
  десяти: 10,
  одиннадцать: 11,
  двенадцать: 12,
};

const countOf = (token: string | undefined): number | null => {
  if (!token) return null;
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token);
  const word = NUMBER_WORDS[token];
  return word === undefined ? null : word;
};

/**
 * READ THIS BEFORE TOUCHING ANY PATTERN BELOW. \b is defined over
 * [A-Za-z0-9_]. Against Cyrillic it does not error and does not warn, it
 * simply never sits where you think it does, so an ASCII-only pattern
 * becomes a rule that is quietly off for exactly one language. The first
 * draft of this parser used \b and read every English phrasing perfectly
 * while returning null for "полтора часа", "два часа" and "90 минут", which
 * is Vero's own language and the half of the inbox this was written for.
 * api/_house-style.ts carries the same warning for the same reason.
 */
const WORD_CHAR = '\\p{L}\\p{N}';
const NOT_BEFORE = `(?<![${WORD_CHAR}])`;
const NOT_AFTER = `(?![${WORD_CHAR}])`;
/** "1", "1.5", or a word like "two" or "полтора". */
const COUNT = `(?:\\d+(?:\\.\\d+)?|\\p{L}+)`;
const HOUR_UNIT = `(?:hours?|hrs?|час(?:а|ов|у)?)`;
const MINUTE_UNIT = `(?:minutes?|mins?|минут(?:а|ы|у)?|мин)`;
const AND_A_HALF = `(?:and\\s+a\\s+half|с\\s+половиной)`;

/**
 * Rewrite the handful of phrasings that name a length without naming a
 * number the scan below could read, so there is one scan and not six.
 *
 * Every rule here is a shape seen in this inbox or the obvious neighbour of
 * one. They run in a fixed order because "half an hour" has to be spent
 * before the "and a half" rules go looking for a half to fold into a count.
 */
const normalizeDurationText = (raw: string): string => {
  let s = raw.toLowerCase().replace(/ё/g, 'е');
  // A Russian keyboard writes 1.5 as "1,5".
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  const swap = (pattern: string, replacement: string) => {
    s = s.replace(new RegExp(pattern, 'gu'), replacement);
  };
  swap(`${NOT_BEFORE}half\\s+an?\\s+hour${NOT_AFTER}`, '30 minutes');
  swap(`${NOT_BEFORE}a\\s+half\\s+hour${NOT_AFTER}`, '30 minutes');
  swap(`${NOT_BEFORE}полчаса${NOT_AFTER}`, '30 minutes');
  swap(`${NOT_BEFORE}(?:a\\s+)?couple\\s+(?:of\\s+)?hours${NOT_AFTER}`, '2 hours');
  swap(`${NOT_BEFORE}пар[ауы]\\s+часов${NOT_AFTER}`, '2 hours');
  // "an hour and a half": the count sits in FRONT of the unit, so the half
  // has to be folded back into it before the scan can see one number. With
  // no count at all ("hour and a half") the hour itself is the one.
  s = s.replace(
    new RegExp(
      `${NOT_BEFORE}(${COUNT})?\\s*${NOT_BEFORE}${HOUR_UNIT}\\s+${AND_A_HALF}${NOT_AFTER}`,
      'gu',
    ),
    (_whole, count?: string) => {
      const n = count === undefined ? 1 : countOf(count);
      // A word we do not recognise in front of the unit is not a count, so
      // "the hour and a half" is still 1.5 hours and the stray word is put
      // back rather than swallowed.
      if (n === null) return `${count} 1.5 hours`;
      return `${n + 0.5} hours`;
    },
  );
  // "two and a half hours": the count is in front of the half, the unit behind.
  s = s.replace(
    new RegExp(`${NOT_BEFORE}(${COUNT})\\s+${AND_A_HALF}${NOT_AFTER}`, 'gu'),
    (whole, count: string) => {
      const n = countOf(count);
      return n === null ? whole : String(n + 0.5);
    },
  );
  return s;
};

/**
 * How many minutes a duration phrase describes, or null if it says nothing
 * we can read. No opinion about whether the number is sane: that is
 * pickCoverageDuration's job, and keeping them apart is what lets a test
 * assert "we read 14 hours correctly AND refused to use it".
 *
 * Reads "1.5 hours", "1.5 hrs", "an hour and a half", "90 minutes",
 * "2 hours", "up to two hours", "1 hour 30 minutes", "полтора часа",
 * "1,5 часа", "90 минут", "до двух часов" and "полчаса".
 *
 * BE HONEST ABOUT WHAT THIS IS. It is a regex over a phrase a language model
 * copied out of a sentence, and it will meet phrasings nobody listed. Two
 * decisions keep that from becoming a wrong contract. Anything it cannot
 * read returns null, which leaves the end time EMPTY rather than guessed.
 * And a range ("2-3 hours", "от 2 до 3 часов") resolves to its TOP end,
 * because the number that matters is the outer edge of what was promised,
 * the same reading the owner gave when he chose the 1.5 hour maximum over
 * the hour the client guessed at.
 */
export function parseDurationMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = normalizeDurationText(raw);
  // A count, then a unit. The count is optional so that a bare "an hour" or
  // "час" still reads as one, and a number with no unit behind it is simply
  // skipped, which is what makes "2-3 hours" resolve to three.
  const re = new RegExp(
    `(?:${NOT_BEFORE}(\\d+(?:\\.\\d+)?)|${NOT_BEFORE}(\\p{L}+))?\\s*${NOT_BEFORE}(${HOUR_UNIT}|${MINUTE_UNIT})${NOT_AFTER}`,
    'gu',
  );
  // Per unit, the LARGEST count seen. Two readings of the same unit are a
  // range; two different units are one length spelled out in both
  // ("1 hour 30 minutes"), so hours and minutes add and repeats do not.
  let hours: number | null = null;
  let minutes: number | null = null;
  for (const m of text.matchAll(re)) {
    const count = countOf(m[1] ?? m[2]) ?? 1;
    if (!Number.isFinite(count) || count < 0) continue;
    const isHours = /^(?:h|ч)/.test(m[3]);
    if (isHours) hours = Math.max(hours ?? 0, count);
    else minutes = Math.max(minutes ?? 0, count);
  }
  if (hours === null && minutes === null) return null;
  const total = Math.round((hours ?? 0) * 60 + (minutes ?? 0));
  return total > 0 ? total : null;
}

/**
 * The shortest session worth writing a contract window for, and the longest
 * one this may prefill.
 *
 * The floor catches a misread ("5 minutes late" is not a session length).
 * The ceiling is where a stated length stops describing a session at all:
 * twelve hours is a full day, the coverage presets on the form exist for
 * exactly that case and carry their own contract wording, and a twelve hour
 * window prefilled from one sentence in a chat moves the line the overtime
 * clause bills from by half a day. Out of range means the end time stays
 * empty and Vero types what she meant, which is the same answer this module
 * gives to everything else it cannot read confidently.
 */
export const MIN_COVERAGE_MINUTES = 15;
export const MAX_COVERAGE_MINUTES = 12 * 60;

/**
 * Which stated duration the contract should carry.
 *
 * The photographer's, whenever she stated one. Not the shortest, not the
 * most recent thing said in the thread, and never the customer's guess
 * sitting next to hers: the contract window is the outer edge of what SHE
 * committed to. Her own later word replaces her earlier one, so the most
 * recent of her statements wins among themselves.
 *
 * When she never named a length and the customer did, that single statement
 * is used, and the form shows the sentence it came from so its source is
 * visible rather than implied. What never happens is the customer's number
 * standing in for hers: if the most recent thing SHE said cannot be read as
 * a sane length, this returns null and the end time stays empty. Falling
 * through to his number there would quietly put his shorter session on the
 * contract under her name.
 */
export function pickCoverageDuration(
  statements: readonly DurationStatement[] | null | undefined,
): { minutes: number; statement: DurationStatement } | null {
  if (!statements || statements.length === 0) return null;
  const fromHer = statements.filter((s) => s.speaker === 'photographer');
  const pool = fromHer.length > 0 ? fromHer : statements.filter((s) => s.speaker === 'client');
  // Newest first. The first one that carries a number at all decides, even
  // if that number then fails the sanity check: an absurd length is a reason
  // to stop, not a reason to reach further back into the thread.
  for (let i = pool.length - 1; i >= 0; i--) {
    const statement = pool[i];
    const minutes = parseDurationMinutes(statement.text);
    if (minutes === null) continue;
    if (minutes < MIN_COVERAGE_MINUTES || minutes >= MAX_COVERAGE_MINUTES) return null;
    return { minutes, statement };
  }
  return null;
}

/** What the thread knows about the coverage window, as the form's own values. */
export interface CoverageSuggestion {
  /** HH:MM for <input type="time">, or null when the thread never said. */
  start: string | null;
  /** HH:MM, or null. Null is a real answer: see below. */
  end: string | null;
  /**
   * The statement the end time was computed from, so the form can show the
   * sentence rather than a number that appeared from nowhere. Null when the
   * thread stated the window outright, and null when there is no end time.
   */
  endSource: DurationStatement | null;
}

/**
 * The coverage window a thread established, as the two values the form puts
 * in its time inputs.
 *
 * A stated window wins outright, because two clock readings need no
 * arithmetic. Otherwise the start time is whatever was named and the end
 * time is that start plus the duration the photographer promised.
 *
 * AN EMPTY END TIME IS A RESULT, NOT A FAILURE. When the thread names a
 * start and no readable length, this returns the start with end null, and
 * the form leaves End Time blank instead of falling back to its old 6 PM.
 * The end time on the contract is the line the overtime clause bills from,
 * so a guessed one silently moves when a session becomes billable, and that
 * is worse than a blank field the form already refuses to submit without.
 * A window that would run past midnight is refused for the same reason: the
 * contract names one date, so the arithmetic has stopped describing it.
 */
export function resolveCoverage(
  eventTime: string | null,
  statements: readonly DurationStatement[] | null | undefined,
): CoverageSuggestion {
  const stated = parseCoverageWindow(eventTime);
  if (stated.start && stated.end) {
    return { start: stated.start, end: stated.end, endSource: null };
  }
  const start = parseStartTime(eventTime);
  if (!start) return { start: null, end: null, endSource: null };

  const picked = pickCoverageDuration(statements);
  if (!picked) return { start, end: null, endSource: null };

  const [h, m] = start.split(':').map(Number);
  const endMinutes = h * 60 + m + picked.minutes;
  if (endMinutes >= 24 * 60) return { start, end: null, endSource: null };
  return {
    start,
    end: fmtHhmm(Math.floor(endMinutes / 60), endMinutes % 60),
    endSource: picked.statement,
  };
}

/**
 * What the form's two time inputs open on when the thread says nothing.
 *
 * Most sessions start in the late afternoon, and seeding whole hours means
 * Vero adjusts an hour rather than zeroing out :37 every time she opens the
 * picker. They are a convenience for a form opened from the Clients tab with
 * no conversation behind it, and nothing more than that.
 */
export const FALLBACK_START = '17:00';
export const FALLBACK_END = '18:00';

/**
 * The values the Start Time and End Time inputs actually open on.
 *
 * The whole point of this function is that the two defaults above are all or
 * nothing. A thread that named a start time gets that start time and an END
 * TIME THAT MAY WELL BE EMPTY, never a real 11:30 AM sitting next to a
 * made-up 6:00 PM: the end time is the line the overtime clause bills from,
 * and 6:00 PM would be a number nobody in the conversation ever said. A
 * thread that named no time at all is a different situation entirely and
 * keeps both defaults, because there is nothing there to contradict.
 *
 * It lives here rather than inline in the form because it is a rule about
 * what a contract may claim, not a piece of layout, and because it is the
 * exact line that was wrong: the form used to fall back per field, so a
 * known start and an unknown length produced 11:30 AM to 6:00 PM.
 */
/**
 * Which coverage preset a wedding package implies, by EXACT name.
 *
 * Exact, never substring: "Wedding Day" is a substring of "Full Wedding Day",
 * so a contains-check maps the wrong one and does it silently.
 *
 * ONLY ONE PACKAGE IS IN HERE, and the two that are missing are the point.
 * The half-day preset writes "approximately 4 hours" into the client's own
 * contract, twice. "Wedding Day" sells up to 6 hours and "Intimate Wedding"
 * up to 3, so mapping either to half-day would put a figure nobody agreed to
 * on a document they sign: two hours short on one, an hour long on the other.
 * Full-day is the only preset that pins no hour count, which is exactly why
 * it is the only one a package can safely imply. Everything else falls
 * through to the behaviour this form has today.
 */
const PACKAGE_COVERAGE_MODE: Readonly<Record<string, 'half-day' | 'full-day'>> = {
  'Full Wedding Day': 'full-day',
};

/**
 * The coverage preset the form should open on, or null to leave it alone.
 *
 * Three gates, and each one is a way this could go wrong:
 *
 * PRESETS MUST BE OFFERED. half-day and full-day are filtered out of the
 * option row unless the contract type allows them, and the reset that clears
 * a stale preset lives inside the type-change handler rather than an effect,
 * so it never runs at mount. Seeding full-day onto a portrait contract would
 * leave no chip selected, the preview box still on screen, and "Full-day
 * coverage" submitted as the time on a one-hour session.
 *
 * A STATED WINDOW WINS. If the thread agreed "2:00 PM to 10:00 PM", choosing
 * a preset would replace hours both sides settled with "exact schedule to be
 * confirmed". The test is endSource === null, meaning the window was READ off
 * the conversation rather than computed by adding a duration to a start: the
 * package's own "Up to 8 hours" can reach session_durations from the same
 * submission message, and an 8-hour window synthesised from a cap is not an
 * agreement.
 *
 * THE PACKAGE MUST BE ONE WE KNOW. An unrecognised, retired or misspelled
 * name returns null rather than guessing.
 *
 * Pure, and exported, so its rules can be exercised without a browser.
 */
export function seededCoverageMode(
  weddingPackage: string | null | undefined,
  suggestion: CoverageSuggestion,
  presetsAllowed: boolean,
): 'half-day' | 'full-day' | null {
  if (!presetsAllowed) return null;
  if (suggestion.start && suggestion.end && suggestion.endSource === null) return null;
  const name = (weddingPackage ?? '').split(';')[0].trim();
  if (!name) return null;
  return PACKAGE_COVERAGE_MODE[name] ?? null;
}

export function coverageFieldValues(suggestion: CoverageSuggestion): {
  start: string;
  end: string;
} {
  if (!suggestion.start) return { start: FALLBACK_START, end: FALLBACK_END };
  return { start: suggestion.start, end: suggestion.end ?? '' };
}

/**
 * The two lines that sit under a prefilled End Time.
 *
 * Wording is the entire mechanism here, so it lives next to the code that
 * produces the suggestion rather than a screen away from it. A prefilled end
 * time has to read as a suggestion, and the field it sits in has to read as
 * hers to change, because the contract's end time is where the overtime
 * clause starts counting and that clause is protection she chooses to use,
 * never something the system applies on her behalf. Nothing here may imply
 * that going past this time charges anyone anything.
 *
 * Shaped like the entries in the admin dictionary ({ en, ru }, picked by
 * lang) so it reads the same at the call site as every other admin string.
 */
export const COVERAGE_NOTES = {
  suggestedEnd: {
    en: 'Suggested from the conversation. This is the time the contract will name, so set it to whatever you are willing to commit to.',
    ru: 'Подставлено из переписки. Это время попадёт в контракт, поэтому поставь то, на что готова согласиться.',
  },
  noDuration: {
    en: 'The conversation gives a start time but never says how long the session runs, so the end time is yours to set.',
    ru: 'В переписке есть время начала, но нет длительности, поэтому время окончания нужно поставить самой.',
  },
} as const;

/** The six contracts that exist. Anything else a thread names becomes 'other'. */
export type SessionType = (typeof CONTRACT_TYPE_ORDER)[number];

/**
 * Session types whose contract names two people.
 *
 * Read off the registry's own `couple` flag rather than listed again. This
 * was written out twice before, here and in the summariser, and both copies
 * named elopement and anniversary, types no template has ever had. The
 * question "does this shoot name two people?" now has one answer, given by
 * the template that would have to carry the second name.
 */
export const COUPLE_SESSION_TYPES: readonly SessionType[] = CONTRACT_TYPE_ORDER.filter(
  (key) => CONTRACT_TEMPLATES[key]?.couple,
);

/**
 * Whatever was said about the shoot, as a key the form can actually render.
 *
 * Unknown is NOT the same as unsaid: a thread that never says what kind of
 * shoot it is stays null, so nothing gets asked about a type we are guessing
 * at, while a real shoot we have no template for ("newborn", "anniversary")
 * lands on 'other', which exists for exactly that. Free text would otherwise
 * ride into the new-client form and silently fail to match any template.
 */
export function toSessionType(raw: string | null | undefined): SessionType | null {
  const key = (raw ?? '').trim().toLowerCase();
  if (!key) return null;
  return (CONTRACT_TYPE_ORDER as readonly string[]).includes(key)
    ? (key as SessionType)
    : 'other';
}

export const isCoupleSession = (t: string | null | undefined): boolean => {
  const key = toSessionType(t);
  return key !== null && COUPLE_SESSION_TYPES.includes(key);
};
