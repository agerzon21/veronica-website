/**
 * Pennsylvania sales tax, as this business charges it. The one place that
 * knows the rule; the server and every screen read it from here.
 *
 * WHY THIS EXISTS. Veronika registered as a PA sales tax vendor on 2026-09-29,
 * and photography delivered in Pennsylvania is taxable at 6% however the photos
 * are handed over. Each booking is one of three kinds (client_portals.sales_tax,
 * migration 049):
 *
 *   added     6% on top of the price. The default for a new booking, and the
 *             tax is stated as its own line on the contract, the portal and
 *             the card checkout.
 *   absorbed  Grandfathered: every booking made before 2026-10-01 keeps the
 *             price it was agreed at. The sale is still taxable, so Vero
 *             remits 6% of what she receives out of it.
 *   exempt    Delivered outside Pennsylvania, so not a PA sale at all.
 *
 * THE TAX IS 6% OF WHAT THE CLIENT ACTUALLY PAYS. The contract price is the
 * card price (payment-handles.ts explains why: a card surcharge is illegal on
 * debit cards, a discount for paying directly is legal everywhere). A client
 * who pays directly is given the card fee off first, as always, and the tax is
 * charged on what remains. On a $500 booking: $530.00 by card, or
 * $485.20 + $29.11 = $514.31 by Zelle, Venmo, Cash App or cash. Taxing the
 * $500 and then discounting would charge a direct payer tax on money they never
 * paid, which is over-collecting tax.
 *
 * ONE RATE. Philadelphia (8%) and Allegheny County (7%) add local tax on work
 * delivered there. Nothing here handles that, and nothing booked so far needs it.
 *
 * All arithmetic is in whole cents, for the reason payment-handles.ts gives:
 * dollars as floats are how 2500 + 256.22 comes out larger than 2756.22.
 */

import { cardPriceFor, cashPrice, earnedDirectDiscount } from './payment-handles.js';

export type SalesTaxMode = 'added' | 'absorbed' | 'exempt';

export const SALES_TAX_MODES: readonly SalesTaxMode[] = ['added', 'absorbed', 'exempt'];

/** The rate, as the whole percent it is stated in. */
export const PA_SALES_TAX_PERCENT = 6;

/** "6%", for copy. */
export const PA_SALES_TAX_LABEL = `${PA_SALES_TAX_PERCENT}%`;

export function isSalesTaxMode(v: unknown): v is SalesTaxMode {
  return typeof v === 'string' && (SALES_TAX_MODES as readonly string[]).includes(v);
}

/**
 * A stored value read back, or the safe reading when there is none. Absent is
 * 'absorbed', never 'added': on a database the migration has not reached, every
 * booking predates the tax, and adding 6% to a price someone already agreed is
 * the one mistake this must not make.
 */
export function salesTaxModeOf(v: unknown): SalesTaxMode {
  return isSalesTaxMode(v) ? v : 'absorbed';
}

const toCents = (dollars: number): number => Math.round(dollars * 100);

