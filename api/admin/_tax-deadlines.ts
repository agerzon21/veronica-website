/**
 * Admin: which tax deadlines are done (the Taxes page, src/components/AdminTax.tsx).
 *
 * POST { password }                               → { success, done, lastFiledPeriod }
 * POST { password, action: 'mark', key, done }    → the same, after the change
 *
 * The deadlines themselves are a list in src/data/tax-calendar.ts; this keeps
 * only which of them have been dealt with, keyed by their stable keys, in one
 * system_state row like the sales tax licence. A sales tax return is NOT
 * marked here: the licence card's "Mark filed" already records the last filed
 * quarter, and two ticks for one thing would drift apart. lastFiledPeriod is
 * returned so the page can read those as done.
 *
 * Super admins only: this is Alex's paperwork, like the rest of Taxes.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin, requireSuper } from '../_admin-auth.js';
import { getDb } from '../_db.js';
import { actorName } from '../_money-history.js';
import { TAX_DEADLINES } from '../../src/data/tax-calendar.js';

export const DONE_KEY = 'tax_deadlines_done';

export type DoneMap = Record<string, { at: string; by: string }>;

export async function readTaxState(sql: ReturnType<typeof getDb>): Promise<{ done: DoneMap; lastFiledPeriod: string | null }> {
  const rows = (await sql`
    SELECT key, value FROM system_state WHERE key IN (${DONE_KEY}, 'sales_tax_license')
  `) as Array<{ key: string; value: string | null }>;
  let done: DoneMap = {};
  let lastFiledPeriod: string | null = null;
  for (const r of rows) {
    try {
      if (r.key === DONE_KEY && r.value) done = JSON.parse(r.value) as DoneMap;
      if (r.key === 'sales_tax_license' && r.value) lastFiledPeriod = (JSON.parse(r.value) as { lastFiledPeriod?: string }).lastFiledPeriod ?? null;
    } catch {
      /* a row that will not parse reads as empty */
    }
  }
  return { done, lastFiledPeriod };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });
  const sup = requireSuper(auth.level);
  if (!sup.ok) return res.status(sup.status).json({ success: false, error: sup.error });

  try {
    const sql = getDb();
    if (req.body?.action === 'mark') {
      const key = String(req.body?.key ?? '');
      const deadline = TAX_DEADLINES.find((d) => d.key === key);
      if (!deadline) return res.status(400).json({ success: false, error: 'Unknown deadline' });
      if (deadline.salesPeriod) {
        return res.status(400).json({ success: false, error: 'Sales tax returns are marked filed on the licence card.' });
      }
      if (req.body?.done === true) {
        const entry = { at: new Date().toISOString(), by: await actorName(sql, auth) };
        // One statement: this key is merged into whatever the row holds now.
        await sql`
          INSERT INTO system_state (key, value, updated_at)
          VALUES (${DONE_KEY}, ${JSON.stringify({ [key]: entry })}, NOW())
          ON CONFLICT (key) DO UPDATE SET
            value = (COALESCE(system_state.value::jsonb, '{}'::jsonb) || jsonb_build_object(${key}::text, ${JSON.stringify(entry)}::jsonb))::text,
            updated_at = NOW()
        `;
      } else {
        await sql`
          UPDATE system_state
          SET value = (COALESCE(value::jsonb, '{}'::jsonb) - ${key}::text)::text, updated_at = NOW()
          WHERE key = ${DONE_KEY}
        `;
      }
    }
    return res.status(200).json({ success: true, ...(await readTaxState(sql)) });
  } catch (err) {
    console.error('[admin/tax-deadlines] failed:', err);
    return res.status(500).json({ success: false, error: 'Could not reach the tax deadlines.' });
  }
}
