/**
 * The client portal's moving mosaic, as ONE sprite sheet.
 *
 *   node scripts/build-portal-mosaic.mjs          build it
 *   node scripts/build-portal-mosaic.mjs --check  verify the build made it
 *
 * WHY A SPRITE. The login page shows about 120 photographs drifting behind
 * the form. As 120 <img> elements that is 120 requests and 120 decodes for
 * something nobody is meant to look at directly, on a page whose whole job is
 * to get out of the way in under a second. As one sheet it is one request,
 * one decode, and every tile is a background-position.
 *
 * WHY IT IS LIGHTER THAN WHAT IT REPLACES. The page currently loads
 * public/assets/photos/site/client-portal.webp, a single full-bleed
 * photograph, at 913 KB. This sheet carries 120 photographs in about 220 KB.
 * A quarter of the bytes for the whole body of work instead of one frame.
 *
 * WHY BUILD-TIME AND GITIGNORED. Same reason as build-grid-variants.mjs: 34
 * of the site's photographs are not in git at all, they are fetched from
 * Drive during the build, so a sheet committed from a local checkout would be
 * missing whatever had not been downloaded that day. Building it after the
 * fetch means it always reflects what actually shipped. See
 * project_gallery_photos_not_in_git.
 *
 * The tiles are small and heavily compressed ON PURPOSE. They are 105x140 and
 * sit behind a cream veil at well under half opacity; quality beyond this is
 * bytes nobody can see.
 */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'public/assets/photos';
const OUT_DIR = 'public/assets/portal';
const OUT = path.join(OUT_DIR, 'mosaic.webp');

/** Interleaved so neighbouring tiles are not all one session. */
const CATS = ['weddings', 'portraits', 'family', 'maternity'];
const TW = 105;
const TH = 140;
const COLS = 12;
const ROWS = 10;
const N = COLS * ROWS;
const QUALITY = 46;

const check = process.argv.includes('--check');

if (check) {
  if (!fs.existsSync(OUT)) {
    console.error(`portal-mosaic: ${OUT} is missing. The login page falls back to a single photograph without it.`);
    process.exit(1);
  }
  const { size } = fs.statSync(OUT);
  const meta = await sharp(OUT).metadata();
  if (meta.width !== COLS * TW || meta.height !== ROWS * TH) {
    console.error(`portal-mosaic: ${OUT} is ${meta.width}x${meta.height}, expected ${COLS * TW}x${ROWS * TH}. The CSS positions every tile by hand and will be wrong.`);
    process.exit(1);
  }
  console.log(`portal-mosaic: ok (${meta.width}x${meta.height}, ${(size / 1024).toFixed(0)} KB, ${N} photographs).`);
  process.exit(0);
}

const buckets = CATS.map((c) => {
  const dir = path.join(ROOT, c);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).sort().map((f) => path.join(dir, f));
});

const picks = [];
for (let i = 0; picks.length < N; i++) {
  let added = false;
  for (const b of buckets) {
    if (i < b.length && picks.length < N) {
      picks.push(b[i]);
      added = true;
    }
  }
  if (!added) break;
}

if (picks.length === 0) {
  console.error('portal-mosaic: found no photographs to build from.');
  process.exit(1);
}

// Short of a full sheet, the remaining cells repeat from the start rather than
// rendering as flat background: a hole in the grid reads as a broken image.
while (picks.length < N) picks.push(picks[picks.length % Math.max(1, picks.length)]);

const tiles = await Promise.all(
  picks.map((p) =>
    sharp(p)
      // `attention` rather than `centre`: a cover crop down to 105x140 from a
      // wide frame otherwise cuts people's heads off, and these are portraits.
      .resize(TW, TH, { fit: 'cover', position: 'attention' })
      .toBuffer(),
  ),
);

const sheet = await sharp({
  create: { width: COLS * TW, height: ROWS * TH, channels: 3, background: '#e9e2d6' },
})
  .composite(tiles.map((input, i) => ({ input, left: (i % COLS) * TW, top: Math.floor(i / COLS) * TH })))
  .webp({ quality: QUALITY })
  .toBuffer();

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, sheet);

console.log(
  `portal-mosaic: ${picks.length} photographs, ${COLS}x${ROWS} at ${TW}x${TH}, ` +
    `${COLS * TW}x${ROWS * TH}, ${(sheet.length / 1024).toFixed(0)} KB -> ${OUT}`,
);
