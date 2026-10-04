/**
 * The gallery categories for the build scripts, read straight out of
 * src/data/gallery-categories.ts, which they cannot import (it is
 * TypeScript). Parsing the two array literals keeps one list for the whole
 * site instead of a copy per script that drifts.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'gallery-categories.ts');
const src = readFileSync(SOURCE, 'utf8');

function list(name) {
  const m = src.match(new RegExp(`export const ${name}\\b[^=]*=\\s*\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`scripts/gallery-categories.mjs: no ${name} array in src/data/gallery-categories.ts`);
  return [...m[1].matchAll(/'([a-z][a-z-]*)'/g)].map((x) => x[1]);
}

/** Every category, in the site's order. */
export const GALLERY_CATEGORIES = list('GALLERY_CATEGORIES');
/** Categories with a tile but no public gallery yet. */
export const GALLERY_COMING_SOON = list('GALLERY_COMING_SOON');
/** Categories the public can browse. */
export const PUBLIC_GALLERY_CATEGORIES = GALLERY_CATEGORIES.filter((c) => !GALLERY_COMING_SOON.includes(c));

if (GALLERY_CATEGORIES.length === 0 || GALLERY_COMING_SOON.some((c) => !GALLERY_CATEGORIES.includes(c))) {
  throw new Error('scripts/gallery-categories.mjs: GALLERY_COMING_SOON names a category GALLERY_CATEGORIES does not have.');
}