/** The tax on a pre-tax amount, rounded half up to the cent. Zero unless 'added'. */
export function salesTaxOn(amount: number, mode: SalesTaxMode): number {
  if (mode !== 'added' || !Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round((toCents(amount) * PA_SALES_TAX_PERCENT) / 100) / 100;
}

/** A pre-tax amount plus its tax, when this booking adds it. */
export function withSalesTax(amount: number, mode: SalesTaxMode): number {
  if (!Number.isFinite(amount)) return 0;
  return (toCents(amount) + toCents(salesTaxOn(amount, mode))) / 100;
}

/**
 * The part of an amount that is not tax. The inverse of withSalesTax, to the
 * cent: what was paid, read back as price plus tax.
 */
export function preTaxOf(amount: number, mode: SalesTaxMode): number {
  if (mode !== 'added' || !Number.isFinite(amount)) return amount;
  return Math.round((toCents(amount) * 100) / (100 + PA_SALES_TAX_PERCENT)) / 100;
}

/**
 * Everything the booking costs, tax included: the contract total plus charges
 * added later (extra time is part of the same taxable sale), plus the tax when
 * this booking adds it. Null when there is no total, which every caller already
 * reads as "nothing to hold anyone to".
 */
export function bookingOwedTotal(
  total: number | null | undefined,
  charges: number | null | undefined,
  mode: SalesTaxMode,
): number | null {
  if (total === null || total === undefined || !Number.isFinite(total)) return null;
  const pre = (toCents(total) + toCents(Number.isFinite(charges as number) ? (charges as number) : 0)) / 100;
  return withSalesTax(pre, mode);
}

/** The retainer as the client pays it, tax included when this booking adds it. */
export function retainerOwed(retainer: number | null | undefined, mode: SalesTaxMode): number | null {
  if (retainer === null || retainer === undefined || !Number.isFinite(retainer)) return null;
  return withSalesTax(retainer, mode);
}

/**
 * What to send by Zelle, Venmo, Cash App or cash instead of paying `cardAmount`
 * by card, where `cardAmount` already includes any tax. The card fee comes off
 * the PRICE and the tax is charged on what is left, so for an 'added' booking
 * $530.00 by card is $514.31 directly, not cashPrice(530) = $514.33.
 */
export function directAmountFor(cardAmount: number, mode: SalesTaxMode): number {
  if (!Number.isFinite(cardAmount) || cardAmount <= 0) return 0;
  if (mode !== 'added') return cashPrice(cardAmount);
  return withSalesTax(cashPrice(preTaxOf(cardAmount, mode)), mode);
}

/**
 * The card fee a booking's direct payments have earned the right to have
 * waived, tax included, net of what was already waived. For an 'added' booking
 * each direct payment is read back as price plus tax, the price is turned into
 * its card equivalent, and the tax goes back on: $514.31 sent by Zelle stands
 * for $530.00 by card and so earns $15.69. Otherwise it is exactly
 * earnedDirectDiscount, because nothing about those bookings changed.
 *
 * NEVER SHORT, SOMETIMES A CENT OR TWO OVER. cardPriceFor rounds up, so about
 * 40% of prices already earn one cent more than the exact difference, with or
 * without tax (cashPrice(56) is $54.08, and cardPriceFor($54.08) is $56.01). A
 * sweep of 170,000 amounts found no case that falls short, which is the only
 * direction that would matter: the waiver is capped at what is still owed, so
 * an extra cent is never paid out and a booking never reads "owes $0.01".
 */
export function earnedDirectDiscountTaxed(
  directPayments: number[],
  alreadyWaived: number,
  mode: SalesTaxMode,
): number {
  if (mode !== 'added') return earnedDirectDiscount(directPayments, alreadyWaived);
  let cents = 0;
  for (const x of directPayments) {
    if (!Number.isFinite(x) || x <= 0) continue;
    const cardEquivalent = withSalesTax(cardPriceFor(preTaxOf(x, mode)), mode);
    cents += toCents(cardEquivalent) - toCents(x);
  }
  return Math.max(cents - toCents(alreadyWaived), 0) / 100;
}

/**
 * One payment, split for the tax return: the sale, and the tax owed on it.
 *
 *   added     the payment carried its own tax: sale = price part, tax = the rest
 *   absorbed  the whole payment is the sale, and 6% of it is owed on top
 *   exempt    not a PA sale; reported in gross sales only
 *
 * A negative payment (a refund) comes back negative, so it reduces both.
 */
export function saleAndTaxOf(
  amount: number,
  mode: SalesTaxMode,
): { sale: number; tax: number; taxable: boolean } {
  if (!Number.isFinite(amount) || amount === 0) return { sale: 0, tax: 0, taxable: mode !== 'exempt' };
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  if (mode === 'added') {
    const sale = preTaxOf(abs, mode);
    return { sale: sign * sale, tax: sign * ((toCents(abs) - toCents(sale)) / 100), taxable: true };
  }
  if (mode === 'absorbed') {
    return { sale: sign * abs, tax: sign * salesTaxOn(abs, 'added'), taxable: true };
  }
  return { sale: sign * abs, tax: 0, taxable: false };
}

/**
 * The contract's tax lines, as template variables. Empty strings unless the
 * booking adds tax, which prunes the PENNSYLVANIA SALES TAX section away so a
 * grandfathered or out-of-state contract renders exactly as it always has.
 *
 * Derived on the server from the columns, never typed: the editor hides these
 * keys, for the reason it hides total_amount (a contract stating one price
 * while checkout charges another).
 */
export function salesTaxContractVariables(
  total: number | null,
  retainer: number | null,
  mode: SalesTaxMode,
  format: (amount: number) => string,
): Record<string, string> {
  if (mode !== 'added' || total === null || !Number.isFinite(total) || total <= 0) {
    return {
      sales_tax_enabled: '',
      sales_tax_percent: '',
      sales_tax_amount: '',
      total_with_tax: '',
      retainer_with_tax: '',
      remaining_with_tax: '',
    };
  }
  const r = retainer !== null && Number.isFinite(retainer) ? Math.min(Math.max(retainer, 0), total) : 0;
  const totalWith = withSalesTax(total, mode);
  const retainerWith = withSalesTax(r, mode);
  return {
    sales_tax_enabled: 'yes',
    sales_tax_percent: PA_SALES_TAX_LABEL,
    sales_tax_amount: format(salesTaxOn(total, mode)),
    total_with_tax: format(totalWith),
    retainer_with_tax: format(retainerWith),
    remaining_with_tax: format((toCents(totalWith) - toCents(retainerWith)) / 100),
  };
}

/** The variable keys above, which the contract editor never offers as text. */
export const SALES_TAX_CONTRACT_KEYS = [
  'sales_tax_enabled',
  'sales_tax_percent',
  'sales_tax_amount',
  'total_with_tax',
  'retainer_with_tax',
  'remaining_with_tax',
] as const;
