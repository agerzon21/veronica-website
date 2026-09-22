/**
 * Grid-sized derivatives for every public-gallery photograph.
 *
 *   node scripts/build-grid-variants.mjs           # write anything missing
 *   node scripts/build-grid-variants.mjs --check   # fail if any rung is absent
 *   node scripts/build-grid-variants.mjs --force   # re-encode everything
 *
 * WHY THIS EXISTS
 * /gallery/<category> paints every published photograph into a justified
 * masonry whose tiles run from 81x122 to 542x361 CSS px, and it was serving
 * the full-size original into every one of them. Measured on the weddings
 * category: 233 images, 107MB, sources up to 6000px wide painted 81px wide.
 *
 * WHY IT RUNS DURING THE BUILD, unlike scripts/build-hero-variants.mjs
 * The gallery's photo files are not all in git. build-gallery-statics.mjs
 * downloads every published photo from Drive into public/assets/photos at
 * build time, and 34 of the 232 live photos have never existed in the repo.
 * Committed derivatives would therefore cover the photos a developer happens
 * to have and quietly miss a seventh of the gallery in production. Running
 * after that download covers whatever the build actually has, which is the
 * only set that matters.
 *
 * The heroes make the opposite call for the opposite reason: a hero is ONE
 * photograph on the critical path, so a build-time hiccup there is a blank
 * front door, and committing it is worth the drift risk. Here a missing rung
 * is caught by --check before the bundle is written.
 *
 * OUTPUT LOCATION
 * public/assets/grid/<category>/<slug>-g<width>.webp — deliberately NOT under
 * public/assets/photos/, which scripts/measure-photos.mjs walks keyed by bare
 * filename to build photo-dims.json. Derivatives there would collide with
 * their own originals in that map and ship the wrong aspect ratios to the
 * layout, which is the one thing that would actually move the grid.
 *
 * The output is gitignored. It is fully derivable, it is 34MB, and the build
 * regenerates it.
 *
 * NO MANIFEST, ON PURPOSE
 * The client builds these URLs by convention (see gridSrcSet in
 * src/utils/gridSrcSet.ts) rather than importing a map, because a map of 232
 * photos x 3 rungs is ~40KB of JSON in the bundle to express a rule that fits
 * on one line. The contract that makes that safe is --check: the build fails
 * if a single rung is missing, so a URL the client can construct is a file
 * that exists.
 */

import sharp from 'sharp';
import { readdirSync, existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const photosDir = join(root, 'public', 'assets', 'photos');
const outRoot = join(root, 'public', 'assets', 'grid');

/** The four folders the public gallery draws from. `site` is not one. */
const CATEGORIES = ['portraits', 'weddings', 'family', 'maternity'];

/**
 * The ladder.
 *
 * Measured against the real justified layout at six viewport widths, and then
 * against what Chrome actually paints, which turned out to be the only test
 * worth running.
 *
 * The grid passes each tile's EXACT pixel width as `sizes`, so the browser
 * multiplies by device pixel ratio:
 *
 *   390px phone,  DPR 3:  tiles  71..358 CSS px  ->  needs  213..1074
 *   1440 laptop,  DPR 2:  tiles 175..719 CSS px  ->  needs  350..1438
 *   2560 display, DPR 2:  tiles 221..752 CSS px  ->  needs  442..1504
 *
 * THE TOP RUNG IS 1600 BECAUSE OF SUPERSAMPLING, not because anything is
 * upscaled at 1440. Today every tile is painted from an original up to 6000px
 * wide, so the browser downscales 4-8x and the result is extremely crisp. A
 * rung that merely MATCHES the device pixels is painted 1:1 and loses that.
 *
 * Measured as mean-squared-Laplacian on Chrome's own output, painting the
 * widest tile (719 CSS px at DPR 2), as a share of what the original gives:
 *
 *   rung:      1440    1600    1800    2000
 *   typical:    70%     83%     93%    103%
 *   worst:      33%     46%     56%     68%   (a photograph of printed text)
 *   storage:   34MB    43MB    58MB    74MB   (top rung, 198 photographs)
 *
 * Quality does NOT buy this back: the same test from q76 to q90 moves the
 * first row by two points and costs 40MB. It is a resolution effect, so the
 * fix is resolution.
 *
 * 1600 is the knee. It also leaves every device supersampling rather than
 * painting 1:1: 1.49x on the widest phone tile, 1.11x on a retina laptop.
 * Going to 1800 buys ten more points for another 15MB per deployment, which
 * is a call for whoever is watching the Vercel storage quota.
  */
const WIDTHS = [400, 800, 1600];
/**
 * A grid tile is always displayed smaller than the rung it picks, so the
 * downscale hides what 76 costs. The heroes use 72 on mobile and 78 on
 * desktop for the same reason in reverse.
 */
const QUALITY = 76;
/** sharp releases the event loop, so this actually uses the other cores. */
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const isCheck = args.includes('--check');
const force = args.includes('--force');

const variantName = (slug, w) => `${slug}-g${w}.webp`;

const jobs = [];
for (const category of CATEGORIES) {
  const dir = join(photosDir, category);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.webp')) continue;
    const slug = file.slice(0, -'.webp'.length);
    for (const w of WIDTHS) {
      jobs.push({
        category,
        slug,
        w,
        src: join(dir, file),
        out: join(outRoot, category, variantName(slug, w)),
      });
    }
  }
}

