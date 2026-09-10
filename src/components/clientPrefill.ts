/**
 * What a conversation knows about a booking, on its way into the new-client form.
 *
 * The summariser already extracts these as typed data (see BookingFields in
 * api/admin/_messages-summary.ts) precisely so this hand-off does not have to
 * re-parse prose. This module is the shared shape plus the small amount of
 * translation the form needs: the summary speaks in the customer's words
 * ("3:00 PM to 6:00 PM"), the form wants <input type="time"> values.
 */

export interface ClientPrefill {
  conversationId: string;
  /** Platform display name, used only as a last-resort label. */
  displayName: string;
  session_type: string | null;
  event_date: string | null;
  event_time: string | null;
  event_location: string | null;
  client_full_name: string | null;
  partner_full_name: string | null;
  client_email: string | null;
  total_amount: string | null;
  retainer_amount: string | null;
  /** Verbatim sentences behind the two values that cost money to get wrong. */
  total_amount_quote: string | null;
  event_date_quote: string | null;
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

/** Session types whose contract names two people. Mirrors the summariser. */
const COUPLE_TYPES = new Set(['wedding', 'engagement', 'elopement', 'anniversary']);
export const isCoupleSession = (t: string | null): boolean => COUPLE_TYPES.has(t ?? '');
