/**
 * Vero's path to the FAA Part 107 Remote Pilot Certificate: the steps, the
 * facts each one records, and the dates that follow from them.
 *
 * Shared by the page (src/components/AdminDroneLicense.tsx) and the server
 * (api/admin/_drone-license.ts). The server accepts only the steps and fields
 * named here, so this list is also what keeps anything else, a password
 * typed into the wrong box for instance, out of the database. The words on the
 * page live in drone-license-content.ts, which only the page loads.
 *
 * Imports nothing: api/ reaches this file, and an extensionless import here
 * would take down every admin endpoint (scripts/check-api-imports.mjs).
 */

export type DroneFieldKind = 'text' | 'date' | 'number';

export interface DroneFieldDef {
  key: string;
  kind: DroneFieldKind;
  /** Text only. Everything is capped; nothing here is long. */
  maxLength?: number;
}

export const DRONE_STEP_KEYS = [
  'eligibility',
  'ftn',
  'study',
  'book',
  'test',
  'apply',
  'temporary',
  'card',
  'register',
  'fly',
  'recurrent',
] as const;

export type DroneStepKey = (typeof DRONE_STEP_KEYS)[number];

/** Not a step: the trip date at the top of the page, kept in the same record. */
export const DRONE_PLAN_KEY = 'plan';

/**
 * From this day the knowledge test adds chart-image questions (FAA, see the
 * intro in drone-license-content.ts). A test booked on or after it is harder,
 * so the page says so.
 */
export const DRONE_TEST_CHANGES_ON = '2026-10-26';

export const DRONE_FIELDS: Record<DroneStepKey | typeof DRONE_PLAN_KEY, DroneFieldDef[]> = {
  plan: [{ key: 'leaveOn', kind: 'date' }],
  eligibility: [],
  ftn: [
    // The FAA Tracking Number: one letter and seven digits, e.g. C1234567.
    { key: 'ftn', kind: 'text', maxLength: 12 },
    // The IACRA username only, so it can be found again. Never the password.
    { key: 'iacraUsername', kind: 'text', maxLength: 80 },
  ],
  study: [
    { key: 'practiceScore', kind: 'number' },
    { key: 'studyNotes', kind: 'text', maxLength: 500 },
  ],
  book: [
    { key: 'testDate', kind: 'date' },
    { key: 'testTime', kind: 'text', maxLength: 20 },
    { key: 'testCenter', kind: 'text', maxLength: 200 },
    { key: 'bookingRef', kind: 'text', maxLength: 60 },
  ],
  test: [
    { key: 'passedOn', kind: 'date' },
    { key: 'score', kind: 'number' },
    // The 17-digit Exam ID on the test report, which the IACRA application asks for.
    { key: 'examId', kind: 'text', maxLength: 30 },
  ],
  apply: [{ key: 'appliedOn', kind: 'date' }],
  temporary: [
    { key: 'tempIssuedOn', kind: 'date' },
    { key: 'certificateNumber', kind: 'text', maxLength: 30 },
  ],
  card: [{ key: 'cardReceivedOn', kind: 'date' }],
  register: [
    { key: 'droneModel', kind: 'text', maxLength: 80 },
    { key: 'registrationNumber', kind: 'text', maxLength: 30 },
    { key: 'registeredOn', kind: 'date' },
    { key: 'remoteIdSerial', kind: 'text', maxLength: 40 },
  ],
  fly: [],
  recurrent: [{ key: 'trainedOn', kind: 'date' }],
};

export interface DroneStepState {
  done: boolean;
  /** YYYY-MM-DD, set when it was ticked. */
  doneAt: string | null;
  fields: Record<string, string>;
  updatedAt?: string;
  updatedBy?: string;
}

export interface DronePath {
  steps: Partial<Record<DroneStepKey | typeof DRONE_PLAN_KEY, DroneStepState>>;
  updatedAt?: string;
  updatedBy?: string;
}

export function isDroneStepKey(v: unknown): v is DroneStepKey | typeof DRONE_PLAN_KEY {
  return typeof v === 'string' && (v === DRONE_PLAN_KEY || (DRONE_STEP_KEYS as readonly string[]).includes(v));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One step's fields, as the server will store them: only the named keys,
 * trimmed, capped, dates in YYYY-MM-DD, numbers 0 to 100. Anything else is
 * dropped rather than refused, so a stale page cannot fail a whole save over a
 * field that was renamed.
 */
export function cleanDroneFields(step: DroneStepKey | typeof DRONE_PLAN_KEY, raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  for (const f of DRONE_FIELDS[step]) {
    const v = src[f.key];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    if (f.kind === 'date') {
      if (ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))) out[f.key] = s;
    } else if (f.kind === 'number') {
      const n = Number(s.replace(/%$/, ''));
      if (Number.isFinite(n) && n >= 0 && n <= 100) out[f.key] = String(Math.round(n));
    } else {
      out[f.key] = s.slice(0, f.maxLength ?? 200);
    }
  }
  return out;
}

/** YYYY-MM-DD plus whole days, in UTC so no timezone moves the date. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The last day of the calendar month `months` after the one `iso` falls in.
 * The FAA counts currency in calendar months: training on Oct 15, 2026 keeps
 * you current through Oct 31, 2028, not Oct 15.
 */
export function endOfCalendarMonthsAfter(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months + 1, 0));
  return end.toISOString().slice(0, 10);
}

/** Same day, `years` later (Feb 29 falls back to Feb 28). */
export function addYearsIso(iso: string, years: number): string {
  const [y, m, day] = iso.split('-').map(Number);
  const end = new Date(Date.UTC(y + years, m - 1, day));
  if (end.getUTCMonth() !== m - 1) end.setUTCDate(0);
  return end.toISOString().slice(0, 10);
}

/** Whole days from today (UTC) to `iso`; negative once it has passed. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - today) / 86_400_000);
}
