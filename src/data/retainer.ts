/**
 * The suggested retainer for a given total, and the rule a typed one must meet.
 *
 * 15% of the total, ROUNDED UP to a multiple of $25, never below $50 and never
 * above the total itself (Alex, 2026-10-25): a retainer is a round number
 * somebody says out loud, $50, $75, $100, $225, never $38. Rounding up rather
 * than to the nearest keeps it from ever coming in under 15%.
 *
 * History: $50 steps to the nearest (2026-10-04), so $1,500 asked $250 rather
 * than $225; a $100 floor until 2026-10-19, which put $100 on a $200 portrait
 * session. A $250 family session was then booked with a hand-typed $38, its
 * client paid the contract's "remaining balance" and never the retainer, and
 * this became a rule the form enforces rather than a suggestion it offers.
 *
 * The total here is the price before tax, which is what the 15% is of, and
 * the retainer is never taxed on its own (sales-tax.ts, retainerOwed).
 */
export const RETAINER_RATE = 0.15;
export const RETAINER_FLOOR = 50;
export const RETAINER_STEP = 25;
export const suggestedRetainer = (total: number): string => {
  if (!Number.isFinite(total) || total <= 0) return '';
  // Whole dollars first, so a few cents over a step ($667 is $100.05) do not
  // push the retainer up a whole $25; then up to the next multiple of $25.
  const raw = Math.ceil(Math.round(total * RETAINER_RATE) / RETAINER_STEP) * RETAINER_STEP;
  return String(Math.min(total, Math.max(RETAINER_FLOOR, raw)));
};

/**
 * Whether a typed retainer meets the rule: a multiple of $25 and at least
 * $50, or the whole total when the booking costs less than that (a $40
 * session cannot ask for $50). Zero passes only on a free booking.
 */
export function retainerProblem(retainer: number, total: number): 'floor' | 'step' | null {
  if (!Number.isFinite(retainer) || !Number.isFinite(total)) return null;
  if (total <= 0) return null;
  if (retainer === total && total < RETAINER_FLOOR) return null;
  if (retainer < Math.min(RETAINER_FLOOR, total)) return 'floor';
  if (Math.round(retainer * 100) % (RETAINER_STEP * 100) !== 0) return 'step';
  return null;
}
