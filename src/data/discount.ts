/**
 * A discount on one session (2026-10-23, migration 058).
 *
 * Typed like the package discount, in dollars or percent, and worked out in
 * whole dollars like the package split, so the price on the contract is a
 * round figure. Never more than the price itself.
 */

import type { DiscountMode } from './package.js';

export function discountOff(price: number, mode: DiscountMode, value: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const v = Number.isFinite(value) && value > 0 ? value : 0;
  const off = mode === 'pct' ? Math.round((price * Math.min(v, 100)) / 100) : Math.round(v);
  return Math.min(off, price);
}

/** What a client is shown for a discount that was given no name. */
export const DEFAULT_DISCOUNT_LABEL = 'Discount';
