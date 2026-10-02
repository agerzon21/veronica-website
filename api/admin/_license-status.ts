/**
 * The PA sales tax licence: its number, when it was issued, when it expires.
 *
 * WHY THIS EXISTS
 * Photography is taxable in Pennsylvania whether the photographs are handed
 * over on a disk or a download link (61 Pa. Code 32.37), so selling shoots to
 * PA clients requires a Sales, Use and Hotel Occupancy Tax licence. It is
 * free, and it lapses every five years, which is exactly the interval that
 * guarantees nobody remembers it. Five years from now the licence number will
 * be in an email nobody can find, in an inbox that may not exist.
 *
 * So it is tracked the same way the Instagram token is, and for the same
 * reason: a thing with an expiry date that nothing else in the system will
 * warn you about. Stored in system_state rather than its own table because it
 * is one row that will never be two, and that table already exists for
 * precisely this kind of fact.
 *
 * The renewal is automatic and free PROVIDED there are no unfiled returns or
 * outstanding tax, which is the detail worth surfacing: the licence does not
 * lapse because you forgot to renew it, it lapses because you forgot to file.
 *
 * POST { password }                     → read
 * POST { password, action: 'save', ... } → write
 *
 * Read accepts admin or super. Writing is super only: this is a legal
 * registration, not a preference.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';
import { getDb } from '../_db.js';
import { easternToday } from '../../src/data/tax-calendar.js';

const KEY = 'sales_tax_license';

/** A PA licence runs five years from issue. */
const LICENSE_YEARS = 5;
/** Amber once the renewal is within this window. */
const AGING_DAYS = 180;
/** Red inside this window, or already expired. */
const OVERDUE_DAYS = 45;

interface LicenseRecord {
  /**
   * The LAST FOUR DIGITS only, never the whole number.
   *
   * A PA licence number is not really a secret: it is printed on the
   * certificate, that certificate has to be displayed at the place of
   * business, and the Department runs a public verification lookup. But it is
   * also not needed here. The card exists to answer "is this current and when
   * is the next return due", and four digits is enough to confirm you are
   * looking at the right licence. Storing the whole thing would add a small
   * amount of risk for no benefit at all, so it is truncated on the way in and
   * the full number never reaches the database.
   */
  numberLast4: string;
  /** ISO date it was issued. */
  issuedAt: string;
  /** ISO date it expires. Derived on save, stored so a rule change cannot silently move it. */
  expiresAt: string;
  /** 'PA'. Held explicitly so a second state is an added row, not a rewrite. */
  state: string;
  /** Free text: the myPATH login it lives under, whether a VDA preceded it. */
  note?: string;
  /**
   * The most recent quarter whose return has been filed, as 'YYYY-Qn'.
   *
   * PA has no annual option and puts every new business on quarterly for its
   * first year, so this is a recurring obligation with a fixed calendar and
   * nothing else in the system that would mention it. Same idea as marking the
   * Instagram token refreshed: one field, updated by hand, from which the next
   * deadline is derived.
   */
  lastFiledPeriod?: string;
}

/**
 * Quarterly, on PA's calendar rather than the business's.
 *
 * Quarters are fixed: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec, each due on the
 * 20th of the month after it closes. They do not run from whenever you
 * registered, which is the assumption worth heading off: registering in
 * October does not give you until January for work done in August.
 */
function quarterOf(d: Date): { period: string; dueDate: string } {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  // Q4 is due on 20 January of the following year.
  const dueYear = q === 4 ? y + 1 : y;
  const dueMonth = q === 4 ? 1 : q * 3 + 1;
  return {
    period: `${y}-Q${q}`,
    dueDate: `${dueYear}-${String(dueMonth).padStart(2, '0')}-20`,
  };
}

