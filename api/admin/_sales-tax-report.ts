/**
 * Admin: Pennsylvania sales tax by calendar quarter, as myPATH asks for it.
 *
 * POST { password }  → 200 { success, quarters: [...] }, newest first
 *
 * Each quarter carries the three numbers a PA sales tax return needs (gross
 * sales, taxable sales, tax) and the payments behind them, so a figure can be
 * checked line by line before it is typed into myPATH.
 *
 * THE RULES, settled with Alex on 2026-10-01 and the same ones the first two
 * returns were worked out by:
 *   - Money received, by when it arrived. A card payment is dated by the
 *     Eastern day the client paid; a manual row was typed as a bare date and
 *     stored at 00:00 UTC, so it is dated by its UTC day (memory note
 *     "sales tax ledger gaps": reading it in Eastern puts it a day early).
 *   - Tips are not sales. Card-fee discount rows are bookkeeping, not money.
 *     Free bookings (migration 048) are not sales.
 *   - Each booking's sales_tax (migration 049) decides the split, through
 *     saleAndTaxOf in src/data/sales-tax.ts: 'added' payments carry their own
 *     tax, 'absorbed' payments owe 6% out of the price, 'exempt' ones count in
 *     gross sales only.
 *   - Refunds are negative payments, so they reduce the quarter they land in.
 *
 * A FLOOR, NOT A RECORD. The ledger holds what was logged. A gallery-only
 * booking can be paid in full with nothing logged, so read these against
 * Vero's own records before filing, as the memory note says.
 *
 * Super admins only, like the rest of Integrations.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin, requireSuper } from '../_admin-auth.js';
import { CARD_FEE_DISCOUNT_METHOD } from '../../src/data/payment-handles.js';
import { saleAndTaxOf, salesTaxModeOf, type SalesTaxMode } from '../../src/data/sales-tax.js';

type Row = {
  amount: string;
  kind: string | null;
  status: string | null;
  source: string | null;
  method: string | null;
  day: string;
  booking: string | null;
  complimentary: boolean | null;
  sales_tax: string | null;
};

export type TaxLine = {
  date: string;
  booking: string;
  amount: number;
  mode: SalesTaxMode;
  sale: number;
  tax: number;
};

export type TaxQuarter = {
  /** "2026-Q3" */
  key: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  /** YYYY-MM-DD, the 20th of the month after the quarter ends. */
  dueDate: string;
  grossSales: number;
  taxableSales: number;
  tax: number;
  lines: TaxLine[];
};

const cents = (d: number) => Math.round(d * 100);

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
    const rows = (await sql`
      select pe.amount::text as amount, pe.kind, pe.status, pe.source, pe.method,
             (case when coalesce(pe.source, 'manual') = 'stripe'
                   then (pe.paid_at at time zone 'America/New_York')::date
                   else (pe.paid_at at time zone 'UTC')::date end)::text as day,
             cp.client_display_name as booking, cp.complimentary, cp.sales_tax
      from payment_entries pe
      join client_portals cp on cp.id = pe.client_portal_id
      order by pe.paid_at, pe.created_at
    `) as Row[];

    const byKey = new Map<string, TaxQuarter & { g: number; t: number; x: number }>();
    for (const r of rows) {
      if ((r.status ?? 'succeeded') !== 'succeeded') continue;
      if ((r.kind ?? 'payment') === 'tip') continue;
      if (r.method === CARD_FEE_DISCOUNT_METHOD) continue;
      if (r.complimentary === true) continue;
      const amount = parseFloat(r.amount);
      if (!Number.isFinite(amount) || amount === 0) continue;

      const [y, m] = r.day.split('-').map(Number);
      const quarter = (Math.floor((m - 1) / 3) + 1) as 1 | 2 | 3 | 4;
      const key = `${y}-Q${quarter}`;
      if (!byKey.has(key)) {
        const dueMonth = quarter * 3 + 1; // the month after the quarter ends
        const dueYear = dueMonth > 12 ? y + 1 : y;
        byKey.set(key, {
          key,
          year: y,
          quarter,
          dueDate: `${dueYear}-${String(((dueMonth - 1) % 12) + 1).padStart(2, '0')}-20`,
          grossSales: 0,
          taxableSales: 0,
          tax: 0,
          lines: [],
          g: 0,
          t: 0,
          x: 0,
        });
      }
      const q = byKey.get(key)!;
      const mode = salesTaxModeOf(r.sales_tax);
      const split = saleAndTaxOf(amount, mode);
      q.g += cents(split.sale);
      if (split.taxable) q.t += cents(split.sale);
      q.x += cents(split.tax);
      q.lines.push({
        date: r.day,
        booking: r.booking ?? '(no name)',
        amount,
        mode,
        sale: split.sale,
        tax: split.tax,
      });
    }

    const quarters: TaxQuarter[] = [...byKey.values()]
      .sort((a, b) => (a.key < b.key ? 1 : -1))
      .map(({ g, t, x, ...q }) => ({ ...q, grossSales: g / 100, taxableSales: t / 100, tax: x / 100 }));

    return res.status(200).json({ success: true, quarters });
  } catch (err) {
    console.error('[admin/sales-tax-report] failed:', err);
    return res.status(500).json({ success: false, error: 'Could not build the sales tax report.' });
  }
}
