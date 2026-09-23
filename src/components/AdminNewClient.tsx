import { Box, VStack, Stack, SimpleGrid, Text, Input, Select, Textarea, Flex, Checkbox, Button, Icon } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import FaComments from '../icons/fa/FaComments';
import { useEmailDelivery } from '../hooks/useEmailDelivery';
import CTAButton from './ui/CTAButton';
import AdminBackButton from './ui/AdminBackButton';
import {
  CONTRACT_TEMPLATES,
  CONTRACT_TYPE_ORDER,
  OPTIONAL_CLAUSES,
  isContractTemplateKey,
  formatContractMoney,
  type ContractTemplateField,
} from '../data/contract-template';
import { useAdminLang } from '../i18n/admin';
import {
  type ClientPrefill,
  COVERAGE_NOTES,
  coverageFieldValues,
  resolveCoverage,
  seededCoverageMode,
  isCoupleSession,
  toSessionType,
} from './clientPrefill';
import { fmtAdminDate } from '../utils/adminDate';
import {
  EMPTY_LOCATION,
  MAX_LOCATIONS,
  formatSchedule,
  isMultiLocation,
  parseLocations,
  type SessionLocation,
} from '../data/sessionLocations';
import ConversationPeek from './ConversationPeek';
import ConfirmDialog from './ui/ConfirmDialog';
import {
  TRAVEL_FREE_ROUND_TRIP_MILES,
  TRAVEL_SHARE_WARN_PCT,
  applyTravelDecision,
  finalTravelFee,
  formatDriveTime,
  formatMiles,
  formatTravelFee,
  parseDriveTimeMinutes,
  parseMiles,
  parseTravelOverride,
  quoteTravel,
  travelShareIsHigh,
  travelShareOfSessionPct,
  type TravelApplication,
  type TravelDecision,
  type TravelQuote,
  type TravelStatus,
} from '../data/travel-fee';
import { travelCopy, type TravelCopy } from './travelCopy';

interface Props {
  adminPassword: string;
  onCancel: () => void;
  onCreated: () => void;
  /**
   * Details lifted from a DM/email thread, when Vero got here from the inbox
   * rather than from the Clients tab. Everything is optional and everything
   * stays editable — this seeds the form, it does not lock it.
   */
  prefill?: ClientPrefill | null;
  /** Swap to the gallery-only form, carrying the same prefill. */
  onSwitchToGalleryOnly?: () => void;
}

// ─── Small formatting helpers ──────────────────────────────────────────

// Titlecase a name, but preserve internal capitalization. Handles
// McKenna, DeAndre, MacDonald, etc. — typing "McKenna" stays as
// "McKenna" instead of being flattened to "Mckenna". Pure all-lower
// or all-upper still gets normalized to "Capitalized".
const cap = (s: string): string => {
  if (!s) return '';
  const tail = s.slice(1);
  const hasInternalUpper = /[A-Z]/.test(tail);
  const hasInternalLower = /[a-z]/.test(tail);
  if (hasInternalUpper && hasInternalLower) {
    // Mixed case → assume intentional, just enforce the leading cap.
    return s.charAt(0).toUpperCase() + tail;
  }
  // All-lower or all-upper → normalize to Titlecase.
  return s.charAt(0).toUpperCase() + tail.toLowerCase();
};

const firstWord = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? '';

// Money in a contract is formatted in exactly one place, because
// api/admin/_portal-update.ts now writes these same figures when Vero corrects
// a price before signing. See formatContractMoney.
const fmtCurrency = formatContractMoney;

// "2026-08-09" → "August 9, 2026"
const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

// "17:00" → "5:00 PM"
const fmtTime12h = (hhmm: string): string => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
};

// Returns hours as a float, e.g. 1.5 for an hour and a half. 0 if invalid.
const hoursBetween = (startHhmm: string, endHhmm: string): number => {
  if (!startHhmm || !endHhmm) return 0;
  const [sH, sM] = startHhmm.split(':').map(Number);
  const [eH, eM] = endHhmm.split(':').map(Number);
  const startMin = sH * 60 + sM;
  const endMin = eH * 60 + eM;
  const diff = endMin - startMin;
  return diff > 0 ? diff / 60 : 0;
};

const formatEventTime = (startHhmm: string, endHhmm: string): string => {
  if (!startHhmm || !endHhmm) return '';
  const hours = hoursBetween(startHhmm, endHhmm);
  const label = (() => {
    if (hours === 0) return '';
    const rounded = Math.round(hours * 100) / 100;
    if (rounded === 1) return '1 hour';
    if (Number.isInteger(rounded)) return `${rounded} hours`;
    return `${rounded} hours`;
  })();
  return label
    ? `${fmtTime12h(startHhmm)} to ${fmtTime12h(endHhmm)} (approximately ${label})`
    : `${fmtTime12h(startHhmm)} to ${fmtTime12h(endHhmm)}`;
};

const defaultGalleryPassword = (p1First: string, p2First: string, year: string): string =>
  `${cap(p1First)}${cap(p2First)}${year}`;

const defaultDisplayName = (p1First: string, p2First: string): string => {
  const a = cap(p1First);
  const b = cap(p2First);
  if (a && b) return `${a} & ${b}`;
  return a || b;
};

const defaultEventTitle = (p1First: string, p2First: string, sessionType: string): string => {
  const names = defaultDisplayName(p1First, p2First);
  // Session labels are stored hyphenated ("birthday-party") so they round-trip
  // through the DB, which is right for filing and wrong in a sentence: this
  // title is the line the client reads at the top of their contract. All six
  // template keys are single words, so the split only ever touches a custom
  // label typed into the Session Label field.
  const type = sessionType.split('-').filter(Boolean).map(cap).join(' ');
  if (!names || !type) return '';
  // "Anna's Family" reads like an unfinished sentence on a document somebody
  // signs, so the bare type names get the noun. Four things are left alone: a
  // wedding, which is already a noun; the literal key "other", which is a
  // filing word and not something to print at a client; a custom label of more
  // than one word, which reads as a title on its own; and anything that
  // already ends in its own noun, so "Newborn Shoot" does not become "Newborn
  // Shoot Session".
  const lower = type.toLowerCase();
  if (lower === 'other') return `${names}'s Session`;
  const needsNoun =
    lower !== 'wedding' &&
    !type.includes(' ') &&
    !/(session|shoot|shooting|photos|photography|portraits)$/i.test(type);
  return `${names}'s ${type}${needsNoun ? ' Session' : ''}`;
};

/**
 * The suggested retainer for a given total.
 *
 * 15% of the total, but never below $100 and never above the total itself.
 * A flat 15% put a $30 retainer on a small session, which is not enough to be
 * worth holding a date for, and the floor still has to bend for a booking
 * that costs less than the floor, hence the Math.min.
 */
const RETAINER_RATE = 0.15;
const RETAINER_FLOOR = 100;
const suggestedRetainer = (total: number): string => {
  if (!Number.isFinite(total) || total <= 0) return '';
  return String(Math.min(total, Math.max(RETAINER_FLOOR, Math.round(total * RETAINER_RATE))));
};

// Session labels are stored lowercase-hyphenated so they round-trip through
// the DB without surprises. Same transform the custom chip in
// SessionTypePicker applies, kept identical so the gallery-only flow and this
// one file the same shoot under the same string.
const sessionSlug = (raw: string): string => raw.toLowerCase().replace(/\s+/g, '-');

// Hyphens the slug picked up at its edges are not part of the word. sessionSlug
// runs on every keystroke, so typing "newborn" and then a space files the
// booking as "newborn-" on the Clients list, on the calendar and in the DB. The
// .trim() this replaced could never fire: by the time anything reads the value,
// sessionSlug has already turned every space into a hyphen.
const trimSlug = (slug: string): string => slug.replace(/^-+|-+$/g, '');

// Words a scope phrase hangs its trailing detail off, in both languages the
// inbox speaks. Hitting one ends the label.
const SCOPE_CONNECTORS = new Set([
  'for', 'at', 'with', 'in', 'on', 'of', 'and', 'to',
  'для', 'на', 'с', 'в', 'и', 'по', 'от',
]);

/**
 * The head of a scope phrase, as a filing label.
 *
 * session_scope arrives as a fragment in the customer's own words ("branding
 * session for a bakery", "60th birthday party"), and the label it seeds is
 * both what the portal is filed under and the word in the auto event title,
 * where "Anna's Branding Session For A Bakery" reads like a bug. Cutting at
 * the first connector keeps the part that names the shoot and drops the part
 * that describes the client, with a four-word ceiling so a phrase carrying no
 * connector cannot run away either. Vero types over it whenever it guesses
 * badly, which is the whole reason the field is on screen.
 */
const sessionLabelFromScope = (raw: string): string => {
  const words: string[] = [];
  for (const word of raw.trim().split(/\s+/)) {
    // Punctuation would otherwise survive into the slug ("branding-session,").
    // A word that is nothing BUT punctuation cleans down to a bare hyphen, or
    // to nothing at all, and "60th birthday - family style" would otherwise
    // join back up as "60th-birthday---family".
    const clean = word.replace(/[^\p{L}\p{N}-]/gu, '');
    if (!/[\p{L}\p{N}]/u.test(clean)) continue;
    // "a newborn shoot" files itself as "newborn-shoot". Skipped rather than
    // treated as a connector, which would end the label before it started.
    if (!words.length && ['a', 'an', 'the'].includes(clean.toLowerCase())) continue;
    if (SCOPE_CONNECTORS.has(clean.toLowerCase())) break;
    words.push(clean);
    if (words.length === 4) break;
  }
  return sessionSlug(words.join(' '));
};

// Field-error ids for the template-driven variable rows. Namespaced so a
// variable called e.g. `total_amount` could never collide with the 'total'
// id used by the pricing input above.
const varFieldId = (key: string): string => `var:${key}`;

// Today as YYYY-MM-DD in the user's local time (so the date input picker
// matches what they'd expect from "today").
const todayYmd = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ─── Component ─────────────────────────────────────────────────────────

