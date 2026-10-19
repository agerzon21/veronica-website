const roundTo = (amount: number, step: number): number => Math.round(amount / step) * step;

/**
 * The suggested retainer for a given total.
 *
 * 15% of the total to the nearest $50, but never below $50 and never above
 * the total itself. A flat 15% put a $30 retainer on a small session, which is
 * not enough to be worth holding a date for, and the floor still has to bend
 * for a booking that costs less than the floor, hence the Math.min. The $50
 * steps are Alex's rule (2026-10-04): a retainer is a number somebody says out
 * loud, so $1,000 asks for $150 and $1,500 for $250, never $225.
 *
 * The floor was $100 until 2026-10-19, when it put a $100 retainer on a $200
 * portrait session: half the price up front, for a session three days away.
 * $50 is the smallest step, so a $200 or $300 session asks for $50.
 *
 * The total typed here is the price before tax, which is what the 15% is of,
 * and the retainer is never taxed on its own (sales-tax.ts, retainerOwed).
 */
export const RETAINER_RATE = 0.15;
export const RETAINER_FLOOR = 50;
export const RETAINER_STEP = 50;
export const suggestedRetainer = (total: number): string => {
  if (!Number.isFinite(total) || total <= 0) return '';
  return String(Math.min(total, Math.max(RETAINER_FLOOR, roundTo(total * RETAINER_RATE, RETAINER_STEP))));
};
