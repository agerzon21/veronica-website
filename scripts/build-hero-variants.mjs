/**
 * Generate mobile-sized derivatives for the homepage hero carousel.
 *
 *   node scripts/build-hero-variants.mjs             # write variants + manifest
 *   node scripts/build-hero-variants.mjs --dry-run   # report only
 *   node scripts/build-hero-variants.mjs --check     # CI: fail if anything is stale
 *
 * WHY THIS EXISTS
 * The hero carousel was serving full-resolution gallery originals — up to
 * 1.2MB each — to phones rendering them at roughly 566 CSS px. That was ~2.99MB
 * of the homepage's 3.77MB payload and the single biggest contributor to
 * Speed Index.
 *
 * WHY IT IS NOT scripts/compress-photos.mjs
 * That script rewrites originals IN PLACE at a 2400px longest edge, which cuts
 * portrait-orientation photos down to ~1500px wide — visibly soft on a
 * full-bleed desktop hero, and unrecoverable. This one never touches an
 * original. Desktop keeps the untouched file; only phones get a derivative.
 *
 * OUTPUT LOCATION
 * public/assets/hero/ — deliberately NOT under public/assets/photos/, because
 * scripts/measure-photos.mjs walks that tree keyed by bare filename and feeds
 * src/data/photo-dims.json straight into the client bundle. Variants there
 * would balloon it.
 *
 * The generated files ARE committed. This does not run during `npm run build`:
 * a build-time hiccup must never be able to ship a hero with no images.
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const slidesPath = join(root, 'src', 'data', 'hero-slides.json');
const manifestPath = join(root, 'src', 'data', 'hero-variants.json');
const desktopManifestPath = join(root, 'src', 'data', 'hero-variants-desktop.json');
const outDir = join(root, 'public', 'assets', 'hero');

// The slide does NOT render at viewport width. It renders inside the camera
// LCD, which computeCameraSize() in HeroSection.tsx scales to 1.2x viewport
// coverage — LCD_BOUNDS.mobile puts the screen at 36% of the camera width, so
// the actual painted width is much larger than the viewport suggests:
//   iPhone 15 Pro Max (430x932, DPR 3)     -> LCD 799 CSS px -> 2397 device px
//   iPhone 15 Pro     (393x852, DPR 3)     -> LCD 730 CSS px -> 2190 device px
//   Pixel 8           (412x870, DPR 2.625) -> LCD 746 CSS px -> 1958 device px
//
// 1600 keeps the upscale to ~1.2-1.5x on DPR-3 flagships. The first draft used
// 1100, derived from two wrong numbers (a 566px LCD and DPR 1.75), which would
// have upscaled 1.8-2.2x — visibly soft on the hero of a photographer's site.
// 1600 costs ~3.0MB of variants instead of ~1.7MB, still ~2.6x under the
// 7.86MB of originals it replaces.
// TWO rungs. 1600 is sized for DPR-3 flagships (LCD 730-799 CSS px -> ~2200
// device px). But a 412x823 viewport at DPR 1.75 — Lighthouse's profile, and a
// very common mid-tier Android — only needs 705 * 1.75 = 1234 device px, so it
// was being handed ~32% more bytes than it can display. srcSet lets the browser
// pick. Do not collapse these to one rung in either direction.
const WIDTHS = [1280, 1600];
const PRIMARY = 1600; // the plain `src` fallback for anything without srcset

// Desktop was still being served the untouched originals — 8.26MB across the
// 12 desktop-eligible slides, up to 5947px wide. That is why mobile PageSpeed
// improved dramatically and desktop did not move off 72.
//
// The camera LCD at scroll 0 is ~1.2*vw in landscape: 1728 CSS px at 1440,
// 2304 at 1920, capped at 2940. So 2560 covers every non-retina desktop and
// retina up to a ~1280 viewport, while the ORIGINAL stays in the srcset as the
// top rung for large retina displays. Nothing is downscaled below what the
// screen can show — several originals are only 2000px wide and are already
// being upscaled today, so they get no rung at all (the size guard skips any
// re-encode that is not actually smaller).
const DESKTOP_WIDTHS = [1920, 2560];
const DESKTOP_QUALITY = 78;
const QUALITY = 72;

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isCheck = args.includes('--check');
const force = args.includes('--force');

const slides = JSON.parse(readFileSync(slidesPath, 'utf-8'));

// Only slides that can actually appear on mobile need a derivative. A slide's
// mobile source is its mobileUrl when set, otherwise its url — entry 8
// deliberately shows a different photo on mobile than on desktop.
const mobileSources = [
  ...new Set(
    slides.filter((s) => !s.mobileSkip).map((s) => s.mobileUrl || s.url),
  ),
];

// Desktop uses `url`, never mobileUrl — entry 8 deliberately shows a different
// photo on each.
const desktopSources = [...new Set(slides.filter((s) => !s.desktopSkip).map((s) => s.url))];

// 1600 keeps the historical `-m.webp` name so existing committed files and the
// manifest stay stable; 1280 gets an explicit suffix.
const variantName = (src, w) =>
  w === PRIMARY ? `${basename(src, '.webp')}-m.webp` : `${basename(src, '.webp')}-m${w}.webp`;
const desktopName = (src, w) => `${basename(src, '.webp')}-d${w}.webp`;

if (!isDryRun && !isCheck && !existsSync(outDir)) mkdirSync(outDir, { recursive: true });

let generated = 0;
let reused = 0;
let stale = 0;
const manifest = {};
const missingSources = [];

for (const src of mobileSources) {
  const srcPath = join(root, 'public', src);
  if (!existsSync(srcPath)) {
    missingSources.push(src);
    continue;
  }
  manifest[src] = {};

  for (const w of WIDTHS) {
    const outName = variantName(src, w);
    const outPath = join(outDir, outName);
    manifest[src][w] = `/assets/hero/${outName}`;

    // Regenerate when the source is newer than the derivative, so a repeat run
    // is cheap and produces no git churn.
    //
    // --force exists because this gate is mtime-only: changing WIDTHS or
    // QUALITY does NOT make a derivative stale, so a constant change would be a
    // silent no-op and you would commit nothing while believing otherwise.
    //
    // --check deliberately ignores mtime entirely: git does not preserve it, so
    // checkout order on a fresh clone makes the comparison arbitrary and CI
    // would fail at random. In check mode, existing-and-committed is the
    // contract.
    const fresh = isCheck
      ? existsSync(outPath)
      : !force && existsSync(outPath) && statSync(outPath).mtimeMs >= statSync(srcPath).mtimeMs;

    if (fresh) {
      reused++;
      continue;
    }
    if (isCheck) {
      stale++;
      console.error(`  MISSING ${outName}`);
      continue;
    }
    if (isDryRun) {
      console.log(`  WOULD WRITE ${outName}`);
      generated++;
      continue;
    }

    // .rotate() applies EXIF orientation so a phone-shot original cannot come
    // out sideways. Width-only resize keeps the aspect ratio exact, which
    // preserves every hand-tuned objectPosition crop and keeps CLS at 0.
    const buf = await sharp(srcPath)
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 6 })
      .toBuffer();

    writeFileSync(outPath, buf);
    const before = statSync(srcPath).size / 1024;
    const after = buf.length / 1024;
    console.log(
      `  ✓ ${outName}: ${Math.round(before)}KB → ${Math.round(after)}KB (-${Math.round(100 - (after / before) * 100)}%)`,
    );
    generated++;
  }
}

// ---- desktop rungs ----------------------------------------------------
const desktopManifest = {};
const originalWidths = {};
for (const src of desktopSources) {
  const srcPath = join(root, 'public', src);
  if (!existsSync(srcPath)) {
    missingSources.push(src);
    continue;
  }
  const meta = await sharp(srcPath).metadata();
  desktopManifest[src] = {};
  // Needed so the original can carry a correct `w` descriptor as the widest
  // srcset candidate.
  if (meta.width) originalWidths[src] = meta.width;

  for (const w of DESKTOP_WIDTHS) {
    // Never emit a rung at or above the original's own width — that is pure
    // re-encode with no pixels gained, and for the 2000px-wide slides it would
    // hand the browser a same-size candidate that is not actually better.
    if (!meta.width || meta.width <= w) continue;

    const outName = desktopName(src, w);
    const outPath = join(outDir, outName);
    desktopManifest[src][w] = `/assets/hero/${outName}`;

    const fresh = isCheck
      ? existsSync(outPath)
      : !force && existsSync(outPath) && statSync(outPath).mtimeMs >= statSync(srcPath).mtimeMs;
    if (fresh) { reused++; continue; }
    if (isCheck) { stale++; console.error(`  MISSING ${outName}`); continue; }
    if (isDryRun) { console.log(`  WOULD WRITE ${outName}`); generated++; continue; }

    const buf = await sharp(srcPath)
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: DESKTOP_QUALITY, effort: 6 })
      .toBuffer();

    // Guard: if the re-encode is not smaller, keep the original in the srcset
    // and drop the rung rather than shipping a bigger file.
    if (buf.length >= statSync(srcPath).size) {
      delete desktopManifest[src][w];
      continue;
    }
    writeFileSync(outPath, buf);
    const before = statSync(srcPath).size / 1024;
    const after = buf.length / 1024;
    console.log(`  \u2713 ${outName}: ${Math.round(before)}KB \u2192 ${Math.round(after)}KB (-${Math.round(100 - (after / before) * 100)}%)`);
    generated++;
  }
}

if (missingSources.length) {
  console.error('\n[hero-variants] FATAL: source photos missing from public/:');
  missingSources.forEach((s) => console.error(`  ${s}`));
  process.exit(1);
}

if (isCheck) {
  // The derivatives MUST be committed. Nothing else validates this: the bundle
  // bakes in /assets/hero/* URLs at build time and a Chakra <Image> with a
  // missing src renders a blank hero — silently, and only on mobile. A
  // source-scoped `git add src scripts ...` would ship exactly that.
  const { execFileSync } = await import('child_process');
  const tracked = new Set(
    execFileSync('git', ['ls-files', 'public/assets/hero'], { cwd: root, encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean)
      .map((p) => '/' + p.replace(/^public\//, '')),
  );
  const untracked = Object.values(manifest)
    .flatMap((r) => Object.values(r))
    .filter((p) => !tracked.has(p));
  if (untracked.length) {
    console.error('\n[hero-variants] FATAL: variants exist on disk but are not committed:');
    untracked.forEach((p) => console.error(`  ${p}`));
    console.error('Run: git add public/assets/hero');
    process.exit(1);
  }

  // The committed manifest is what actually ships to the client — validate it
  // rather than just the files on disk. A slide added to hero-slides.json
  // without a regenerate would otherwise sail through.
  const onDisk = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf-8'))
    : {};
  const drift = mobileSources.filter(
    (s) => JSON.stringify(onDisk[s]) !== JSON.stringify(manifest[s]),
  );
  if (drift.length) {
    console.error('\n[hero-variants] FATAL: hero-variants.json is out of sync with hero-slides.json:');
    drift.forEach((s) => console.error(`  ${s} -> committed:${JSON.stringify(onDisk[s]) ?? 'MISSING'}`));
    console.error('Run: npm run hero-variants');
    process.exit(1);
  }

  if (stale) {
    console.error(
      `\n[hero-variants] ${stale} variant(s) stale. Run: npm run hero-variants`,
    );
    process.exit(1);
  }
  console.log(`[hero-variants] ${tracked.size} variants present, committed, and current.`);
  process.exit(0);
}

if (!isDryRun) {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  // Desktop manifest carries only the rungs; the ORIGINAL is appended as the
  // top srcset candidate at render time (see Home.tsx desktopSrcSetFor), so a
  // large retina display still gets the untouched file.
  writeFileSync(
    desktopManifestPath,
    JSON.stringify({ rungs: desktopManifest, originalWidths: originalWidths }, null, 2) + '\n',
  );
}

console.log(
  `\n[hero-variants] ${generated} generated, ${reused} already current, ${Object.keys(manifest).length} in manifest.`,
);
