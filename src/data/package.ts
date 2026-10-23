/**
 * A package of sessions booked together (2026-10-22, migration 057).
 *
 * The discount is typed in dollars or percent, and comes off each session in
 * proportion to its regular price, in whole dollars that add up exactly to
 * the package total (largest remainder). Each result is what that session's
 * contract states; the regular prices are kept so the client can be shown
 * what the package saves them.
 */

export type DiscountMode = 'usd' | 'pct';

export interface PackageSplit {
  /** The regular prices added up. */
  regularTotal: number;
  /** What the package costs, before tax. */
  packageTotal: number;
  /** Each session's package price, in the order given. */
  prices: number[];
}

export function splitPackage(regulars: number[], mode: DiscountMode, value: number): PackageSplit {
  const regs = regulars.map((r) => (Number.isFinite(r) && r > 0 ? r : 0));
  const regularTotal = regs.reduce((a, b) => a + b, 0);
  const v = Number.isFinite(value) && value > 0 ? value : 0;
  const off = mode === 'pct' ? (regularTotal * Math.min(v, 100)) / 100 : Math.min(v, regularTotal);
  const packageTotal = Math.round(regularTotal - off);
  if (regularTotal === 0) return { regularTotal, packageTotal: 0, prices: regs.map(() => 0) };
  const exact = regs.map((r) => (r / regularTotal) * packageTotal);
  const prices = exact.map(Math.floor);
  let left = packageTotal - prices.reduce((a, b) => a + b, 0);
  exact
    .map((e, i) => [e - Math.floor(e), i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (left > 0) {
        prices[i] += 1;
        left -= 1;
      }
    });
  return { regularTotal, packageTotal, prices };
}