const AdminNewClient = ({ adminPassword, onCancel, onCreated, prefill, onSwitchToGalleryOnly }: Props) => {
  const { t, lang } = useAdminLang();
  // Travel copy lives in its own module rather than in the admin dictionary,
  // because the arithmetic beside it is imported by an api/ handler and the
  // dictionary would drag React and Chakra into a serverless function. See the
  // header of travelCopy.ts.
  const tv = travelCopy(lang);
  // Seeded once, at mount. Every field below stays fully editable; the point
  // is to save retyping what the customer already said, not to decide anything.
  //
  // A session type the thread mentioned that is NOT one of the six templates
  // ("newborn", "boudoir") lands on Other. Falling back to the first template
  // instead would quietly write a WEDDING contract for a newborn shoot.
  //
  // The summariser now coerces that word to a template key before it ever gets
  // here (readBooking, via toSessionType), so session_type arrives as one of
  // the six or null and the unknown branch is a guard for a prefill built
  // anywhere else. What the shoot actually was survives in session_scope,
  // which is what seeds the session label further down.
  //
  // toSessionType rather than a bare isContractTemplateKey test, because that
  // test is case-sensitive while the fallback here is Other: a prefill built
  // outside the summariser carrying "Wedding" or " wedding" would have been
  // read as an unlisted shoot and written a SESSION contract for a wedding.
  // It is also the normalisation isCoupleSession and the panel rows below
  // already apply, so one string cannot mean two types on one screen. Null,
  // meaning the thread never said, is the only case that falls back to the
  // first template.
  const seededTemplate = toSessionType(prefill?.session_type) ?? CONTRACT_TYPE_ORDER[0];
  // Start, end, and the sentence the end came from. resolveCoverage owns
  // every judgement in there: which of two stated lengths counts, whether a
  // lone clock reading is safe to trust, and when the honest answer is no end
  // time at all. This file only decides what to render.
  const seededTimes = resolveCoverage(prefill?.event_time ?? null, prefill?.session_durations);
  const [templateKey, setTemplateKey] = useState<string>(seededTemplate);
  const spec = CONTRACT_TEMPLATES[templateKey];
  // Template-driven variable fields (the static ones at the bottom).
  const fields = spec?.fields ?? [];
  // Wedding and engagement name two people. Every other type names one, and
  // the partner_2 columns stay NULL. A family booking must not ask whose
  // partner is coming.
  const isCouple = Boolean(spec?.couple);

  // Client full names. First names are extracted automatically for
  // derived fields (display name, gallery password, event title).
  const [partner1FullName, setPartner1FullName] = useState(prefill?.client_full_name ?? '');
  const [partner2FullName, setPartner2FullName] = useState(prefill?.partner_full_name ?? '');
  const p1First = firstWord(partner1FullName);
  // Ignored outright on a solo type, so a partner typed before the template
  // was switched cannot leak into the display name, the gallery password or
  // the contract's client_names.
  const p2First = isCouple ? firstWord(partner2FullName) : '';

  // Auto-derived: display name, event title, gallery password.
  // All overridable — once the user types something into the override
  // box we stop syncing with the derived value (null means "not yet
  // overridden, use derived").
  const [displayNameOverride, setDisplayNameOverride] = useState<string | null>(null);
  const [eventTitleOverride, setEventTitleOverride] = useState<string | null>(null);
  const [galleryPasswordOverride, setGalleryPasswordOverride] = useState<string | null>(null);

  const [clientEmail, setClientEmail] = useState(prefill?.client_email ?? '');
  const [eventDateIso, setEventDateIso] = useState(prefill?.event_date ?? '');
  /**
   * The coverage window.
   *
   * With nothing from a thread it opens on 5:00 PM to 6:00 PM. Most sessions
   * start in the late afternoon, and seeding zero-minute values means Vero
   * adjusts an hour instead of zeroing out :37 every time she opens the
   * picker.
   *
   * Once the thread DOES name a start time, that default stops being a
   * convenience and starts being wrong, so it is not used at all. It used to
   * win anyway: the panel at the top of this form displayed the 11:30 AM the
   * summariser had read out of the conversation while the fields underneath
   * it sat on 5 PM to 6 PM, and 5 PM is what went onto the contract.
   *
   * The end time is filled only when the thread established a length. Blank
   * is the honest answer otherwise, and a far better one than a guess: the
   * end time on the contract is the line the overtime clause bills from, so
   * a number nobody agreed to silently moves when a session becomes
   * billable. The submit check below refuses to send a blank one out.
   *
   * Which of those cases applies is coverageFieldValues' decision, not this
   * file's, so the rule can be tested without a browser.
   */
  const seededFields = coverageFieldValues(seededTimes);
  const [eventStartTime, setEventStartTime] = useState(seededFields.start);
  const [eventEndTime, setEventEndTime] = useState(seededFields.end);

  // Coverage type covers the case where the booking is sold as a
  // package (half-day, full-day) and exact times aren't known yet —
  // common for weddings booked months out where the timeline gets
  // finalized closer to the event.
  type Coverage = 'specific' | 'half-day' | 'full-day' | 'custom';
  /**
   * SEEDED FROM THE PACKAGE, which it never used to be.
   *
   * A lead who clicked Full Wedding Day on the weddings page arrived with a
   * date and no clock time, so resolveCoverage correctly declined to invent
   * one and coverageFieldValues handed back its 17:00/18:00 pair. With the
   * mode hardcoded to 'specific', that rendered as a one hour session at 5 PM
   * on a booking sold as up to eight, which is the form disagreeing with the
   * summary panel sitting beside it.
   *
   * seededCoverageMode owns every judgement: which packages may imply a
   * preset at all, that a window the thread actually agreed outranks one, and
   * that a type whose contract has no presets is left alone. It returns null
   * for everything it is unsure about, and null is today's behaviour.
   *
   * A LAZY INITIALISER, so the rule runs once at mount. There is no effect
   * behind this: the only thing that clears a stale preset lives inside the
   * type-change handler, so a value put here is the value the form opens on.
   *
   * The two time inputs keep their seeded values on purpose. They are not
   * rendered, validated or submitted while a preset is selected, and they are
   * what she lands on if she taps Specific Times.
   */
  const [coverage, setCoverage] = useState<Coverage>(
    () =>
      seededCoverageMode(
        prefill?.wedding_package,
        seededTimes,
        Boolean(CONTRACT_TEMPLATES[seededTemplate]?.coveragePresets),
      ) ?? 'specific',
  );
  const [customCoverage, setCustomCoverage] = useState('');

  /**
   * The SECOND and later places, when a booking happens in more than one.
   *
   * Empty is the normal case and the whole block stays hidden, so a booking
   * in one place submits exactly the payload it did before this existed. The
   * FIRST place is not held here: it is the location and time fields above,
   * because the travel fee is measured to it and duplicating the address into
   * a row would give this screen two answers to one question.
   */
  const [extraPlaces, setExtraPlaces] = useState<SessionLocation[]>([]);
  /**
   * The schedule sentence, once she has edited it.
   *
   * null means "still following the places above", which is what it does
   * until she types. Same shape as galleryPasswordOverride, and for the same
   * reason: a derived value that silently overwrites a person's own words is
   * worse than one that visibly stops deriving.
   */
  const [scheduleOverride, setScheduleOverride] = useState<string | null>(null);

  // 'other' only: Vero's own word for the shoot. It is what the portal is
  // filed under (session_type) and what the auto event title is built from.
  // Everything else sends the template key itself, so there is no second
  // picker to keep in agreement with the contract on top of the form.
  //
  // Seeded from session_scope, NOT from session_type. Seeding off the type was
  // dead code once the summariser started coercing it: an unlisted shoot
  // arrives as the literal string 'other', so the booking filed itself under
  // "other", the auto event title lost its session word, and the only record
  // of what the customer actually booked was thrown away at mount.
  const [customSessionLabel, setCustomSessionLabel] = useState<string>(() =>
    CONTRACT_TEMPLATES[seededTemplate]?.allowsCustomLabel
      ? sessionLabelFromScope(prefill?.session_scope ?? '')
      : '',
  );
  // What the portal is filed under. Blank label on Other falls back to the
  // template key, because the API rejects an empty session_type.
  const sessionType = spec?.allowsCustomLabel
    ? trimSlug(customSessionLabel) || templateKey
    : templateKey;
  // The auto title never uses the type's own name, because "Anna's Other /
  // Custom" is not a title. With no label typed it says "Session" rather than
  // nothing: the old form could not reach that state (the session-type field
  // was required), and an empty event_title prints a bare "Title:" row on the
  // contract and no heading at all on the welcome page. English on purpose,
  // like every other string that ends up on the customer's contract.
  const titleSessionType = spec?.allowsCustomLabel
    ? trimSlug(customSessionLabel) || 'Session'
    : templateKey;

  const [totalAmount, setTotalAmount] = useState(prefill?.total_amount ?? '');
  const [retainerAmount, setRetainerAmount] = useState(() => {
    if (prefill?.retainer_amount) return prefill.retainer_amount;
    return suggestedRetainer(parseFloat(prefill?.total_amount ?? ''));
  });
  /**
   * The retainer follows the total (see suggestedRetainer) until it is typed
   * in by hand, after which it stops moving. Same override pattern as the
   * display name and the gallery password: derive a sensible default, never
   * fight the operator.
   *
   * A retainer the thread already established counts as deliberate, so a
   * prefilled one starts out overridden rather than being recalculated.
   */
  const [retainerTouched, setRetainerTouched] = useState(Boolean(prefill?.retainer_amount));
  const applyTotal = (next: string) => {
    setTotalAmount(next);
    if (retainerTouched) return;
    setRetainerAmount(suggestedRetainer(parseFloat(next)));
  };

  // ─── Travel ───
  //
  // Miles and minutes are typed in by hand, read off the Google Maps tab the
  // Look it up button opens. Manual, not automated, and not because an API
  // would cost anything: the repo is at exactly 12 of the 12 top level api
  // handlers the Vercel free tier allows, so an automated lookup would have to
  // become another action inside api/admin.ts with a key to rotate and a quota
  // to watch, for something that happens a few times a month. Manual entry also
  // sidesteps the storage licence problem, which is the sharp edge nobody
  // expects: Google allows caching coordinates for 30 days and then requires
  // deletion, and Mapbox forbids storing geocoding results at all. Miles and
  // dollars are derived business values and are ours to keep forever.
  //
  // ONE WAY, because one way is what Maps prints. travel-fee.ts doubles it.
  const [travelMilesOneWay, setTravelMilesOneWay] = useState('');
  // Displayed, never computed with. See the note at the top of travel-fee.ts.
  const [travelMinutesOneWay, setTravelMinutesOneWay] = useState('');
  // 'none' is "she has not answered yet", 'declined' is a real answer. The
  // difference is the whole reason the offer does not nag: once declined, the
  // panel collapses to one muted line and stays there until she asks for it
  // back or changes the mileage.
  const [travelStatus, setTravelStatus] = useState<TravelStatus>('none');
  const [travelLinkBusy, setTravelLinkBusy] = useState(false);
  const [travelLinkNote, setTravelLinkNote] = useState('');
  // The override, in three pieces so that opening the box, typing in it, and
  // having actually agreed a number are three separate facts.
  //
  // travelCustomOpen alone is what keeps the common case one tap: the box is
  // shut, the computed figure is the default, and nothing about this feature is
  // on screen until she asks for it. travelOverride is null right up until she
  // accepts a figure she typed, so a half typed "5" in the box can never reach
  // the total, and abandoning the box leaves the computed figure standing.
  const [travelCustomOpen, setTravelCustomOpen] = useState(false);
  const [travelCustomInput, setTravelCustomInput] = useState('');
  const [travelOverride, setTravelOverride] = useState<number | null>(null);

  const [additionalNotes, setAdditionalNotes] = useState('');

  // Optional: a third party who's signing + paying (e.g. parent of the
  // bride). When the toggle is off both fields are sent as empty
  // strings and the RESPONSIBLE PARTY section is pruned out of the
  // rendered contract.
  const [responsiblePartyEnabled, setResponsiblePartyEnabled] = useState(false);
  const [responsiblePartyName, setResponsiblePartyName] = useState('');
  const [responsiblePartyRelationship, setResponsiblePartyRelationship] = useState('');

  // Optional service clauses. Each checkbox drives a single 'yes' / '' flag
  // variable, and every one of those sections is marked optional with
  // requireVariables, so an unticked box prunes its section out of the
  // rendered contract. Which boxes appear comes from the chosen type's
  // spec.optionalClauses, keyed here by flag so ticking one, wandering off to
  // another type and coming back does not silently lose it.
  const [clauseFlags, setClauseFlags] = useState<Record<string, boolean>>({});
  const offeredClauses = spec?.optionalClauses ?? [];

  const [variables, setVariables] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? ''])),
  );

  // Default the effective_date to today, and fold in anything the thread told
  // us. An effect rather than part of the useState initializer so it lands
  // after the first render regardless of what else seeds this map.
  //
  // The per-type details matter as much as the location: due_date and
  // session_scope are REQUIRED by their types, so dropping them here would
  // mean the summariser reads a due date out of the thread and Vero retypes
  // it anyway to get past the submit check. Gated on the seeded type actually
  // having the field so a stray key cannot ride into contract_variables for a
  // contract that has nowhere to print it. Dates arrive as YYYY-MM-DD, which
  // is what the date inputs want and what the ISO-to-friendly pass at submit
  // looks for.
  useEffect(() => {
    const seeded: Record<string, string> = {};
    const seed = (key: string, value: string | null | undefined) => {
      if (value && fields.some((f) => f.key === key)) seeded[key] = value;
    };
    seed('event_location', prefill?.event_location);
    seed('due_date', prefill?.due_date);
    seed('wedding_date', prefill?.wedding_date);
    seed('session_scope', prefill?.session_scope);
    setVariables((prev) => ({
      ...prev,
      effective_date: prev.effective_date || todayYmd(),
      ...seeded,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Switching the contract type used to rebuild `variables` from scratch.
   * With one template that was invisible; with six it throws away a typed
   * address the moment somebody corrects Portrait to Family.
   *
   * So: a value the operator actually typed is carried across when the new
   * type still has that key, and everything else takes the new type's
   * default. "Actually typed" means it differs from the OLD type's default,
   * which is the part that matters: carrying the wedding default of "Within
   * 5 weeks after event" into a family contract that promises two weeks would
   * be worse than discarding it.
   */
  const handleTemplateChange = (nextKey: string) => {
    const prevDefaults = new Map(fields.map((f) => [f.key, f.defaultValue ?? '']));
    const nextFields = CONTRACT_TEMPLATES[nextKey]?.fields ?? [];
    setVariables((prev) => {
      const next: Record<string, string> = {};
      for (const field of nextFields) {
        const current = prev[field.key];
        const untouched = current === undefined || current === prevDefaults.get(field.key);
        next[field.key] = untouched ? (field.defaultValue ?? '') : current;
      }
      if (!next.effective_date) next.effective_date = todayYmd();
      return next;
    });
    // Half-day and full-day exist only where the presets are offered. Leaving
    // a stale 'half-day' selected would put wedding-package wording on a
    // portrait contract through a control that is no longer on screen.
    if (!CONTRACT_TEMPLATES[nextKey]?.coveragePresets && (coverage === 'half-day' || coverage === 'full-day')) {
      setCoverage('specific');
    }
    // Required-field highlighting belongs to the type that was on screen when
    // she submitted; the new type has its own set.
    setFieldErrors((prev) => {
      const kept = [...prev].filter((id) => !id.startsWith('var:'));
      return kept.length === prev.size ? prev : new Set(kept);
    });
    setTemplateKey(nextKey);
  };

  const eventYear = eventDateIso ? eventDateIso.slice(0, 4) : new Date().getFullYear().toString();
  const derivedDisplayName = defaultDisplayName(p1First, p2First);
  const derivedGalleryPassword = defaultGalleryPassword(p1First, p2First, eventYear);
  const derivedEventTitle = defaultEventTitle(p1First, p2First, titleSessionType);

  const clientDisplayName = displayNameOverride ?? derivedDisplayName;
  const galleryPassword = galleryPasswordOverride ?? derivedGalleryPassword;
  const eventTitle = eventTitleOverride ?? derivedEventTitle;

  // Half-day and full-day are wedding packages, sold months out when the
  // timeline is not settled. A portrait session is not sold that way, and
  // offering the preset would put "the major moments of the Client's day"
  // into a one-hour shoot's contract.
  const coverageOptions = (
    [
      { key: 'specific', label: t.newClient.coverageSpecific },
      { key: 'half-day', label: t.newClient.coverageHalfDay },
      { key: 'full-day', label: t.newClient.coverageFullDay },
      { key: 'custom', label: t.newClient.coverageCustom },
    ] as const
  ).filter((opt) => spec?.coveragePresets || (opt.key !== 'half-day' && opt.key !== 'full-day'));

  /**
   * Label and help text for one clause checkbox.
   *
   * The dictionary comes first so Vero reads these in Russian, and
   * OPTIONAL_CLAUSES is the fallback for any clause added to a template
   * before it has been translated: an untranslated checkbox in English beats
   * a checkbox that silently disappears. Last of all comes the raw flag name,
   * which is deliberately ugly: a blank label beside a checkbox that decides
   * what the client signs is the one outcome worth ruling out.
   */
  const clauseCopy = (key: string): { label: string; help: string } => {
    const translated = (t.newClient.clauses as Record<string, { label: string; help: string } | undefined>)[key];
    const fallback = OPTIONAL_CLAUSES[key];
    return {
      label: translated?.label ?? fallback?.label ?? key,
      help: translated?.help ?? fallback?.helpText ?? '',
    };
  };

  const [peekOpen, setPeekOpen] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

  /**
   * Floating "View conversation" button.
   *
   * The form is long and the button that opens the thread lived only in the
   * panel at the very top, so checking a detail from halfway down meant
   * scrolling all the way up and all the way back. It now follows.
   *
   * It hides in the two places it would be noise or harm: while the panel is
   * on screen (its own button is right there) and while the submit button is
   * on screen, because a floating control must never sit on top of the
   * primary action — especially on a phone, where it would land exactly under
   * the thumb aiming for "Create".
   */
  const panelRef = useRef<HTMLDivElement | null>(null);
  const submitRef = useRef<HTMLDivElement | null>(null);
  const [panelVisible, setPanelVisible] = useState(true);
  const [submitVisible, setSubmitVisible] = useState(false);


  /**
   * A row that only some session types have, present when the thread's own
   * type has a field for it and required when that type marks it required.
   *
   * Read off the spec rather than listed here, the same way the submit check
   * is. due_date belongs to maternity and session_scope to Other today, and a
   * second copy of that pairing would drift the moment a field moves between
   * types. The prefill's type decides, not the dropdown's, because this panel
   * describes the conversation rather than the form.
   */
  const typeScopedRow = (key: string, label: string, value: string | null) => {
    const type = toSessionType(prefill?.session_type);
    const field = type ? CONTRACT_TEMPLATES[type]?.fields.find((f) => f.key === key) : undefined;
    return field ? [{ label, value, required: Boolean(field.required) }] : [];
  };

  /**
   * The time row on the panel, which is the one place the window can be
   * checked against the conversation before anything is created.
   *
   * It shows the window the form is actually seeded with rather than the
   * fragment the thread happened to contain, because "11:30 AM" sitting on
   * the panel above two time fields reading 11:30 AM and 1:00 PM invites
   * exactly one question, and the panel should answer it. Where that end
   * time came from is the quote underneath, the same way the date and the
   * total already carry the sentence they were read out of. On a thread
   * where both parties named a length, that sentence is hers, which is the
   * only visible sign that the choice was made at all.
   */
  const coverageRow = (() => {
    if (!prefill) return null;
    const { start, end } = seededTimes;
    return {
      label: t.newClient.pfEventTime,
      value: start && end ? `${fmtTime12h(start)} to ${fmtTime12h(end)}` : prefill.event_time,
      required: false,
      quote: seededTimes.endSource?.quote ?? null,
    };
  })();

  /**
   * The line under the End Time field, or nothing.
   *
   * There are two things worth saying and they are different things. A
   * prefilled end time needs to read as a suggestion, because it was
   * computed from a length somebody typed in a chat and it is the time the
   * contract will name. A blank one needs to say why it is blank, or it
   * reads as the form having failed to fill a field in.
   *
   * Both disappear the moment Vero types her own time, since a note
   * explaining a value that is no longer on screen is just noise. Neither
   * mentions money: the overtime clause bills from this line only if she
   * decides to invoke it, and copy on this form implying otherwise would
   * misrepresent her own contract back to her.
   */
  const endTimeNote = ((): string | null => {
    if (!prefill || !seededTimes.start) return null;
    if (seededTimes.end) {
      return eventEndTime === seededTimes.end ? COVERAGE_NOTES.suggestedEnd[lang] : null;
    }
    return eventEndTime ? null : COVERAGE_NOTES.noDuration[lang];
  })();

  // The type reads the way the dropdown reads it. The bare key is what the API
  // stores, and "other" sitting in this panel says nothing about a shoot the
  // customer described in full one line below.
  const prefillTypeName =
    prefill?.session_type && isContractTemplateKey(prefill.session_type)
      ? CONTRACT_TEMPLATES[prefill.session_type].name
      : (prefill?.session_type ?? null);

  /**
   * Every contract detail, whether the thread had it or not.
   *
   * The panel used to show only the two fields that happened to carry a source
   * quote, which read as an arbitrary two-item list next to a form holding
   * eight prefilled values. What is actually useful is the whole set at a
   * glance, and — more so — which required ones are still blank, since those
   * are the reason she cannot submit yet.
   *
   * Ordered the way the inbox's own "Still needed" list is ordered, so the two
   * lists Vero reads about one booking name things in the same sequence.
   */
  const prefillRows = prefill
    ? ([
        { label: t.newClient.pfSessionType, value: prefillTypeName, required: true },
        ...typeScopedRow('session_scope', t.newClient.pfSessionScope, prefill.session_scope),
        { label: t.newClient.pfEventDate, value: prefill.event_date ? fmtDate(prefill.event_date) : null, required: true, quote: prefill.event_date_quote },
        ...typeScopedRow('due_date', t.newClient.pfDueDate, prefill.due_date ? fmtDate(prefill.due_date) : null),
        ...(coverageRow ? [coverageRow] : []),
        { label: t.newClient.pfEventLocation, value: prefill.event_location, required: false },
        { label: t.newClient.pfClientName, value: prefill.client_full_name, required: true },
        ...(isCoupleSession(prefill.session_type)
          ? [{ label: t.newClient.pfPartnerName, value: prefill.partner_full_name, required: false }]
          : []),
        { label: t.newClient.pfClientEmail, value: prefill.client_email, required: true },
        ...typeScopedRow('wedding_date', t.newClient.pfWeddingDate, prefill.wedding_date ? fmtDate(prefill.wedding_date) : null),
        { label: t.newClient.pfTotal, value: prefill.total_amount ? `$${prefill.total_amount}` : null, required: true, quote: prefill.total_amount_quote },
        { label: t.newClient.pfRetainer, value: prefill.retainer_amount ? `$${prefill.retainer_amount}` : null, required: true },
      ] as Array<{ label: string; value: string | null; required: boolean; quote?: string | null }>)
    : [];
  const foundRows = prefillRows.filter((r) => r.value);
  const stillToFill = prefillRows.filter((r) => !r.value && r.required).map((r) => r.label);

  const [submitting, setSubmitting] = useState(false);

  // Invite-delivery tracking. Creating a full portal sends an activation email,
  // and on Resend's free tier that send can be rejected or bounced minutes
  // later because the shared sending IP is blocklisted. The endpoint used to
  // swallow that and return 200, so Vero was told it worked and the client
  // never got their link. Now we hold her here until Resend confirms delivery.
  const [inviteEmailId, setInviteEmailId] = useState<string | null>(null);
  const [createdPortalId, setCreatedPortalId] = useState<string | null>(null);

  useEffect(() => {
    if (!prefill) return;
    const watch = (el: Element | null, set: (v: boolean) => void) => {
      if (!el) return () => {};
      const io = new IntersectionObserver(([e]) => set(e.isIntersecting), { threshold: 0 });
      io.observe(el);
      return () => io.disconnect();
    };
    const a = watch(panelRef.current, setPanelVisible);
    const b = watch(submitRef.current, setSubmitVisible);
    return () => {
      a();
      b();
    };
  }, [prefill, submitting]);

  const showFloatingPeek = Boolean(prefill) && !panelVisible && !submitVisible;
  const [sendAttempts, setSendAttempts] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const deliveryStatus = useEmailDelivery(inviteEmailId);

  // The original send counts as attempt 1, so this is the original plus two
  // retries — the budget the owner asked for.
  const MAX_SEND_ATTEMPTS = 3;
  const outOfRetries = sendAttempts >= MAX_SEND_ATTEMPTS;

  // Delivered → she is done here; drop back to the client list.
  useEffect(() => {
    if (deliveryStatus === 'delivered') {
      const t = setTimeout(() => onCreated(), 1200);
      return () => clearTimeout(t);
    }
  }, [deliveryStatus, onCreated]);

  const handleRetryInvite = async () => {
    if (!createdPortalId || outOfRetries) return;
    setRetrying(true);
    setError('');
    try {
      const res = await fetch('/api/admin/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `id`, not `portal_id`. _resend-invite.ts reads req.body.id and
        // nothing else, so this posted an empty id and answered 400 "id
        // required" every time, burning one of three retry attempts per press
        // without a single email being re-sent. AdminClientDetail posts the
        // same endpoint correctly, which is why it went unnoticed.
        body: JSON.stringify({ password: adminPassword, id: createdPortalId }),
      });
      const data = await res.json();
      setSendAttempts((n) => n + 1);
      if (res.ok && data.success) {
        setInviteEmailId(data.invite_email_id ?? null);
      } else {
        setError(data.error || t.newClient.serverErrorStatus(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setRetrying(false);
    }
  };
  const [error, setError] = useState('');
  // Set of field ids that failed the last submit attempt. Drives
  // per-field red highlighting via <Field hasError={...}> — much
  // faster to eyeball than reading "these fields are required: X, Y, Z"
  // and hunting them down manually in a form this long.
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const clearFieldError = (id: string) => {
    setFieldErrors((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleVarChange = (key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  };

  // ─── Where it happens, derived ───
  //
  // ONE list, built from the fields that already exist plus whatever extra
  // places she added. The first entry is the location and time above, so
  // there is exactly one place on this screen where the main address lives
  // and the travel fee cannot end up measured to a different one.
  //
  // parseLocations drops the empty rows, which is what makes an untouched
  // form produce an empty list and every derived value below fall back to
  // today's behaviour.
  const firstPlace: SessionLocation = {
    label: '',
    address: (variables.event_location ?? '').trim(),
    // Only a specific-times booking has clock times to put on a line. A
    // half-day package has no start to print, and printing the preset's
    // placeholder pair would put a time on the contract nobody agreed to.
    starts_at: coverage === 'specific' && eventStartTime ? fmtTime12h(eventStartTime) : '',
    ends_at: coverage === 'specific' && eventEndTime ? fmtTime12h(eventEndTime) : '',
  };
  const allPlaces = parseLocations([firstPlace, ...extraPlaces]);
  const multiPlace = isMultiLocation(allPlaces);
  const derivedSchedule = formatSchedule(allPlaces);
  // What the contract will actually say. The override wins once she types,
  // and reverts to following the places the moment she clears it.
  const scheduleText = scheduleOverride ?? derivedSchedule;

  const addPlace = () =>
    setExtraPlaces((p) => (p.length + 1 >= MAX_LOCATIONS ? p : [...p, { ...EMPTY_LOCATION }]));
  const setPlace = (i: number, key: keyof SessionLocation, v: string) =>
    setExtraPlaces((p) => p.map((row, j) => (j === i ? { ...row, [key]: v } : row)));
  const removePlace = (i: number) => setExtraPlaces((p) => p.filter((_, j) => j !== i));
  const movePlace = (i: number, by: number) =>
    setExtraPlaces((p) => {
      const j = i + by;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // ─── Travel, derived ───
  //
  // The session price and the travel fee are held apart right up to submit.
  // totalAmount is what the SHOOT costs; the fee is added on top to produce the
  // figure the client signs for. Accepting therefore never edits the total
  // input, which is what makes "declining changes nothing" true by
  // construction: there is no amount to take back out when she corrects the
  // mileage, and no way for a stale fee to survive a change of mind.
  // The drive time is handed in as a SECOND argument and reaches the advisory
  // flags only. It cannot move the fee: quoteTravel works the money out from
  // the miles alone, which is what keeps the figure on a signed contract
  // reproducible from the contract. What the minutes buy is the long haul
  // checklist and the typo guard, both of which need to know how long she is
  // actually going to be in the car.
  const travelQuote = quoteTravel(
    parseMiles(travelMilesOneWay) ?? NaN,
    parseDriveTimeMinutes(travelMinutesOneWay),
  );
  // The ONE number every surface reads: her figure when she agreed one, the
  // computed figure otherwise. The total, the share warning, the line item and
  // the contract clause all come off this, because the way an override goes
  // wrong is one of those four keeping the old number.
  const travelFee = finalTravelFee(travelQuote?.fee ?? 0, travelOverride);
  const travelDecision: TravelDecision =
    travelStatus === 'accepted' && travelQuote?.autofillable
      ? {
          status: 'accepted',
          fee: travelFee,
          roundTripMiles: travelQuote.roundTripMiles,
          custom: travelOverride !== null,
        }
      : { status: travelStatus === 'declined' ? 'declined' : 'none', fee: 0, roundTripMiles: 0 };
  const sessionTotalNumber = parseFloat(totalAmount);
  const travelApplication = applyTravelDecision(
    Number.isFinite(sessionTotalNumber) ? sessionTotalNumber : 0,
    travelDecision,
  );

  /**
   * Any edit to the mileage invalidates a decision made about a different
   * number, so the offer comes back rather than silently re-pricing itself.
   * A fee she accepted at 53 miles must not quietly become a different fee
   * because she corrected it to 73.
   *
   * The override goes with it. It was agreed against a distance, and the
   * contract clause prints that distance as the reason for it, so carrying a
   * typed figure over to a different journey would print a reason that was
   * never the reason.
   */
  const applyTravelMiles = (next: string) => {
    setTravelMilesOneWay(next);
    setTravelStatus('none');
    setTravelOverride(null);
    setTravelCustomOpen(false);
    setTravelCustomInput('');
  };

  /** Opens the money box on the computed figure, so agreeing to it is one tap. */
  const openTravelCustom = () => {
    const start = travelOverride ?? travelQuote?.fee ?? null;
    setTravelCustomInput(start === null ? '' : String(start));
    setTravelCustomOpen(true);
    // Reopens the question, which is what lets the same link work from the
    // accepted panel. A no-op when the offer is already the thing on screen.
    setTravelStatus('none');
  };

  /** Shuts the box and forgets the typed figure. The computed one stands. */
  const cancelTravelCustom = () => {
    setTravelCustomOpen(false);
    setTravelCustomInput('');
    setTravelOverride(null);
  };

  /** Accepts the typed figure. Ignored outright when it is not a real amount. */
  const acceptTravelCustom = () => {
    const parsed = parseTravelOverride(travelCustomInput);
    if (parsed === null) return;
    setTravelOverride(parsed);
    setTravelCustomOpen(false);
    setTravelStatus('accepted');
  };

  /**
   * Opens Google Maps directions from her base to the typed address.
   *
   * The URL is built SERVER SIDE, in api/admin/_travel-link.ts, because it is
   * the one link that carries an origin and her origin is a home address. The
   * client bundle is public and statically built, so the value can never live
   * in this file. See that handler for exactly what does and does not reach the
   * browser as a result.
   */
  const openTravelLookup = async () => {
    const destination = (variables.event_location ?? '').trim();
    if (!destination) {
      setTravelLinkNote(tv.noAddressYet);
      return;
    }
    setTravelLinkBusy(true);
    setTravelLinkNote('');
    try {
      const res = await fetch('/api/admin/travel-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, destination }),
      });
      const data = await res.json();
      if (res.ok && data.success && typeof data.url === 'string') {
        // noopener so the opened Maps tab cannot reach back into the admin
        // panel through window.opener.
        window.open(data.url, '_blank', 'noopener,noreferrer');
        setTravelLinkNote(data.origin_configured ? '' : tv.originMissing);
      } else {
        setTravelLinkNote(tv.linkFailed);
      }
    } catch {
      setTravelLinkNote(tv.linkFailed);
    } finally {
      setTravelLinkBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setFieldErrors(new Set());

    // Collect ALL missing/invalid fields up front instead of
    // early-returning on the first one — Vero shouldn't have to fix
    // → submit → fix → submit → fix through a long form to discover
    // every missing piece one at a time.
    const missing: { id: string; label: string }[] = [];
    if (!partner1FullName.trim())
      missing.push({
        id: 'partner1',
        label: isCouple ? t.newClient.fieldLabelPartner1 : t.newClient.fieldLabelClientName,
      });
    if (!clientEmail.trim())
      missing.push({ id: 'clientEmail', label: t.newClient.fieldLabelClientEmail });
    if (!eventDateIso)
      missing.push({ id: 'eventDate', label: t.newClient.fieldLabelEventDate });
    if (!clientDisplayName.trim())
      missing.push({ id: 'displayName', label: t.newClient.fieldLabelDisplayName });
    if (!galleryPassword.trim())
      missing.push({ id: 'galleryPassword', label: t.newClient.fieldLabelGalleryPassword });
    if (coverage === 'custom' && !customCoverage.trim())
      missing.push({ id: 'customCoverage', label: t.newClient.fieldLabelCustomCoverage });
    // The two time fields could not be empty while they were seeded with a
    // hardcoded 5 PM to 6 PM, so nothing here ever checked them. A thread
    // that names a start time and no length now leaves End Time blank on
    // purpose, and a blank one that got past this point would print an empty
    // Time row on a contract somebody signs. Only 'specific' is checked
    // because the presets and the custom wording describe the window in
    // their own words and these inputs are not on screen.
    if (coverage === 'specific') {
      if (!eventStartTime) missing.push({ id: 'startTime', label: t.newClient.startTimeLabel });
      if (!eventEndTime) missing.push({ id: 'endTime', label: t.newClient.endTimeLabel });
    }
    if (responsiblePartyEnabled) {
      if (!responsiblePartyName.trim())
        missing.push({ id: 'responsiblePartyName', label: t.newClient.fieldLabelResponsiblePartyName });
      if (!responsiblePartyRelationship.trim())
        missing.push({ id: 'responsiblePartyRelationship', label: t.newClient.fieldLabelResponsiblePartyRelationship });
    }

    // Whatever the chosen type declares as required, read off the spec rather
    // than a list kept in this file. This is what stops a maternity contract
    // going out with no due date: the clause would print "[due_date]" to the
    // client, and nobody re-reads a field that already looks filled in.
    fields.forEach((f) => {
      if (f.required && !(variables[f.key] ?? '').trim()) {
        // labelRu when there is one, because Vero's panel defaults to Russian
        // and this is the error she actually hits: a Russian sentence naming
        // an English field. The wedding fields carry no labelRu yet, so the
        // English label stays the fallback rather than an empty name.
        missing.push({
          id: varFieldId(f.key),
          label: (lang === 'ru' && f.labelRu) || f.label,
        });
      }
    });

    // Amount validation is trickier because it's cross-field (retainer
    // vs total). Do that separately after the "missing fields" check.
    const total = parseFloat(totalAmount);
    const retainer = parseFloat(retainerAmount);
    const totalInvalid = !Number.isFinite(total) || total < 0;
    const retainerInvalid = !Number.isFinite(retainer) || retainer < 0;
    if (totalInvalid) missing.push({ id: 'total', label: t.newClient.fieldLabelTotal });
    if (retainerInvalid) missing.push({ id: 'retainer', label: t.newClient.fieldLabelRetainer });

    if (missing.length > 0) {
      setFieldErrors(new Set(missing.map((m) => m.id)));
      const labels = missing.map((m) => m.label);
      setError(
        labels.length === 1
          ? t.newClient.singleFieldRequired(labels[0])
          : t.newClient.missingFields(labels),
      );
      return;
    }

    if (retainer > total) {
      setFieldErrors(new Set(['retainer']));
      setError(t.newClient.retainerExceedsTotal);
      return;
    }

    // The travel allowance, if she accepted one, goes into the CONTRACT TOTAL
    // rather than into portal_charges. That is a deliberate choice and it is
    // the whole argument for this feature: travel is known at booking time,
    // unlike overtime, which is discovered afterwards. A client who signs for
    // $300 and is charged $50 later has a reasonable complaint. One who signs
    // for $350 does not.
    //
    // Recomputed here from the submitted session total rather than read off
    // the render, so the number posted and the number printed in the TRAVEL
    // clause come from one call.
    const travelAtSubmit = applyTravelDecision(total, travelDecision);
    const contractTotal = travelAtSubmit.contractTotal;

    // Build the variables object the contract template expects. Most
    // keys come from the dynamic `variables` map; we override the ones
    // we've collected explicitly above so the rendered contract sees
    // human-formatted strings.
    //
    // client_names uses FULL LEGAL NAMES (not the auto-display name).
    // For a wedding contract this needs to read like "Chrisann Bryan &
    // Rajiv Thomas" not "Chrisann & Rajiv" — the legal binding is on
    // the full identities, not the shorthand we use in greetings.
    const remaining = contractTotal - retainer;
    // Solo types have no second name to assemble, and the couple case already
    // degrades to a single name when partner 2 is left blank (it stays
    // optional even on a wedding: one person does sign for both).
    const partner2Legal = isCouple ? partner2FullName.trim() : '';
    const legalClientNames = partner2Legal
      ? `${partner1FullName.trim()} & ${partner2Legal}`
      : partner1FullName.trim();
    const eventTimeString = (() => {
      if (coverage === 'half-day') {
        return 'Half-day coverage (approximately 4 hours, exact times to be confirmed)';
      }
      if (coverage === 'full-day') {
        return 'Full-day coverage (exact schedule to be confirmed)';
      }
      if (coverage === 'custom') {
        return customCoverage.trim();
      }
      return formatEventTime(eventStartTime, eventEndTime);
    })();

    // When the booking is sold as half-day or full-day, the EVENT DETAILS
    // Time field gives the short version; we also auto-add a proper
    // acknowledgement clause to ADDITIONAL NOTES so the contract is
    // explicit about what the parties agreed to. Vero's own additional
    // notes (if any) come after, separated by a blank line.
    //
    // Full-day phrasing deliberately doesn't pin an hour count because
    // it's the top-tier package — "major moments of the day from start
    // to finish" gives the same bounding implication (i.e. the contract
    // covers the wedding-day arc, not a 14-hour open-ended request)
    // without numerically capping what's included.
    const tbaClause = (() => {
      if (coverage === 'half-day') {
        return 'At the time of signing, the exact event start and end times are still being finalized. Both parties acknowledge that coverage will be approximately 4 hours, with specific times to be confirmed by the Client in writing (email or text) prior to the event date.';
      }
      if (coverage === 'full-day') {
        return 'At the time of signing, the exact event schedule is still being finalized. This is a full-day coverage booking — the Photographer will be present for the major moments of the Client’s day from start to finish, with the specific schedule to be confirmed by the Client in writing (email or text) prior to the event date.';
      }
      return '';
    })();
    const mergedAdditionalNotes = [tbaClause, additionalNotes.trim()].filter(Boolean).join('\n\n');

    const finalVariables: Record<string, string> = {
      // The type's own forced-on flags go UNDERNEATH everything else, so a
      // family booking carries the minor and illness clauses whether or not
      // anybody went near a checkbox, and an explicit choice still wins.
      ...(spec?.defaultVariables ?? {}),
      ...variables,
      client_names: legalClientNames,
      event_title: eventTitle,
      event_date: fmtDate(eventDateIso),
      event_time: eventTimeString,
      // The travel allowance is inside this figure, which is the point of
      // putting it in the total rather than charging it later.
      total_amount: fmtCurrency(contractTotal),
      retainer_amount: fmtCurrency(retainer),
      remaining_balance: fmtCurrency(remaining),
      additional_notes: mergedAdditionalNotes,
      // Empty on every path but acceptance. The TRAVEL section is gated on
      // both of these keys, so declining, or never being asked, prunes the
      // whole clause away and the contract renders exactly as it would have
      // before this feature existed.
      ...travelAtSubmit.variables,
      // Responsible party — sent always so the substitute step has a
      // value to swap in. Blank when the toggle is off, which causes
      // pruneEmptyOptionalSections to drop the section server-side.
      responsible_party_name: responsiblePartyEnabled ? responsiblePartyName.trim() : '',
      responsible_party_relationship: responsiblePartyEnabled ? responsiblePartyRelationship.trim() : '',
      // Optional service-clause flags: 'yes' includes the section, empty
      // string prunes it. Only the clauses this type offers are sent, so a
      // box ticked before the type was switched cannot ride along into a
      // contract that never showed it.
      ...Object.fromEntries(offeredClauses.map((k) => [k, clauseFlags[k] ? 'yes' : ''])),
      /**
       * The SESSION SCHEDULE section's gate.
       *
       * Empty on a single-place booking, which is what makes the section
       * prune away and the contract render byte for byte as it did before
       * this feature existed. Non-empty only when the day genuinely happens
       * in more than one place, or when she wrote the sentence herself.
       */
      session_schedule: multiPlace || scheduleOverride !== null ? scheduleText : '',
    };
    // For date fields where the user typed an ISO date (e.g. effective_date
    // from the date picker), convert to friendly form for the contract.
    fields.forEach((f) => {
      if (f.type === 'date' && finalVariables[f.key]?.match(/^\d{4}-\d{2}-\d{2}$/)) {
        finalVariables[f.key] = fmtDate(finalVariables[f.key]);
      }
    });

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/portals-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          mode: 'full',
          session_type: sessionType,
          partner_1_first_name: p1First || null,
          partner_2_first_name: p2First || null,
          partner_1_full_name: partner1FullName.trim() || null,
          partner_2_full_name: partner2Legal || null,
          client_display_name: clientDisplayName.trim(),
          client_email: clientEmail.trim().toLowerCase(),
          event_date: eventDateIso,
          contract_template_key: templateKey,
          variables: finalVariables,
          // Session price plus any accepted travel allowance. This is the
          // number every balance on the client screen is derived from, so it
          // has to match total_amount in the rendered contract exactly.
          contract_total_amount: contractTotal,
          contract_retainer_amount: retainer,
          gallery_password: galleryPassword.trim(),
          // Links portal ↔ conversation so the inbox shows the CLIENT badge
          // and Vero can jump between the two.
          link_to_conversation_id: prefill?.conversationId ?? null,
          /**
           * The day-of list, for her own screen rather than the contract.
           *
           * Sent ONLY when the booking is genuinely in more than one place.
           * A single-place booking sends null and the create handler skips
           * the write entirely, so the row it produces is identical to one
           * produced before this existed. The handler mirrors the first
           * address into session_location, which the eight single-address
           * readers keep using unchanged.
           */
          session_locations: multiPlace ? allPlaces : null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCreatedPortalId(data.portal_id ?? null);
        setSendAttempts(1);
        if (data.invite_email_id) {
          // Hold here and poll — the portal exists, but she should not walk
          // away until we know the client actually received the link.
          setInviteEmailId(data.invite_email_id);
        } else {
          // No id means the send threw outright (invite_email_error) or no
          // invite was due. Either way there is nothing to poll.
          if (data.invite_email_error) {
            setError(t.newClient.inviteSendFailed);
          } else {
            onCreated();
          }
        }
      } else {
        setError(data.error || t.newClient.serverErrorStatus(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box maxW="760px" mx="auto" px={{ base: 0, md: 0 }}>
      {/* Back sits WITH the heading, not alone above it.
          AdminBackButton paints nothing (transparent background and border),
          so a Flex whose only child is one meant a small grey chevron hanging
          in white space with 32px of nothing under it. These three screens
          also render no tab strip and no bottom bar, so that chevron was the
          only navigation on the whole page. Same band as the client screen. */}
      <Flex align="flex-start" gap={{ base: 2, md: 3 }} mb={6} pt={1}>
        {/* The button pulls itself 8px left to optically align its chevron;
            the band supplies the padding for that to cancel against. */}
        <Box pl={2} flexShrink={0}>
          <AdminBackButton
            // Leaving unmounts the form and loses everything typed. Harmless
            // when she walked in from the Clients tab and has entered nothing;
            // costly when she got here from a thread and has been filling in a
            // contract, so only that case asks.
            onClick={() => (prefill && !createdPortalId ? setConfirmLeaveOpen(true) : onCancel())}
            label={t.common.back}
          />
        </Box>
        <Box flex="1" minW={0}>
          <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="brand.accent">
            {t.newClient.kicker}
          </Text>
          <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0} mt={0.5}>
            {t.newClient.headline}
          </Text>
        </Box>
      </Flex>

      {prefill && (
        <Box
          ref={panelRef}
          bg="brand.accentSoft"
          border="1px solid"
          borderColor="brand.accentBorder"
          borderRadius="md"
          px={{ base: 4, md: 5 }}
          py={4}
          mb={6}
        >
          <Flex align="baseline" justify="space-between" gap={3} wrap="wrap" mb={3}>
            <Text fontSize="sm" fontWeight="600" color="gray.800">
              {t.newClient.fromConversation(prefill.displayName)}
            </Text>
            {/* Opens the thread over the form instead of navigating to it.
                Leaving to re-read a detail used to unmount this form and lose
                every keystroke, so the safe move was to not check. */}
            <Button
              size="sm"
              variant="link"
              color="brand.accentText"
              fontWeight="500"
              minH="44px"
              leftIcon={<Icon as={FaComments} boxSize={3} />}
              onClick={() => setPeekOpen(true)}
            >
              {t.newClient.viewConversation}
            </Button>
          </Flex>

          {/* Everything the thread established. Two columns on a desktop,
              one on a phone, because these are label/value pairs and a phone
              cannot show two of them side by side without wrapping badly. */}
          {foundRows.length > 0 && (
            <SimpleGrid columns={{ base: 1, md: 2 }} spacingX={6} spacingY={1.5} mb={stillToFill.length ? 4 : 3}>
              {foundRows.map((r) => (
                <Box key={r.label}>
                  <Flex gap={2} align="baseline">
                    <Text fontSize="2xs" color="gray.500" textTransform="uppercase" letterSpacing="0.06em" flexShrink={0}>
                      {r.label}
                    </Text>
                    <Text fontSize="sm" color="gray.800" lineHeight="1.4">
                      {r.value}
                    </Text>
                  </Flex>
                  {/* The two values that cost money to get wrong carry the
                      sentence they came from. Threads renegotiate — one in
                      this inbox holds three different totals — so a figure
                      sitting in a box on its own is not enough to trust. */}
                  {r.quote && (
                    <Text fontSize="2xs" color="gray.500" fontStyle="italic" lineHeight="1.45" mt={0.5}>
                      &ldquo;{r.quote}&rdquo;
                    </Text>
                  )}
                </Box>
              ))}
            </SimpleGrid>
          )}

          {stillToFill.length > 0 && (
            <Box borderTop="1px solid" borderColor="brand.accentBorder" pt={3} mb={3}>
              <Text fontSize="2xs" color="gray.600" textTransform="uppercase" letterSpacing="0.06em" fontWeight="600" mb={1}>
                {t.newClient.stillToFill}
              </Text>
              <Text fontSize="sm" color="gray.800" lineHeight="1.5">
                {stillToFill.join(', ')}
              </Text>
            </Box>
          )}

          <Flex align="center" justify="space-between" gap={3} wrap="wrap">
            <Text fontSize="2xs" color="gray.600" lineHeight="1.5">
              {t.newClient.createEmailsClient}
            </Text>
            {/* Kept small and out of the way. Turning a booking thread into a
                gallery-only portal is rarely what she wants — it is what
                produced a CLIENT badge with no contract behind it — but the
                option still belongs somewhere, and here it keeps the
                conversation link that the Clients tab route cannot. */}
            {onSwitchToGalleryOnly && (
              <Button
                size="xs"
                variant="link"
                color="gray.500"
                fontWeight="400"
                minH="44px"
                onClick={onSwitchToGalleryOnly}
              >
                {t.newClient.galleryOnlyInstead}
              </Button>
            )}
          </Flex>
        </Box>
      )}

      <Box
        as="form"
        onSubmit={handleSubmit}
        bg="white"
        borderRadius="md"
        border="1px solid"
        borderColor="gray.200"
        px={{ base: 5, md: 8 }}
        py={{ base: 6, md: 8 }}
      >
        <VStack align="stretch" spacing={6}>
          {/* ─── Contract type ─── */}
          <SectionHeading>{t.newClient.sectionContract}</SectionHeading>

          <Field
            label={t.newClient.contractTemplateLabel}
            helpText={t.newClient.contractTemplateHelp}
          >
            <Select
              value={templateKey}
              onChange={(e) => handleTemplateChange(e.target.value)}
              size={{ base: 'md', md: 'sm' } as any}
              fontSize={{ base: 'md', md: 'sm' } as any}
              focusBorderColor="brand.accent"
            >
              {CONTRACT_TYPE_ORDER.map((k) => (
                <option key={k} value={k}>
                  {CONTRACT_TEMPLATES[k].name}
                </option>
              ))}
            </Select>
          </Field>

          {/* The one type that describes itself. The label is internal filing
              only. What the client reads is the "What is being photographed"
              field further down, which this type marks required. */}
          {spec?.allowsCustomLabel && (
            <Field label={t.newClient.sessionLabelLabel} helpText={t.newClient.sessionLabelHelp}>
              <FormInput
                value={customSessionLabel}
                onChange={(e) => setCustomSessionLabel(sessionSlug(e.target.value))}
                placeholder={t.newClient.sessionLabelPlaceholder}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
          )}

          {/* ─── Client ─── */}
          <SectionHeading>{t.newClient.sectionClient}</SectionHeading>

          {/* Two names on a wedding or an engagement, one everywhere else.
              A solo booking asking for "Partner 2" was the single loudest
              thing wrong with running a family session through this form. */}
          <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
            <Field
              label={isCouple ? t.newClient.partner1Label : t.newClient.clientNameLabel}
              w={{ base: '100%', md: isCouple ? '50%' : '100%' }}
              required
              helpText={isCouple ? t.newClient.partner1Help : t.newClient.clientNameHelp}
              hasError={fieldErrors.has('partner1')}
            >
              <FormInput value={partner1FullName} onChange={(e) => { setPartner1FullName(e.target.value); clearFieldError('partner1'); }} placeholder={t.newClient.partner1Placeholder} />
            </Field>
            {/* Still not required on a couple type: one person signing for
                both is normal, and every derived value degrades to the one
                name it has. */}
            {isCouple && (
              <Field label={t.newClient.partner2Label} w={{ base: '100%', md: '50%' }} helpText={t.newClient.partner2Help}>
                <FormInput value={partner2FullName} onChange={(e) => setPartner2FullName(e.target.value)} placeholder={t.newClient.partner2Placeholder} />
              </Field>
            )}
          </Stack>

          <Field
            label={t.newClient.displayNameLabel}
            helpText={
              displayNameOverride !== null
                ? t.newClient.displayNameHelpCustom
                : t.newClient.displayNameHelpAuto
            }
            hasError={fieldErrors.has('displayName')}
          >
            <FormInput
              value={clientDisplayName}
              onChange={(e) => { setDisplayNameOverride(e.target.value); clearFieldError('displayName'); }}
              placeholder={t.newClient.displayNamePlaceholder}
            />
          </Field>

          <Field label={t.newClient.clientEmailLabel} required helpText={t.newClient.clientEmailHelp} hasError={fieldErrors.has('clientEmail')}>
            <FormInput type="email" value={clientEmail} onChange={(e) => { setClientEmail(e.target.value); clearFieldError('clientEmail'); }} placeholder={t.newClient.clientEmailPlaceholder} />
          </Field>

          {/* ─── Responsible Party (optional) ───
              When someone other than the partners is paying + signing
              (e.g. mother of the bride). When the toggle is off both
              variables go through as empty strings and the section is
              pruned out of the rendered contract. */}
          <Box pt={3} borderTop="1px solid" borderColor="gray.100">
            <Flex align="center" gap={3}>
              <Checkbox
                isChecked={responsiblePartyEnabled}
                onChange={(e) => setResponsiblePartyEnabled(e.target.checked)}
                colorScheme="yellow"
              >
                <Text fontSize="sm" color="gray.700" fontWeight="400">
                  {t.newClient.responsiblePartyToggle}
                </Text>
              </Checkbox>
            </Flex>
            <Text fontSize="xs" color="gray.500" mt={1} ml={6} fontWeight="300" lineHeight="1.5">
              {t.newClient.responsiblePartyToggleHelp}
            </Text>
            {responsiblePartyEnabled && (
              <VStack align="stretch" spacing={4} mt={4}>
                <Field
                  label={t.newClient.responsiblePartyNameLabel}
                  required
                  helpText={t.newClient.responsiblePartyNameHelp}
                  hasError={fieldErrors.has('responsiblePartyName')}
                >
                  <FormInput
                    value={responsiblePartyName}
                    onChange={(e) => { setResponsiblePartyName(e.target.value); clearFieldError('responsiblePartyName'); }}
                    placeholder={t.newClient.responsiblePartyNamePlaceholder}
                  />
                </Field>
                <Field
                  label={t.newClient.responsiblePartyRelationshipLabel}
                  required
                  helpText={t.newClient.responsiblePartyRelationshipHelp}
                  hasError={fieldErrors.has('responsiblePartyRelationship')}
                >
                  <FormInput
                    value={responsiblePartyRelationship}
                    onChange={(e) => { setResponsiblePartyRelationship(e.target.value); clearFieldError('responsiblePartyRelationship'); }}
                    placeholder={t.newClient.responsiblePartyRelationshipPlaceholder}
                  />
                </Field>
              </VStack>
            )}
          </Box>

          {/* ─── Event ─── */}
          <SectionHeading>{t.newClient.sectionEvent}</SectionHeading>

          <Field
            label={t.newClient.eventTitleLabel}
            helpText={
              eventTitleOverride !== null
                ? t.newClient.eventTitleHelpCustom
                : t.newClient.eventTitleHelpAuto
            }
          >
            <FormInput
              value={eventTitle}
              onChange={(e) => setEventTitleOverride(e.target.value)}
              placeholder={t.newClient.eventTitlePlaceholder}
            />
          </Field>

          <Field label={t.newClient.eventDateLabel} required helpText={t.newClient.eventDateHelp} hasError={fieldErrors.has('eventDate')}>
            <FormInput type="date" value={eventDateIso} onChange={(e) => { setEventDateIso(e.target.value); clearFieldError('eventDate'); }} />
            {/* Native date inputs render in the DEVICE language and cannot be
                told otherwise, so on a Russian-system phone this widget shows
                Russian inside an English panel. The echo is the panel's own
                rendering of the same date, so the authoritative format is
                always on screen. */}
            {eventDateIso && (
              <Text fontSize="2xs" color="gray.500" mt={1}>
                {fmtAdminDate(eventDateIso, lang)}
              </Text>
            )}
          </Field>

          <Field
            label={t.newClient.coverageLabel}
            required
            helpText={spec?.coveragePresets ? t.newClient.coverageHelp : t.newClient.coverageHelpSession}
          >
            <SimpleGrid columns={{ base: 2, md: coverageOptions.length }} spacing={2}>
              {coverageOptions.map((opt) => (
                <Box
                  key={opt.key}
                  as="button"
                  type="button"
                  onClick={() => setCoverage(opt.key)}
                  px={3}
                  py={{ base: 3, md: 1.5 }}
                  minH={{ base: '44px', md: 'auto' }}
                  bg={coverage === opt.key ? 'brand.accent' : 'white'}
                  color={coverage === opt.key ? 'white' : 'gray.700'}
                  border="1px solid"
                  borderColor={coverage === opt.key ? 'brand.accent' : 'gray.300'}
                  borderRadius="sm"
                  fontSize="xs"
                  fontWeight="500"
                  letterSpacing="0.05em"
                  cursor="pointer"
                  _hover={{ borderColor: 'brand.accent' }}
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {opt.label}
                </Box>
              ))}
            </SimpleGrid>
          </Field>

          {coverage === 'specific' && (
            <>
              <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
                <Field label={t.newClient.startTimeLabel} w={{ base: '100%', md: '50%' }} required helpText={t.newClient.startTimeHelp} hasError={fieldErrors.has('startTime')}>
                  <FormInput type="time" value={eventStartTime} onChange={(e) => { setEventStartTime(e.target.value); clearFieldError('startTime'); }} />
                </Field>
                <Field label={t.newClient.endTimeLabel} w={{ base: '100%', md: '50%' }} required helpText={t.newClient.endTimeHelp} hasError={fieldErrors.has('endTime')}>
                  <FormInput type="time" value={eventEndTime} onChange={(e) => { setEventEndTime(e.target.value); clearFieldError('endTime'); }} />
                  {/* Why this time is on screen, whenever the thread is the
                      reason it is. Sits under the input rather than in the
                      help text above it, which describes the field itself and
                      says the same thing on every booking. */}
                  {endTimeNote && (
                    <Text fontSize="2xs" color="gray.500" mt={1} lineHeight="1.5">
                      {endTimeNote}
                    </Text>
                  )}
                </Field>
              </Stack>

              {eventStartTime && eventEndTime && (
                <Box bg="gray.50" border="1px dashed" borderColor="gray.200" borderRadius="sm" px={3} py={2}>
                  <Text fontSize="xs" color="gray.500" mb={0.5}>{t.newClient.onTheContract}</Text>
                  {/* Preview text is the exact English string that will
                      be substituted into the contract, so it stays
                      English regardless of admin UI language. */}
                  <Text fontSize="sm" color="gray.800">{formatEventTime(eventStartTime, eventEndTime)}</Text>
                </Box>
              )}
            </>
          )}

          {(coverage === 'half-day' || coverage === 'full-day') && (
            <Box bg="gray.50" border="1px dashed" borderColor="gray.200" borderRadius="sm" px={3} py={3}>
              <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                {t.newClient.contractTimeSlot}
              </Text>
              {/* Preview bodies below are the exact English strings
                  that will appear on the customer-facing contract, so
                  they stay English regardless of admin UI language. */}
              <Text fontSize="sm" color="gray.800" mb={3}>
                {coverage === 'half-day'
                  ? 'Half-day coverage (approximately 4 hours, exact times to be confirmed)'
                  : 'Full-day coverage (exact schedule to be confirmed)'}
              </Text>
              <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                {t.newClient.contractAdditionalNotesSlot}
              </Text>
              <Text fontSize="xs" color="gray.700" fontStyle="italic" lineHeight="1.6">
                {coverage === 'half-day'
                  ? 'At the time of signing, the exact event start and end times are still being finalized. Both parties acknowledge that coverage will be approximately 4 hours, with specific times to be confirmed by the Client in writing (email or text) prior to the event date.'
                  : 'At the time of signing, the exact event schedule is still being finalized. This is a full-day coverage booking — the Photographer will be present for the major moments of the Client’s day from start to finish, with the specific schedule to be confirmed by the Client in writing (email or text) prior to the event date.'}
              </Text>
              <Box mt={3} pt={3} borderTop="1px solid" borderColor="gray.200">
                <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.400" textTransform="uppercase" letterSpacing="0.15em" mb={1}>
                  {t.newClient.noteForYou}
                </Text>
                <Text fontSize="xs" color="gray.500" fontStyle="italic">
                  {t.newClient.noteForYouBody}
                </Text>
              </Box>
            </Box>
          )}

          {coverage === 'custom' && (
            <Field
              label={t.newClient.customCoverageLabel}
              required
              helpText={t.newClient.customCoverageHelp}
              hasError={fieldErrors.has('customCoverage')}
            >
              <Textarea
                value={customCoverage}
                onChange={(e) => { setCustomCoverage(e.target.value); clearFieldError('customCoverage'); }}
                placeholder={t.newClient.customCoveragePlaceholder}
                rows={2}
                focusBorderColor="brand.accent"
                fontSize={{ base: 'md', md: 'sm' }}
              />
            </Field>
          )}

          {/* The session-type picker used to live here, a second list of
              shoot types sitting under a contract-type dropdown that had just
              asked the same question. They could disagree, and when they did
              the portal was filed as one thing and the contract said another.
              The contract type is now the answer; only Other asks for a word
              of its own, next to the dropdown itself. */}

          {/* ─── Pricing ─── */}
          <SectionHeading>{t.newClient.sectionPricing}</SectionHeading>

          <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start">
            <Field label={t.newClient.totalLabel} w={{ base: '100%', md: '50%' }} required helpText={t.newClient.totalHelp} hasError={fieldErrors.has('total')}>
              <FormInput
                type="number"
                inputMode="decimal"
                value={totalAmount}
                onChange={(e) => { applyTotal(e.target.value); clearFieldError('total'); clearFieldError('retainer'); }}
                placeholder="0"
                step="1"
                min="0"
              />
            </Field>
            <Field label={t.newClient.retainerLabel} w={{ base: '100%', md: '50%' }} required helpText={t.newClient.retainerHelp} hasError={fieldErrors.has('retainer')}>
              <FormInput
                type="number"
                inputMode="decimal"
                value={retainerAmount}
                onChange={(e) => { setRetainerTouched(true); setRetainerAmount(e.target.value); clearFieldError('retainer'); }}
                placeholder="0"
                step="1"
                min="0"
              />
            </Field>
          </Stack>

          {/* ─── Gallery Pass ─── */}
          <SectionHeading>{t.newClient.sectionGalleryPass}</SectionHeading>

          <Field
            label={t.newClient.galleryPasswordLabel}
            helpText={
              galleryPasswordOverride !== null
                ? t.newClient.galleryPasswordHelpCustom
                : t.newClient.galleryPasswordHelpAuto
            }
            hasError={fieldErrors.has('galleryPassword')}
          >
            <FormInput
              value={galleryPassword}
              onChange={(e) => { setGalleryPasswordOverride(e.target.value); clearFieldError('galleryPassword'); }}
              placeholder="ChrisannRajiv2026"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>

          {/* ─── Contract variables ─── */}
          <SectionHeading>{t.newClient.sectionContractDetails}</SectionHeading>
          <Text fontSize="xs" color="gray.500" mt={-3}>
            {t.newClient.contractDetailsIntro}
          </Text>

          {/* session_schedule is written by the places editor below, which
              is attached to the location field the day is actually planned
              around. Left in the generic loop it would render a second,
              empty box asking the same question in prose. */}
          {fields.filter((f) => f.key !== 'session_schedule').map((f) => (
            // The travel block rides directly under the location field rather
            // than living in its own section, because the three inputs are one
            // question: where is it, how far is that, and how long does it
            // take. Splitting them across the form is how you get an address
            // typed once and a distance nobody ever looked up.
            <Box key={f.key} w="100%">
              <FieldRow
                field={f}
                value={variables[f.key] ?? ''}
                hasError={fieldErrors.has(varFieldId(f.key))}
                onChange={(v) => { handleVarChange(f.key, v); clearFieldError(varFieldId(f.key)); }}
              />
              {f.key === 'event_location' && (
                <PlacesBlock
                  t={t}
                  places={extraPlaces}
                  atMax={extraPlaces.length + 1 >= MAX_LOCATIONS}
                  firstAddress={firstPlace.address}
                  firstStart={firstPlace.starts_at}
                  firstEnd={firstPlace.ends_at}
                  schedule={scheduleText}
                  derivedSchedule={derivedSchedule}
                  edited={scheduleOverride !== null}
                  onAdd={addPlace}
                  onSet={setPlace}
                  onRemove={removePlace}
                  onMove={movePlace}
                  onScheduleChange={setScheduleOverride}
                />
              )}
              {f.key === 'event_location' && (
                <TravelBlock
                  copy={tv}
                  address={variables.event_location ?? ''}
                  oneWayMiles={travelMilesOneWay}
                  oneWayMinutes={travelMinutesOneWay}
                  onMilesChange={applyTravelMiles}
                  onMinutesChange={setTravelMinutesOneWay}
                  onLookup={openTravelLookup}
                  lookupBusy={travelLinkBusy}
                  lookupNote={travelLinkNote}
                  quote={travelQuote}
                  status={travelStatus}
                  onAccept={() => { cancelTravelCustom(); setTravelStatus('accepted'); }}
                  onDecline={() => { cancelTravelCustom(); setTravelStatus('declined'); }}
                  onReopen={() => { cancelTravelCustom(); setTravelStatus('none'); }}
                  sessionTotal={totalAmount}
                  application={travelApplication}
                  fee={travelFee}
                  customOpen={travelCustomOpen}
                  customInput={travelCustomInput}
                  onCustomOpen={openTravelCustom}
                  onCustomInput={setTravelCustomInput}
                  onCustomAccept={acceptTravelCustom}
                  onCustomCancel={cancelTravelCustom}
                />
              )}
            </Box>
          ))}

          {/* ─── Optional service clauses ───
              Which boxes appear is the chosen type's business, not this
              file's: the wedding pair is gone from here and lives in the
              wedding spec, alongside the minor, illness and permit clauses
              the session types offer. A type's forced-on clauses are not
              listed here at all, because they are not a choice. */}
          {offeredClauses.length > 0 && (
            <>
              <SectionHeading>{t.newClient.sectionOptionalClauses}</SectionHeading>
              <Text fontSize="xs" color="gray.500" mt={-3} mb={-1} fontWeight="300" lineHeight="1.5">
                {t.newClient.optionalClausesIntro}
              </Text>

              {offeredClauses.map((key, i) => {
                const copy = clauseCopy(key);
                return (
                  <Box key={key} pt={i === 0 ? 2 : 0}>
                    <Checkbox
                      isChecked={Boolean(clauseFlags[key])}
                      onChange={(e) =>
                        setClauseFlags((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                      colorScheme="yellow"
                      alignItems="flex-start"
                    >
                      <Box>
                        <Text fontSize="sm" color="gray.700" fontWeight="500">
                          {copy.label}
                        </Text>
                        <Text fontSize="xs" color="gray.500" fontWeight="300" mt={1} lineHeight="1.5">
                          {copy.help}
                        </Text>
                      </Box>
                    </Checkbox>
                  </Box>
                );
              })}
            </>
          )}

          {/* ─── Additional notes ─── */}
          <SectionHeading>{t.newClient.sectionAdditionalNotes}</SectionHeading>
          <Field
            label={t.newClient.customClausesLabel}
            helpText={t.newClient.customClausesHelp}
          >
            <Textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder={t.newClient.customClausesPlaceholder}
              focusBorderColor="brand.accent"
              rows={4}
              fontSize={{ base: 'md', md: 'sm' }}
            />
          </Field>

          {error && (
            <Text fontSize="sm" color="red.500" fontWeight="400">
              {error}
            </Text>
          )}

          {/* Once the portal exists we stop showing the submit button and show
              the delivery state instead. She has just filled a long form; the
              panel lands where her eyes already are, rather than bouncing her
              to a list that cannot tell her whether the client got the link.
              Precedent: AdminNewGalleryOnly holds on a success screen too. */}
          {inviteEmailId || deliveryStatus !== 'idle' ? (
            <VStack
              spacing={3}
              align="stretch"
              p={4}
              borderRadius="sm"
              bg={
                deliveryStatus === 'delivered'
                  ? 'green.50'
                  : deliveryStatus === 'failed'
                    ? 'red.50'
                    : 'brand.surface'
              }
              border="1px solid"
              borderColor={
                deliveryStatus === 'delivered'
                  ? 'green.200'
                  : deliveryStatus === 'failed'
                    ? 'red.200'
                    : 'brand.accentBorder'
              }
            >
              <Text fontSize="sm" fontWeight="500" color="gray.700">
                {deliveryStatus === 'sending' && t.newClient.inviteSending}
                {deliveryStatus === 'delivered' && t.newClient.inviteDelivered}
                {deliveryStatus === 'pending' && t.newClient.invitePending}
                {deliveryStatus === 'failed' && t.newClient.inviteSendFailed}
              </Text>

              {/* Only claim the portal exists when we actually got an id back.
                  Saying it unconditionally was wrong — Vero hit a bounce, went
                  to the client list, and the client was not there. */}
              {deliveryStatus === 'failed' && createdPortalId && (
                <Text fontSize="xs" color="gray.600">
                  {t.newClient.inviteFailedPortalExists}
                </Text>
              )}

              {(deliveryStatus === 'failed' || deliveryStatus === 'pending') && (
                <>
                  {outOfRetries ? (
                    <Text fontSize="xs" color="red.600">
                      {t.newClient.inviteGiveUp}
                    </Text>
                  ) : (
                    <>
                      <CTAButton
                        variant="outline"
                        size="sm"
                        onClick={handleRetryInvite}
                        isLoading={retrying}
                      >
                        {t.newClient.inviteRetry}
                      </CTAButton>
                      <Text fontSize="xs" color="gray.500">
                        {t.newClient.inviteRetryNote}
                      </Text>
                    </>
                  )}
                  <CTAButton variant="ghost" size="sm" onClick={onCreated}>
                    {t.newClient.inviteSkip}
                  </CTAButton>
                </>
              )}
            </VStack>
          ) : (
            <Box ref={submitRef}>
              <CTAButton
                type="submit"
                variant="solid"
                size="lg"
                fullWidth
                wrapText
                isLoading={submitting}
                loadingText={t.newClient.submitting}
              >
                {t.newClient.submit}
              </CTAButton>
            </Box>
          )}
        </VStack>
      </Box>

      {/* Follows her down the form. Bottom-right because that is where a
          thumb rests on a phone and where a floating action is expected on a
          desktop; the label collapses to the icon alone on narrow screens so
          it never crowds the field it is sitting over. Safe-area inset keeps
          it clear of the iOS home indicator. */}
      {showFloatingPeek && (
        <Button
          onClick={() => setPeekOpen(true)}
          position="fixed"
          zIndex="docked"
          right={{ base: 4, md: 6 }}
          bottom={{
            base: 'max(env(safe-area-inset-bottom), 16px)',
            md: '24px',
          }}
          minH="48px"
          minW="48px"
          px={{ base: 0, md: 4 }}
          borderRadius="full"
          bg="brand.accent"
          color="white"
          boxShadow="0 4px 16px rgba(0,0,0,0.22)"
          _hover={{ bg: 'brand.accentText' }}
          _active={{ bg: 'brand.accentText' }}
          aria-label={t.newClient.viewConversation}
        >
          <Icon as={FaComments} boxSize={4} />
          <Text as="span" ml={2} fontSize="sm" fontWeight="500" display={{ base: 'none', md: 'inline' }}>
            {t.newClient.viewConversation}
          </Text>
        </Button>
      )}

      {prefill && (
        <ConversationPeek
          isOpen={peekOpen}
          onClose={() => setPeekOpen(false)}
          adminPassword={adminPassword}
          conversationId={prefill.conversationId}
          contactName={prefill.displayName}
        />
      )}

      <ConfirmDialog
        isOpen={confirmLeaveOpen}
        title={t.newClient.discardTitle}
        body={t.newClient.discardBody}
        confirmLabel={t.newClient.discardConfirm}
        cancelLabel={t.common.cancel}
        onConfirm={() => {
          setConfirmLeaveOpen(false);
          onCancel();
        }}
        onCancel={() => setConfirmLeaveOpen(false)}
      />
    </Box>
  );
};

/**
 * The travel panel: look it up, type what you read, decide about the fee.
 *
 * PSEUDO OPTIONAL, ALWAYS. Nothing here applies itself. The offer appears, she
 * accepts it or declines it, and declining collapses the panel to a single
 * muted line rather than leaving a question sitting on screen. That is the same
 * philosophy as the overtime clause: it exists to protect her from a bad actor,
 * never to force a charge onto somebody she likes.
 *
 * The percentage beside the dollar figure is the guardrail, and it is now a
 * real one rather than a label. "$65" alone says nothing about whether it is
 * reasonable; "$65, 22% of this session" is a number she can judge without
 * doing arithmetic, and past a quarter of the session it says so out loud. One
 * rule for every job type, because the share already knows the difference
 * between a $300 portrait session and a $2,500 wedding.
 *
 * NOTHING HERE REFUSES A BOOKING ANY MORE. A long haul is ADVICE that sits
 * ABOVE the offer while the offer renders as normal underneath it; the only
 * thing that withholds a number is a pair of figures that cannot both be true,
 * which is a typo and not a policy. The previous version refused to fill
 * anything in above $100 computed and told her to quote a routine two hour
 * wedding by hand, which is the bug this replaced.
 */
function TravelBlock({
  copy,
  address,
  oneWayMiles,
  oneWayMinutes,
  onMilesChange,
  onMinutesChange,
  onLookup,
  lookupBusy,
  lookupNote,
  quote,
  status,
  onAccept,
  onDecline,
  onReopen,
  sessionTotal,
  application,
  fee,
  customOpen,
  customInput,
  onCustomOpen,
  onCustomInput,
  onCustomAccept,
  onCustomCancel,
}: {
  copy: TravelCopy;
  address: string;
  oneWayMiles: string;
  oneWayMinutes: string;
  onMilesChange: (v: string) => void;
  onMinutesChange: (v: string) => void;
  onLookup: () => void;
  lookupBusy: boolean;
  lookupNote: string;
  quote: TravelQuote | null;
  status: TravelStatus;
  onAccept: () => void;
  onDecline: () => void;
  onReopen: () => void;
  /** The raw total input, so the share can be computed against the session. */
  sessionTotal: string;
  application: TravelApplication;
  /** The FINAL amount: her figure when she agreed one, the computed one otherwise. */
  fee: number;
  customOpen: boolean;
  customInput: string;
  onCustomOpen: () => void;
  onCustomInput: (v: string) => void;
  onCustomAccept: () => void;
  onCustomCancel: () => void;
}) {
  const minutes = parseDriveTimeMinutes(oneWayMinutes);
  const sessionTotalNumber = parseFloat(sessionTotal);
  // The share is judged on whatever is actually going on the contract. While
  // the money box is open that is the figure being typed, so the warning moves
  // as she types and an override that pushes past a quarter of the session says
  // so before she accepts it rather than after.
  const typed = parseTravelOverride(customInput);
  const pendingFee = customOpen ? finalTravelFee(quote?.fee ?? 0, typed) : fee;
  const sharePct = quote ? travelShareOfSessionPct(pendingFee, sessionTotalNumber) : null;
  const shareIsHigh = quote ? travelShareIsHigh(pendingFee, sessionTotalNumber) : false;
  const included = formatMiles(TRAVEL_FREE_ROUND_TRIP_MILES);
  // Two decimals on purpose. This is the only place the unrounded figure is
  // shown, and seeing $60.20 become $65 is what makes the rounding a policy
  // she is applying rather than a number the form invented. It matters more at
  // $0.70 a mile than it did at $1.00, because the raw figure is almost never
  // a round number now.
  const rawFeeText = quote ? `$${quote.rawFee.toFixed(2)}` : '';
  /** What the miles produce. Still shown when she is overriding it, never as a nag. */
  const computedFeeText = quote ? formatTravelFee(quote.fee) : '';
  /** What goes on the contract. The accept button and the share both read this. */
  const feeText = quote ? formatTravelFee(pendingFee) : '';

  return (
    <Box
      mt={4}
      p={4}
      bg="brand.surface"
      border="1px solid"
      borderColor="brand.accentBorder"
      borderRadius="sm"
    >
      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb={2}>
        <Text
          fontSize={{ base: 'xs', md: '2xs' }}
          fontWeight="500"
          color="brand.accent"
          letterSpacing={{ base: '0.15em', md: '0.2em' }}
          textTransform="uppercase"
        >
          {copy.heading}
        </Text>
        <CTAButton
          onClick={onLookup}
          variant="outline"
          size="sm"
          isLoading={lookupBusy}
          isDisabled={!address.trim()}
        >
          {copy.lookItUp}
        </CTAButton>
      </Flex>

      <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.5">
        {copy.lookItUpHelp}
      </Text>
      {lookupNote && (
        <Text fontSize="xs" color="orange.700" mt={2} fontWeight="400" lineHeight="1.5">
          {lookupNote}
        </Text>
      )}

      <Stack direction={{ base: 'column', md: 'row' }} spacing={3} align="flex-start" mt={4}>
        <Field label={copy.milesLabel} helpText={copy.milesHelp} w={{ base: '100%', md: '50%' }}>
          <FormInput
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={oneWayMiles}
            onChange={(e) => onMilesChange(e.target.value)}
            placeholder={copy.milesPlaceholder}
          />
        </Field>
        <Field label={copy.minutesLabel} helpText={copy.minutesHelp} w={{ base: '100%', md: '50%' }}>
          {/* TEXT, not number: Maps prints "2 hr 2 min" and she should be able
              to type exactly that rather than converting it to 122 in her head.
              parseDriveTimeMinutes reads Google's wording, the compact forms,
              a clock, or a bare number of minutes. Safe to be lenient here
              because drive time never touches the fee. */}
          <FormInput
            type="text"
            inputMode="text"
            value={oneWayMinutes}
            onChange={(e) => onMinutesChange(e.target.value)}
            placeholder={copy.minutesPlaceholder}
          />
        </Field>
      </Stack>

      {quote && (
        <Box mt={3}>
          <Text fontSize="sm" color="gray.700" fontWeight="400">
            {copy.roundTrip(formatMiles(quote.roundTripMiles))}
          </Text>
          {minutes !== null && (
            <Text fontSize="xs" color="gray.500" fontWeight="300" mt={1}>
              {copy.driveTime(formatDriveTime(minutes), formatDriveTime(minutes * 2))}
            </Text>
          )}
          {!quote.triggered && (
            <Text fontSize="xs" color="gray.500" fontWeight="300" mt={1}>
              {copy.withinRadius(included)}
            </Text>
          )}
        </Box>
      )}

      {/* The only refusal left, and it is about typing rather than policy.
          The two numbers she read off the same screen contradict each other,
          or one of them is past anything anybody drives in a day, so no amount
          is offered: a stray digit in the miles field is the one input error
          that would otherwise land on a contract as a real number. */}
      {quote?.implausible && (
        <Box mt={3} p={3} bg="red.50" border="1px solid" borderColor="red.200" borderRadius="sm">
          <Text fontSize="sm" fontWeight="500" color="red.800" mb={1}>
            {copy.implausibleHeading}
          </Text>
          <Text fontSize="xs" color="red.900" fontWeight="300" lineHeight="1.6">
            {copy.implausibleBody}
          </Text>
        </Box>
      )}

      {/* Three hours each way. ADVICE, sitting ABOVE the offer, which renders
          underneath exactly as it always does. The mileage is real and it is
          hers to accept; what it does not cover is the hotel bed, and a bed is
          the one genuine discontinuity in the cost of a long trip. Refusing to
          fill anything in here was the old behaviour and it was wrong. */}
      {quote?.autofillable && quote.longHaul && status !== 'declined' && (
        <Box mt={3} p={3} bg="yellow.50" border="1px solid" borderColor="yellow.200" borderRadius="sm">
          <Text fontSize="sm" fontWeight="500" color="yellow.800" mb={1}>
            {copy.longHaulHeading}
          </Text>
          <Text fontSize="xs" color="yellow.900" fontWeight="300" lineHeight="1.6">
            {copy.longHaulBody(feeText)}
          </Text>
        </Box>
      )}

      {quote?.autofillable && status === 'none' && (
        <Box mt={3} p={3} bg="white" border="1px solid" borderColor="gray.200" borderRadius="sm">
          <Text fontSize="sm" fontWeight="500" color="gray.800" mb={1}>
            {copy.offerHeading}
          </Text>
          {/* The arithmetic always describes the COMPUTED figure, even while
              she is typing over it. It is the explanation of that number, and
              rewriting its last word to whatever is in the box would turn a
              true sentence into a false one. */}
          <Text fontSize="xs" color="gray.600" fontWeight="300" lineHeight="1.6">
            {copy.offerMath(
              formatMiles(quote.roundTripMiles),
              formatMiles(quote.billableMiles),
              included,
              rawFeeText,
              computedFeeText,
            )}
          </Text>
          <Text fontSize="sm" color="gray.800" fontWeight="500" mt={2}>
            {sharePct !== null ? copy.offerShare(feeText, String(sharePct)) : copy.offerShareNoTotal(feeText)}
          </Text>
          {/* The percentage, promoted from a label into a guardrail. One rule
              for every job type: the share is already what knows that $200 is
              two thirds of a portrait session and eight percent of a wedding,
              so there is no second rate card to maintain. */}
          {shareIsHigh && sharePct !== null && (
            <Text fontSize="xs" color="orange.800" fontWeight="400" mt={2} lineHeight="1.6">
              {copy.shareWarn(feeText, String(sharePct), String(TRAVEL_SHARE_WARN_PCT))}
            </Text>
          )}
          {/* THE OVERRIDE, and the reason it is a link rather than a third
              button. The computed figure is right almost every time, so the
              common case has to stay one tap on a solid button; a third button
              beside the other two would turn a settled question into a choice
              of three. Shut, this costs one line of small text. Open, it is a
              money box already holding the computed figure, so agreeing with
              the arithmetic after looking at it is still one tap. */}
          {!customOpen && (
            <>
              {/* column-reverse on mobile keeps the money action off the top of
                  the tap zone, the same way the delivery confirmations do. */}
              <Stack direction={{ base: 'column-reverse', md: 'row' }} spacing={2} mt={3}>
                <CTAButton onClick={onDecline} variant="ghost" size="sm">
                  {copy.decline}
                </CTAButton>
                <CTAButton onClick={onAccept} variant="solid" size="sm" wrapText>
                  {copy.accept(feeText)}
                </CTAButton>
              </Stack>
              <TravelCustomLink label={copy.useCustom} onClick={onCustomOpen} />
            </>
          )}

          {customOpen && (
            <Box mt={3}>
              <Field label={copy.customLabel} helpText={copy.customHelp}>
                <FormInput
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="1"
                  value={customInput}
                  onChange={(e) => onCustomInput(e.target.value)}
                  placeholder={computedFeeText.replace('$', '')}
                />
              </Field>
              {/* Which figure she is replacing, stated once and flatly. It is
                  not a warning and it is not repeated anywhere she has not
                  opened this box herself. */}
              <Text fontSize="xs" color="gray.500" fontWeight="300" mt={2}>
                {copy.customComputedWas(computedFeeText)}
              </Text>
              {typed === null && customInput.trim() !== '' && (
                <Text fontSize="xs" color="orange.800" fontWeight="400" mt={2} lineHeight="1.6">
                  {copy.customInvalid}
                </Text>
              )}
              <Stack direction={{ base: 'column-reverse', md: 'row' }} spacing={2} mt={3}>
                <CTAButton onClick={onCustomCancel} variant="ghost" size="sm" wrapText>
                  {copy.useComputedInstead(computedFeeText)}
                </CTAButton>
                <CTAButton
                  onClick={onCustomAccept}
                  variant="solid"
                  size="sm"
                  wrapText
                  isDisabled={typed === null}
                >
                  {copy.accept(feeText)}
                </CTAButton>
              </Stack>
            </Box>
          )}
        </Box>
      )}

      {quote?.autofillable && status === 'accepted' && application.lineItem && (
        <Box mt={3} p={3} bg="green.50" border="1px solid" borderColor="green.200" borderRadius="sm">
          <Flex justify="space-between" align="flex-start" gap={3} wrap="wrap">
            <Box flex="1 1 auto" minW="0">
              <Text fontSize="sm" fontWeight="500" color="green.800">
                {copy.acceptedHeading}
              </Text>
              {/* WHICH CLAUSE IS IN FORCE, said out loud. The two contracts
                  read differently, so the screen that produced them has to say
                  which one this booking is getting rather than leaving it to be
                  discovered in the PDF. */}
              <Text fontSize="xs" color="green.900" fontWeight="300" mt={1} lineHeight="1.6">
                {application.lineItem.custom
                  ? copy.acceptedCustomLine(application.lineItem.amount, application.lineItem.roundTripMiles)
                  : copy.acceptedLine(application.lineItem.amount, application.lineItem.roundTripMiles)}
              </Text>
              {/* What she gave up, or took on top. One muted line, stated once,
                  with no colour and no verb telling her to reconsider. */}
              {application.lineItem.custom && (
                <Text fontSize="xs" color="gray.600" fontWeight="300" mt={1}>
                  {copy.acceptedCustomComputed(computedFeeText)}
                </Text>
              )}
              {shareIsHigh && sharePct !== null && (
                <Text fontSize="xs" color="orange.800" fontWeight="400" mt={2} lineHeight="1.6">
                  {copy.shareWarn(feeText, String(sharePct), String(TRAVEL_SHARE_WARN_PCT))}
                </Text>
              )}
              {Number.isFinite(sessionTotalNumber) && (
                <Text fontSize="xs" color="green.900" fontWeight="400" mt={2}>
                  {copy.totals(
                    fmtCurrency(sessionTotalNumber),
                    application.lineItem.amount,
                    fmtCurrency(application.contractTotal),
                  )}
                </Text>
              )}
            </Box>
            {/* Remove, and beside it the way back into the amount. Editing a
                figure she typed thirty seconds ago should not cost her three
                taps through a decline and a re-offer. */}
            <Stack direction="column" align="flex-end" spacing={1}>
              <CTAButton onClick={onDecline} variant="ghost" size="sm">
                {copy.remove}
              </CTAButton>
              <TravelCustomLink label={copy.useCustom} onClick={onCustomOpen} mt={0} />
            </Stack>
          </Flex>
        </Box>
      )}

      {/* Declined is a real answer, not "not yet". One muted line and a way
          back, so the form never asks the same question twice. */}
      {quote?.autofillable && status === 'declined' && (
        <Flex mt={3} align="center" gap={3} wrap="wrap">
          <Text fontSize="xs" color="gray.500" fontWeight="300">
            {copy.declinedLine}
          </Text>
          <Box
            as="button"
            type="button"
            onClick={onReopen}
            fontSize="xs"
            color="brand.accent"
            bg="transparent"
            border="none"
            p={0}
            textDecoration="underline"
            cursor="pointer"
          >
            {copy.offerAgain}
          </Box>
        </Flex>
      )}
    </Box>
  );
}

/**
 * The override affordance: one underlined line of small text, never a button.
 *
 * It is the same treatment the "offer it again" link already uses, and it is
 * deliberately quieter than the two CTAButtons above it. A third solid button
 * would turn a settled question with an obvious answer into a choice of three.
 */
function TravelCustomLink({
  label,
  onClick,
  mt = 3,
}: {
  label: string;
  onClick: () => void;
  /** On-scale only. Chakra turns an off-scale number into literal pixels. */
  mt?: number;
}) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      mt={mt}
      fontSize="xs"
      color="brand.accent"
      bg="transparent"
      border="none"
      p={0}
      textDecoration="underline"
      cursor="pointer"
    >
      {label}
    </Box>
  );
}

/**
 * More than one place, on the New Client form.
 *
 * COLLAPSED TO ONE BUTTON until she presses it. A booking in one place is
 * almost all of them, and a screen that asks every booking to justify being
 * in one place is worse for the common case than it is better for the rare
 * one. Pressing it adds a row; removing the last row puts the button back.
 *
 * The FIRST place is shown but not editable here. It is the location and
 * time fields directly above, and the travel fee is measured to it, so
 * giving it a second set of inputs would let this screen hold two different
 * answers to where the shoot starts. Shown rather than hidden because the
 * order is the point: she is reading a schedule, and a schedule missing its
 * first line reads as if the day starts at 6:30.
 */
function PlacesBlock({
  t,
  places,
  atMax,
  firstAddress,
  firstStart,
  firstEnd,
  schedule,
  derivedSchedule,
  edited,
  onAdd,
  onSet,
  onRemove,
  onMove,
  onScheduleChange,
}: {
  t: ReturnType<typeof useAdminLang>['t'];
  places: SessionLocation[];
  atMax: boolean;
  firstAddress: string;
  firstStart: string;
  firstEnd: string;
  schedule: string;
  derivedSchedule: string;
  edited: boolean;
  onAdd: () => void;
  onSet: (i: number, key: keyof SessionLocation, v: string) => void;
  onRemove: (i: number) => void;
  onMove: (i: number, by: number) => void;
  onScheduleChange: (v: string | null) => void;
}) {
  // Grows to fit whatever it holds, at whatever width it is being read at.
  //
  // Re-measured on resize as well as on content, because how many visual
  // lines a place takes is a function of the WIDTH, not of the text: the
  // same two places are two lines on a laptop and five on a phone. Measuring
  // once would fit the width it happened to mount at and clip after a
  // rotation.
  const scheduleRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const fit = () => {
      const el = scheduleRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [schedule, places.length]);

  if (places.length === 0) {
    return (
      <Button
        mt={3}
        size="sm"
        variant="outline"
        fontWeight="400"
        borderColor="gray.300"
        color="gray.600"
        _hover={{ borderColor: 'brand.accent', color: 'brand.accent' }}
        onClick={onAdd}
      >
        {t.newClient.addPlaceButton}
      </Button>
    );
  }

  const when = firstStart && firstEnd ? `${firstStart} to ${firstEnd}` : firstStart || firstEnd;

  return (
    <Box mt={4} p={{ base: 3, md: 4 }} bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="sm">
      <Text fontSize="2xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500" mb={1}>
        {t.newClient.placesTitle}
      </Text>
      <Text fontSize="xs" color="gray.500" fontWeight="300" mb={4} lineHeight="1.6">
        {t.newClient.placesIntro}
      </Text>

      <VStack align="stretch" spacing={3}>
        {/* Place one, read-only, so the schedule reads in order */}
        <Flex
          align="flex-start" gap={3} bg="white" border="1px solid" borderColor="gray.200"
          borderRadius="sm" px={3} py={2.5}
        >
          <Text fontSize="sm" fontWeight="500" color="gray.400" w="18px" flexShrink={0} lineHeight="1.6">1</Text>
          <Box minW={0} flex="1">
            <Text fontSize="2xs" textTransform="uppercase" letterSpacing="0.15em" color="gray.400" mb={0.5}>
              {t.newClient.placeFirstIs}
            </Text>
            <Text fontSize="sm" color={firstAddress ? 'gray.800' : 'gray.400'} fontWeight="400" wordBreak="break-word">
              {firstAddress || t.newClient.placeAddressPlaceholder}
              {when ? `, ${when}` : ''}
            </Text>
            <Text fontSize="xs" color="gray.500" fontWeight="300" mt={1} lineHeight="1.5">
              {t.newClient.placeFirstNote}
            </Text>
          </Box>
        </Flex>

        {places.map((row, i) => (
          <Box key={i} bg="white" border="1px solid" borderColor="gray.200" borderRadius="sm" px={3} py={2.5}>
            <Flex align="center" gap={2} mb={2}>
              <Text fontSize="sm" fontWeight="500" color="gray.400" w="18px" flexShrink={0}>{i + 2}</Text>
              <Input
                value={row.label}
                onChange={(e) => onSet(i, 'label', e.target.value)}
                placeholder={t.newClient.placeLabelPlaceholder}
                h="36px" bg="white" border="1px solid" borderColor="gray.300"
                fontSize={{ base: 'md', md: 'sm' }} borderRadius="sm" maxW="220px"
                _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
              />
              <Box flex="1" />
              {/* Real buttons, so the order can be changed from a keyboard */}
              <Button
                size="xs" variant="ghost" color="gray.500" aria-label={t.newClient.placeUpAria}
                isDisabled={i === 0} onClick={() => onMove(i, -1)}
              >
                &uarr;
              </Button>
              <Button
                size="xs" variant="ghost" color="gray.500" aria-label={t.newClient.placeDownAria}
                isDisabled={i === places.length - 1} onClick={() => onMove(i, 1)}
              >
                &darr;
              </Button>
              <Button
                size="xs" variant="ghost" color="red.400" aria-label={t.newClient.placeRemoveAria}
                onClick={() => onRemove(i)}
              >
                &times;
              </Button>
            </Flex>
            <Input
              value={row.address}
              onChange={(e) => onSet(i, 'address', e.target.value)}
              placeholder={t.newClient.placeAddressPlaceholder}
              h="44px" bg="white" border="1px solid" borderColor="gray.300"
              fontSize={{ base: 'md', md: 'sm' }} borderRadius="sm" mb={2}
              _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
            />
            <Stack direction={{ base: 'column', sm: 'row' }} spacing={2}>
              <Input
                value={row.starts_at}
                onChange={(e) => onSet(i, 'starts_at', e.target.value)}
                placeholder={t.newClient.placeFrom}
                aria-label={t.newClient.placeFrom}
                h="44px" bg="white" border="1px solid" borderColor="gray.300"
                fontSize={{ base: 'md', md: 'sm' }} borderRadius="sm"
                _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
              />
              <Input
                value={row.ends_at}
                onChange={(e) => onSet(i, 'ends_at', e.target.value)}
                placeholder={t.newClient.placeTo}
                aria-label={t.newClient.placeTo}
                h="44px" bg="white" border="1px solid" borderColor="gray.300"
                fontSize={{ base: 'md', md: 'sm' }} borderRadius="sm"
                _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
              />
            </Stack>
          </Box>
        ))}
      </VStack>

      {!atMax ? (
        <Button
          mt={3} size="sm" variant="outline" fontWeight="400" borderColor="gray.300" color="gray.600"
          _hover={{ borderColor: 'brand.accent', color: 'brand.accent' }}
          onClick={onAdd}
        >
          {t.newClient.addPlaceButton}
        </Button>
      ) : (
        <Text fontSize="xs" color="gray.500" fontWeight="300" mt={3}>
          {t.newClient.placeMaxReached(MAX_LOCATIONS)}
        </Text>
      )}

      {/* Exactly what the contract will say, before it is written */}
      <Box mt={5} pt={4} borderTop="1px solid" borderColor="gray.200">
        <Text fontSize="2xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="brand.accent" mb={2}>
          {t.newClient.schedulePreviewLabel}
        </Text>
        <Textarea
          ref={scheduleRef}
          value={schedule}
          // null puts it back to following the places. Clearing the box is
          // how you ask for that, so an empty string is read as null rather
          // than as "the contract says nothing".
          onChange={(e) => onScheduleChange(e.target.value.trim() ? e.target.value : null)}
          // Height comes from scrollHeight, not from a rows count. A rows
          // count is a count of LINES, and on a phone each of these lines
          // wraps to two or three, so rows={2} clipped the second place off
          // the bottom of the box on the screen where she is most likely to
          // be reading it back.
          rows={1}
          overflow="hidden"
          resize="none"
          bg="white" border="1px solid" borderColor="gray.300" color="gray.800"
          fontSize={{ base: 'md', md: 'sm' }} borderRadius="sm"
          _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
        />
        <Flex align="center" justify="space-between" gap={3} mt={1.5} wrap="wrap">
          <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.5">
            {t.newClient.schedulePreviewHelp}
          </Text>
          {edited && schedule !== derivedSchedule && (
            <Button size="xs" variant="link" color="brand.accent" fontWeight="400" onClick={() => onScheduleChange(null)}>
              {t.newClient.scheduleResync}
            </Button>
          )}
        </Flex>
      </Box>
    </Box>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  hasError,
}: {
  field: ContractTemplateField;
  value: string;
  onChange: (v: string) => void;
  // Set when this variable is required by the chosen type and came through
  // blank on the last submit. Same red treatment as every other field, so a
  // missing due date is found by looking rather than by reading.
  hasError?: boolean;
}) {
  const { lang } = useAdminLang();
  return (
    <Field label={field.label} helpText={field.helpText} required={field.required} hasError={hasError}>
      {field.type === 'textarea' ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          focusBorderColor="brand.accent"
          rows={3}
          fontSize={{ base: 'md', md: 'sm' }}
        />
      ) : (
        <FormInput
          type={
            field.type === 'date'
              ? 'date'
              : field.type === 'number' || field.type === 'currency'
                ? 'number'
                : 'text'
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      )}
      {/* Same device-language problem as the event date input above. */}
      {field.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value) && (
        <Text fontSize="2xs" color="gray.500" mt={1}>
          {fmtAdminDate(value, lang)}
        </Text>
      )}
    </Field>
  );
}

const Field = ({
  label,
  helpText,
  children,
  w,
  required,
  hasError,
}: {
  label: string;
  helpText?: string;
  children: React.ReactNode;
  // Accepts either a plain width string or a responsive object so callers
  // can stack two-column layouts on mobile (`{ base: '100%', md: '50%' }`).
  w?: string | { base?: string; md?: string; lg?: string };
  // Surfaces a red dot next to the label — for fields that don't have
  // a sensible auto-fill, so Vero can scan the form and spot what's
  // still missing before submitting.
  required?: boolean;
  // Turns the label red and wraps the children with a red glow when
  // this specific field failed validation on the last submit attempt.
  // Complements the summary error message so Vero can spot the exact
  // fields to fix at a glance instead of hunting through the form.
  hasError?: boolean;
}) => (
  <Box w={w ?? '100%'}>
    <Text
      as="label"
      display="inline-flex"
      alignItems="center"
      gap={1.5}
      fontSize={{ base: 'xs', md: '2xs' }}
      fontWeight="500"
      color={hasError ? 'red.500' : 'brand.accent'}
      letterSpacing={{ base: '0.15em', md: '0.2em' }}
      textTransform="uppercase"
      mb={2}
    >
      {label}
      {required && (
        <Box
          w="6px"
          h="6px"
          borderRadius="full"
          bg={hasError ? 'red.500' : 'red.400'}
        />
      )}
    </Text>
    <Box
      // Red glow around the input(s) when there's an error. Uses
      // box-shadow so it doesn't push around whatever layout the
      // caller has set on the children.
      sx={
        hasError
          ? {
              borderRadius: '4px',
              boxShadow: '0 0 0 2px rgba(229, 62, 62, 0.35)',
              transition: 'box-shadow 0.2s',
            }
          : undefined
      }
    >
      {children}
    </Box>
    {helpText && (
      <Text
        fontSize="xs"
        color={hasError ? 'red.500' : 'gray.500'}
        mt={1.5}
        fontWeight="300"
        lineHeight="1.5"
      >
        {helpText}
      </Text>
    )}
  </Box>
);

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <Box pt={3} pb={1} borderTop="1px solid" borderColor="gray.100">
    <Text fontSize="xs" fontWeight="500" letterSpacing="0.2em" textTransform="uppercase" color="gray.500">
      {children}
    </Text>
  </Box>
);

// Omit `size` because HTMLInputElement's numeric `size` collides with
// Chakra's string-union `size` ('sm' | 'md' | 'lg' | 'xs').
const FormInput = (props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>) => (
  <Input
    {...props}
    h="44px"
    bg="white"
    border="1px solid"
    borderColor="gray.300"
    color="gray.800"
    // Mobile bump to `md` (16px) prevents iOS Safari from zooming the
    // viewport when the input is focused. Desktop keeps `sm` for the
    // compact form feel.
    fontSize={{ base: 'md', md: 'sm' }}
    borderRadius="sm"
    _hover={{ borderColor: 'gray.400' }}
    _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
  />
);

export default AdminNewClient;
