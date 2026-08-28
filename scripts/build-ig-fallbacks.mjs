/**
 * Generate square tile derivatives for the Instagram fallback grid.
 *
 *   npm run ig-fallbacks           # write derivatives + manifest
 *   npm run ig-fallbacks:check     # CI: fail if missing, uncommitted, or drifted
 *
 * WHY
 * InstagramFeed renders nine tiles in a 1:1 grid — ~114 CSS px on mobile, 266
 * (or 544 for the first) on desktop. The fallback set pointed straight at nine
 * full-resolution gallery originals: 4.99 MiB, up to 3808px wide.
 *
 * They are not a rare path either. On the SUCCESS path the bundled stub fails
 * the `livePhotos.length >= 9` test, so all nine full-res tiles mount and start
 * downloading; then /api/instagram-feed resolves, the React key flips from
 * `photo.url` to `photo.permalink`, every tile remounts, and nine more images
 * download. The 4.99 MiB was being fetched and thrown away.
 *
 * Square `cover` crops, matching the AspectRatio ratio={1} the grid renders.
 *
 * IMPORTANT: these are for the GRID ONLY. Photo.url must keep pointing at the
 * full-resolution original — it is the React key AND what IgPostModal renders
 * in an 85vh lightbox. A square crop there would be centre-cropped and upscaled.
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const sourceFile = join(root, 'src', 'components', 'InstagramFeed.tsx');
const manifestPath = join(root, 'src', 'data', 'ig-fallback-variants.json');
const outDir = join(root, 'public', 'assets', 'ig-fallback');

// 240 covers mobile at DPR2 (114 css -> 228 dev). 560 covers desktop small
// tiles at DPR2 and mobile at DPR3. 1120 covers the desktop 2x2 hero tile.
const RUNGS = [240, 560, 1120];
const QUALITY = 76;

const args = process.argv.slice(2);
const isCheck = args.includes('--check');
const isDryRun = args.includes('--dry-run');
const force = args.includes('--force');

// Single source of truth: parse the FALLBACK_PHOTOS urls out of the component
// so this can never drift from what actually renders.
const src = readFileSync(sourceFile, 'utf-8');
const block = src.slice(
  src.indexOf('const FALLBACK_PHOTOS'),
  src.indexOf('];', src.indexOf('const FALLBACK_PHOTOS')),
);
const sources = [...block.matchAll(/url: '(\/assets\/photos\/[^']+)'/g)].map((m) => m[1]);

if (sources.length !== 9) {
  console.error(`[ig-fallbacks] FATAL: expected 9 fallback photos, parsed ${sources.length}.`);
  console.error('[ig-fallbacks] The grid renders exactly 9 tiles; fix InstagramFeed.tsx or this parser.');
  process.exit(1);
}

if (!isCheck && !isDryRun && !existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const manifest = {};
let generated = 0;
let current = 0;
const missing = [];

for (const s of sources) {
  const srcPath = join(root, 'public', s);
  if (!existsSync(srcPath)) {
    console.error(`[ig-fallbacks] FATAL: source missing: ${s}`);
    process.exit(1);
  }
  const slug = basename(s, '.webp');
  manifest[s] = {};

  for (const w of RUNGS) {
    const name = `${slug}-${w}.webp`;
    const outPath = join(outDir, name);
    manifest[s][w] = `/assets/ig-fallback/${name}`;

    if (existsSync(outPath) && !force) {
      current++;
      continue;
    }
    if (isCheck) {
      missing.push(name);
      continue;
    }
    if (isDryRun) {
      console.log(`  WOULD WRITE ${name}`);
      generated++;
      continue;
    }
    // Square cover crop, matching AspectRatio ratio={1}. .rotate() applies EXIF
    // orientation so nothing lands sideways.
    const buf = await sharp(srcPath)
      .rotate()
      .resize({ width: w, height: w, fit: 'cover', position: 'attention', withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 6 })
      .toBuffer();
    writeFileSync(outPath, buf);
    generated++;
  }
}

if (isCheck) {
  if (missing.length) {
    console.error('\n[ig-fallbacks] FATAL: derivatives missing from disk:');
    missing.forEach((m) => console.error(`  ${m}`));
    console.error('Run: npm run ig-fallbacks');
    process.exit(1);
  }
  const { execFileSync } = await import('child_process');
  const tracked = new Set(
    execFileSync('git', ['ls-files', 'public/assets/ig-fallback'], { cwd: root, encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean)
      .map((p) => '/' + p.replace(/^public\//, '')),
  );
  const untracked = Object.values(manifest)
    .flatMap((r) => Object.values(r))
    .filter((p) => !tracked.has(p));
  if (untracked.length) {
    console.error('\n[ig-fallbacks] FATAL: derivatives exist but are not committed:');
    untracked.forEach((p) => console.error(`  ${p}`));
    console.error('Run: git add public/assets/ig-fallback');
    process.exit(1);
  }
  const onDisk = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf-8')) : {};
  if (JSON.stringify(onDisk) !== JSON.stringify(manifest)) {
    console.error('\n[ig-fallbacks] FATAL: ig-fallback-variants.json is out of sync with InstagramFeed.tsx.');
    console.error('Run: npm run ig-fallbacks');
    process.exit(1);
  }
  console.log(`[ig-fallbacks] ${tracked.size} derivatives present, committed, and current.`);
  process.exit(0);
}

if (!isDryRun) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n[ig-fallbacks] ${generated} generated, ${current} already current.`);
