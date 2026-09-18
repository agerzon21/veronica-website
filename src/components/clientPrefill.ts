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

import { CONTRACT_TEMPLATES, CONTRACT_TYPE_ORDER } from '../data/contract-template';

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
}

export interface ClientPrefill extends PrefillBooking {
  conversationId: string;
  /** Platform display name, used only as a last-resort label. */
  displayName: string;
}

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
  const text = raw.toLowerCase();

  // Each clock reading, with whatever am/pm marker trails it.
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/g;
  const hits: Array<{ h: number; m: number; mer: string | null }> = [];
  for (const m of text.matchAll(re)) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (!Number.isFinite(h) || h > 23 || min > 59) continue;
    hits.push({ h, m: min, mer: m[3] ? m[3][0] : null });
  }
  if (hits.length < 2) return { start: null, end: null };

  const [a, b] = hits;
  // "3 to 6 pm" — the marker on the second reading governs both.
  const merA = a.mer ?? b.mer;
  const merB = b.mer ?? a.mer;

  const to24 = (h: number, mer: string | null): number | null => {
    if (!mer) return h <= 23 ? h : null;
    if (h < 1 || h > 12) return null;
    if (mer === 'p') return h === 12 ? 12 : h + 12;
    return h === 12 ? 0 : h;
  };
  const hA = to24(a.h, merA);
  const hB = to24(b.h, merB);
  if (hA === null || hB === null) return { start: null, end: null };

  const fmt = (h: number, m: number) =>
    `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  const start = fmt(hA, a.m);
  const end = fmt(hB, b.m);
  // An end before the start means we misread it. Don't guess.
  if (end <= start) return { start: null, end: null };
  return { start, end };
}

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
