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
 *   absorbed  The agreed price stands, and Vero remits 6% of what she
 *             receives out of it, since the sale is still taxable. Every
 *             booking made before 2026-10-01 (grandfathered), and the
 *             default for a gallery-only booking, which is quoted before it
 *             is entered (Alex, 2026-10-03).
 *   exempt    Delivered outside Pennsylvania, so not a PA sale at all.
 *
 * THE TAX IS 6% OF WHAT THE CLIENT ACTUALLY PAYS. On a 'dual' booking
 * (payment-handles.ts, migration 054), every booking made from 2026-10-05, the
 * amounts are what Vero keeps and a card payment is grossed up from them: a
 * $500 booking is $530.00 by Zelle, Venmo, Cash App or cash, and by card
 * $103.30 + $443.16 = $546.46. The tax return reads each payment back as price
 * plus tax (saleAndTaxOf), so a card sale is taxed on the card price, which is
 * what was charged. On a 'single' booking, every one made before, there is one
 * price whatever the method.
 *
 * ONE RATE. Philadelphia (8%) and Allegheny County (7%) add local tax on work
 * delivered there. Nothing here handles that, and nothing booked so far needs it.
 *
 * All arithmetic is in whole cents, for the reason payment-handles.ts gives:
 * dollars as floats are how 2500 + 256.22 comes out larger than 2756.22.
 */

import {
  cardAmountFor,
  type CardPricing,
} from './payment-handles.js';

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

/**
 * The retainer as the client pays it: the agreed amount, a round number, in
 * every tax mode. On a booking that adds tax, the tax is on the whole sale and
 * the retainer is simply the first part of the total with tax ("the retainer
 * should just be a nice even number", Alex, 2026-10-04). The tax return reads
 * each payment back as price plus tax either way (saleAndTaxOf), so the tax
 * reported over the booking is still exactly 6% of the price.
 */
export function retainerOwed(retainer: number | null | undefined, _mode: SalesTaxMode): number | null {
  if (retainer === null || retainer === undefined || !Number.isFinite(retainer)) return null;
  return retainer;
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
  // The retainer carries no tax of its own (retainerOwed); the key keeps its
  // old name so contracts already on file keep rendering.
  return {
    sales_tax_enabled: 'yes',
    sales_tax_percent: PA_SALES_TAX_LABEL,
    sales_tax_amount: format(salesTaxOn(total, mode)),
    total_with_tax: format(totalWith),
    retainer_with_tax: format(r),
    remaining_with_tax: format((toCents(totalWith) - toCents(r)) / 100),
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

/**
 * The contract's card prices, on a 'dual' booking (migration 054): what the
 * retainer and the remaining balance cost by card, grossed up from the amounts
 * Vero keeps, tax included when the booking adds it. Empty strings otherwise,
 * which prunes the PRICES BY CARD section, so a single-priced contract renders
 * exactly as every one already on file does.
 *
 * Per payment, because Stripe's 30 cents is per payment: the card total is
 * the two card prices added up ($103.30 + $443.16 = $546.46 on a $500 booking
 * that adds tax), which is what a client paying both by card is charged.
 */
export function cardPriceContractVariables(
  total: number | null,
  retainer: number | null,
  mode: SalesTaxMode,
  pricing: CardPricing,
  format: (amount: number) => string,
): Record<string, string> {
  const none = { card_total_amount: '', card_retainer_amount: '', card_remaining_amount: '' };
  // Not gated on CARD_PAYMENTS_MODE: checkout grosses up every dual booking
  // whatever the rollout switch says, so the contract must state the card
  // prices whatever it says too, or the two could disagree.
  if (pricing !== 'dual' || total === null || !Number.isFinite(total) || total <= 0) {
    return none;
  }
  const r = retainer !== null && Number.isFinite(retainer) ? Math.min(Math.max(retainer, 0), total) : 0;
  const remaining = (toCents(withSalesTax(total, mode)) - toCents(r)) / 100;
  const cardRetainer = cardAmountFor(r, pricing);
  const cardRemaining = cardAmountFor(remaining, pricing);
  return {
    card_total_amount: format((toCents(cardRetainer) + toCents(cardRemaining)) / 100),
    card_retainer_amount: format(cardRetainer),
    card_remaining_amount: format(cardRemaining),
  };
}

/** The variable keys above, derived and never typed, like the tax keys. */
export const CARD_PRICE_CONTRACT_KEYS = ['card_total_amount', 'card_retainer_amount', 'card_remaining_amount'] as const;