if (!jobs.length) {
  console.error('[grid-variants] FATAL: no photographs found under public/assets/photos.');
  console.error('Run scripts/build-gallery-statics.mjs first, or check the checkout.');
  process.exit(1);
}

if (isCheck) {
  const missing = jobs.filter((j) => !existsSync(j.out));
  if (missing.length) {
    console.error(`\n[grid-variants] FATAL: ${missing.length} rung(s) missing:`);
    for (const m of missing.slice(0, 12)) console.error(`  ${m.category}/${variantName(m.slug, m.w)}`);
    if (missing.length > 12) console.error(`  … and ${missing.length - 12} more`);
    console.error('\nThe gallery builds these URLs by convention, so a missing file is a broken');
    console.error('tile rather than a slow one. Run: npm run grid-variants');
    process.exit(1);
  }
  console.log(`[grid-variants] ${jobs.length} rungs present for ${jobs.length / WIDTHS.length} photographs.`);
  process.exit(0);
}

for (const category of CATEGORIES) {
  const dir = join(outRoot, category);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

let generated = 0;
let reused = 0;
let bytesIn = 0;
let bytesOut = 0;

async function run(job) {
  // mtime gate, same as the hero script: a repeat local run is cheap. CI
  // starts from an empty directory, so it encodes everything once.
  if (
    !force &&
    existsSync(job.out) &&
    statSync(job.out).mtimeMs >= statSync(job.src).mtimeMs
  ) {
    reused++;
    return;
  }
  const srcBytes = statSync(job.src).size;
  let buf = await sharp(job.src)
    // EXIF orientation applied, so a phone-shot original cannot come out
    // sideways in a tile while its original sits upright in the lightbox.
    .rotate()
    // withoutEnlargement: NEVER upscale. Nine of the 198 photographs here are
    // narrower than the top rung, and re-encoding an 843px photograph at
    // 1600 produced a 347KB file where the original was 107KB: 3.2x heavier
    // for not one extra pixel of detail. Six of the nine came out heavier.
    .resize({ width: job.w, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 5 })
    .toBuffer();
  // And if the re-encode is still not smaller, serve the original's bytes at
  // the rung's path. The file has to exist either way, because the client
  // builds these URLs by convention and a srcset candidate that 404s fails
  // the image rather than falling back. This way the descriptor can overstate
  // the width of a narrow photograph, but the BYTES are exactly what the page
  // sends today, so the change can never make one heavier.
  if (buf.length >= srcBytes) buf = readFileSync(job.src);
  writeFileSync(job.out, buf);
  bytesIn += statSync(job.src).size;
  bytesOut += buf.length;
  generated++;
}

const queue = [...jobs];
const failures = [];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        await run(job);
      } catch (err) {
        failures.push(`${job.category}/${variantName(job.slug, job.w)}: ${err.message}`);
      }
    }
  }),
);

if (failures.length) {
  console.error(`\n[grid-variants] FATAL: ${failures.length} rung(s) failed to encode:`);
  failures.slice(0, 10).forEach((f) => console.error(`  ${f}`));
  process.exit(1);
}

const photos = jobs.length / WIDTHS.length;
console.log(
  `[grid-variants] ${generated} written, ${reused} already current, ` +
    `${photos} photographs x ${WIDTHS.length} rungs.`,
);
if (generated) {
  console.log(
    `[grid-variants] encoded ${(bytesOut / 1024 / 1024).toFixed(1)}MB from ` +
      `${(bytesIn / 1024 / 1024).toFixed(1)}MB of source reads.`,
  );
}
