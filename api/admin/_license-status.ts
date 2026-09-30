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

const KEY = 'sales_tax_license';

/** A PA licence runs five years from issue. */
const LICENSE_YEARS = 5;
/** Amber once the renewal is within this window. */
const AGING_DAYS = 180;
/** Red inside this window, or already expired. */
const OVERDUE_DAYS = 45;

interface LicenseRecord {
  /** The licence number as printed. */
  number: string;
  /** ISO date it was issued. */
  issuedAt: string;
  /** ISO date it expires. Derived on save, stored so a rule change cannot silently move it. */
  expiresAt: string;
  /** 'PA'. Held explicitly so a second state is an added row, not a rewrite. */
  state: string;
  /** Free text: the myPATH login it lives under, whether a VDA preceded it. */
  note?: string;
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
      const number = String(req.body?.number ?? '').trim();
      const issuedAt = String(req.body?.issued_at ?? '').trim();
      if (!number) return res.status(400).json({ success: false, error: 'Licence number required' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedAt)) {
        return res.status(400).json({ success: false, error: 'issued_at must be YYYY-MM-DD' });
      }
      // Expiry is derived rather than typed, because a five-year date is
      // exactly the arithmetic a tired person gets wrong, and an expiry that
      // is wrong in the optimistic direction is the one that bites.
      const record: LicenseRecord = {
        number,
        issuedAt,
        expiresAt: String(req.body?.expires_at ?? '').trim() || addYears(issuedAt, LICENSE_YEARS),
        state: String(req.body?.state ?? 'PA').trim().toUpperCase(),
        note: String(req.body?.note ?? '').trim() || undefined,
      };
      await sql`
        insert into system_state (key, value, updated_at)
        values (${KEY}, ${JSON.stringify(record)}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
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
  return { status, daysUntilExpiry, license: record };
}
