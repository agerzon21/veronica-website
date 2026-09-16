/**
 * Server-side resolution of the wedding package a lead arrived with.
 *
 * The weddings page links each card to /contact?package=<name>, so the only
 * thing that ever reaches us is a NAME, and it arrives in a query parameter
 * the visitor can edit. Coverage and price are therefore looked up HERE and
 * never accepted from the browser: otherwise someone could submit
 * "Full Wedding Day" at "from $1" and receive a confirmation email quoting
 * that back to them as though we had agreed to it.
 *
 * Reads src/data/wedding-page.json, the same file the weddings page renders
 * from, so the price we record cannot drift from the price the visitor saw.
 * Importing across the api/src boundary follows the existing precedent in
 * api/_contract-pdf.ts and api/admin/_portal-update.ts.
 */

import weddingData from '../src/data/wedding-page.json' with { type: 'json' };

interface WeddingPackage {
  name: string;
  price: string;
  coverage: string;
}

/**
 * "Full Wedding Day" becomes "Full Wedding Day; Up to 8 hours; from $1,200".
 *
 * Returns null for anything that is not one of our packages, including empty
 * and undefined, so a forged, misspelled or retired value is simply dropped
 * rather than stored and emailed.
 */
export function resolvePackage(raw: string | undefined | null): string | null {
  const wanted = (raw || '').trim();
  if (!wanted) return null;

  const packages = (weddingData as { packages?: WeddingPackage[] }).packages || [];
  const match = packages.find((p) => p.name === wanted);
  if (!match) return null;

  return [match.name, match.coverage, match.price].filter(Boolean).join('; ');
}