/** The quarter after the one given, as 'YYYY-Qn'. */
function nextPeriod(period: string): string {
  const [ys, qs] = period.split('-Q');
  const y = Number(ys);
  const q = Number(qs);
  return q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`;
}

function dueDateFor(period: string): string {
  const [ys, qs] = period.split('-Q');
  const y = Number(ys);
  const q = Number(qs);
  const dueYear = q === 4 ? y + 1 : y;
  const dueMonth = q === 4 ? 1 : q * 3 + 1;
  return `${dueYear}-${String(dueMonth).padStart(2, '0')}-20`;
}

/** The last day of a quarter, 'YYYY-MM-DD'. */
function periodEnd(period: string): string {
  const [ys, qs] = period.split('-Q');
  const y = Number(ys);
  const month = Number(qs) * 3;
  const last = new Date(Date.UTC(y, month, 0)).getUTCDate();
  return `${y}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

const PERIOD = /^\d{4}-Q[1-4]$/;

/**
 * A return can only be filed once its quarter has ended, so a quarter still
 * running cannot be marked filed. Marking one early would also silence its
 * reminder emails on the Taxes page, which is the failure they exist for.
 */
function hasEnded(period: string): boolean {
  return periodEnd(period) < easternToday();
}

function addYears(iso: string, years: number): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const sql = getDb();
  const action = typeof req.body?.action === 'string' ? req.body.action.trim() : 'read';

  try {
    if (action === 'save') {
      // A legal registration, so writing is super only. Reading is not: Vero
      // may legitimately need to read the number off to a venue or an accountant.
      if (auth.level !== 'super') {
        return res.status(403).json({ success: false, error: 'Super admin only' });
      }
      const [prior] = (await sql`
        select value from system_state where key = ${KEY} limit 1
      `) as Array<{ value: string | null }>;
      let existing: LicenseRecord | null = null;
      try {
        existing = prior?.value ? (JSON.parse(prior.value) as LicenseRecord) : null;
      } catch {
        existing = null;
      }
      const number = String(req.body?.number ?? '').trim();
      const issuedAt = String(req.body?.issued_at ?? '').trim();
      // Truncated HERE, on the way in, so the full number never reaches the
      // database even once. Digits only, because people paste it with dashes.
      // Left empty, the saved number stays: only its last four digits exist,
      // so the form cannot show it, and retyping it to fix a date is a trap.
      const digits = number.replace(/\D/g, '');
      const numberLast4 = digits ? digits.slice(-4) : existing?.numberLast4 ?? '';
      if (!numberLast4) return res.status(400).json({ success: false, error: 'Licence number required' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedAt)) {
        return res.status(400).json({ success: false, error: 'issued_at must be YYYY-MM-DD' });
      }
      // The last return filed is on the form, for a licence that already has
      // returns behind it. A save that does not send it keeps what was there:
      // before, every save wiped it, and every filed quarter went back to
      // looking unfiled.
      let lastFiledPeriod = existing?.lastFiledPeriod;
      if (req.body && 'last_filed_period' in req.body) {
        const p = String(req.body.last_filed_period ?? '').trim();
        if (p && (!PERIOD.test(p) || !hasEnded(p))) {
          return res.status(400).json({ success: false, error: 'The last return filed must be a quarter that has ended, like 2026-Q3' });
        }
        lastFiledPeriod = p || undefined;
      }
      // Expiry is derived rather than typed, because a five-year date is
      // exactly the arithmetic a tired person gets wrong, and an expiry that
      // is wrong in the optimistic direction is the one that bites.
      const record: LicenseRecord = {
        numberLast4,
        issuedAt,
        expiresAt: String(req.body?.expires_at ?? '').trim() || addYears(issuedAt, LICENSE_YEARS),
        state: String(req.body?.state ?? 'PA').trim().toUpperCase(),
        note: String(req.body?.note ?? '').trim() || undefined,
        lastFiledPeriod,
      };
      await sql`
        insert into system_state (key, value, updated_at)
        values (${KEY}, ${JSON.stringify(record)}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `;
      return res.status(200).json({ success: true, ...describe(record) });
    }

    if (action === 'mark-filed') {
      if (auth.level !== 'super') {
        return res.status(403).json({ success: false, error: 'Super admin only' });
      }
      const period = String(req.body?.period ?? '').trim();
      if (!PERIOD.test(period)) {
        return res.status(400).json({ success: false, error: 'period must look like 2026-Q3' });
      }
      if (!hasEnded(period)) {
        return res.status(400).json({ success: false, error: `${period} has not ended yet, so it cannot have been filed` });
      }
      const [existing] = (await sql`
        select value from system_state where key = ${KEY} limit 1
      `) as Array<{ value: string | null }>;
      if (!existing?.value) {
        return res.status(400).json({ success: false, error: 'Record the licence first' });
      }
      const record = JSON.parse(existing.value) as LicenseRecord;
      record.lastFiledPeriod = period;
      await sql`
        update system_state set value = ${JSON.stringify(record)}, updated_at = now()
        where key = ${KEY}
      `;
      return res.status(200).json({ success: true, ...describe(record) });
    }

    const [row] = (await sql`
      select value, updated_at from system_state where key = ${KEY} limit 1
    `) as Array<{ value: string | null; updated_at: string }>;

    if (!row?.value) {
      return res.status(200).json({
        success: true,
        status: 'unknown',
        license: null,
        message:
          'No PA sales tax licence recorded. Photography is taxable in Pennsylvania, so selling to PA clients needs one.',
      });
    }

    return res.status(200).json({
      success: true,
      ...describe(JSON.parse(row.value) as LicenseRecord),
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('[admin/license-status] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * Same status vocabulary the Instagram token uses, so one glance at the
 * integrations screen reads the same way for both.
 */
function describe(record: LicenseRecord) {
  const now = Date.now();
  const expires = new Date(`${record.expiresAt}T00:00:00Z`).getTime();
  const daysUntilExpiry = Math.floor((expires - now) / 86_400_000);
  const status =
    daysUntilExpiry < 0
      ? 'expired'
      : daysUntilExpiry <= OVERDUE_DAYS
        ? 'overdue'
        : daysUntilExpiry <= AGING_DAYS
          ? 'aging'
          : 'fresh';
  /**
   * The next return owed. If nothing has been filed we do not guess a start
   * point, we simply report the quarter we are in: a business that has never
   * filed has back periods to sort out, and a confident "next due" would
   * paper over exactly the thing it should be surfacing.
   */
  // Scranton's date: from 8 PM Eastern on the last day of a quarter, UTC is
  // already in the next one.
  const current = quarterOf(new Date(`${easternToday()}T12:00:00Z`));
  const due = record.lastFiledPeriod ? nextPeriod(record.lastFiledPeriod) : current.period;
  const dueDate = dueDateFor(due);
  const daysUntilFiling = Math.floor(
    (new Date(`${dueDate}T00:00:00Z`).getTime() - now) / 86_400_000,
  );
  const filing = {
    lastFiled: record.lastFiledPeriod ?? null,
    nextPeriod: due,
    nextDueDate: dueDate,
    // Whether the next return's quarter is over, so it can be marked filed.
    nextPeriodEnds: periodEnd(due),
    nextPeriodEnded: hasEnded(due),
    daysUntilFiling,
    // Overdue means the deadline has passed. 'due' means the quarter has
    // closed and the clock is running. 'open' means it has not closed yet.
    state: daysUntilFiling < 0 ? 'overdue' : daysUntilFiling <= 30 ? 'due' : 'open',
  };

  return { status, daysUntilExpiry, filing, license: record };
}
