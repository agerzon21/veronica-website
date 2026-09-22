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
const srcsetsPath = join(root, 'src', 'data', 'photo-srcsets.json');
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
// 1680 exists because Lighthouse measured the desktop hero being served at
// 1895x1419 for a 1642x1213 display box — 97KB wasted on pixels nobody sees.
// With only 1920 and 2560 on offer the browser had nothing closer to pick.
const DESKTOP_WIDTHS = [1680, 1920, 2560];
const DESKTOP_QUALITY = 78;
const QUALITY = 72;

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isCheck = args.includes('--check');
const force = args.includes('--force');

const slides = JSON.parse(readFileSync(slidesPath, 'utf-8'));

/**
 * PAGE HEROES, as opposed to the homepage carousel above.
 *
 * Each of these is a single full-bleed photograph at the top of a page, and
 * each was being served to phones at its full desktop resolution. The weddings
 * one is the worst: a 1,019,098 byte original painted into a 390px window.
 *
 * They go through the same machinery, the same output directory and the same
 * committed-not-built rule as the carousel, so there is one mechanism to
 * understand and one --check to trust. Listed explicitly rather than
 * discovered, because "every photo used as a hero somewhere" is not something
 * a script can work out, and a wrong guess here ships a soft hero.
 */
const PAGE_HEROES = {
  // MOBILE ONLY, and the flag is load-bearing. Weddings shows a different
  // photograph on desktop and hides this one with display:none, so desktop
  // rungs for it would be three files nobody can ever be served. Chrome does
  // fetch the hidden element, which is why it has mobile rungs at all, and it
  // resolves sizes="100vw" against the desktop viewport and takes the widest
  // mobile rung. That is the right answer for a picture nobody sees.
  '/assets/photos/weddings/ocean-vows-ceremony.webp': { mobileOnly: true },
  // The contact hero, which is also the ThankYou hero: 4289x3166 painted into
  // a 390px window, and the LCP element on both pages. The ORIGINAL stays
  // exactly where it is, because it is the site-wide og:image and a social
  // crawler should get the full-size file.
  '/assets/photos/site/contact-bg.webp': {},
  // The gallery hero, which is also the LCP there, and the same 2812x2000
  // file the homepage paints into a 358x84 bar. One source, three surfaces,
  // and until now every one of them fetched all of it.
  '/assets/photos/portraits/sunset-sunflower-field-joy.webp': {},
  // The four category heroes, one per /gallery/<category>. Three of them are
  // also carousel slides, so they already had part of a ladder: one had
  // mobile rungs and no desktop, another desktop and no mobile, and the
  // maternity one neither. Listing them here gives all four the same full
  // ladder rather than whatever their carousel membership happened to leave.
  '/assets/photos/portraits/shadow-play-portrait.webp': {},
  '/assets/photos/weddings/newlyweds-running-sea.webp': {},
  '/assets/photos/family/elegant-family-studio-portrait-black.webp': {},
  '/assets/photos/maternity/couples-beach-baby-bump-moment.webp': {},
  // The weddings page's DESKTOP hero. Its mobile twin was fixed first and
  // this one was missed, which is exactly the trap the mobileOnly flag above
  // describes in reverse: they are two elements, so fixing one says nothing
  // about the other.
  '/assets/photos/site/weddings-hero.webp': {},
  // The About hero, and the LCP element there.
  '/assets/photos/site/vero-camera.webp': {},
  // The Journal hero, and also the source for a 358x84 bar on the homepage:
  // 662KB for 30,000 visible pixels. CardBar already asks for a srcset, so
  // wiring this here fixes the homepage bar at the same time.
  '/assets/photos/site/journal-hero.webp': {},
  // The homepage's full-bleed call-to-action band.
  '/assets/photos/site/home-cta-bg.webp': {},
  // The homepage reviews backdrop: 1151KB, the heaviest single file left.
  '/assets/photos/portraits/white-dress-lighthouse.webp': {},
};

/**
 * INLINE PHOTOGRAPHS, as opposed to the full-bleed heroes above.
 *
 * These never span the viewport. They sit in a column at 165..518 CSS px, so
 * the hero ladder is the wrong shape for them entirely: its smallest rung is
 * 1280, which is more than twice what the largest of these ever paints.
 *
 * Measured boxes, from the layout harness:
 *   PortraitPair main   165x220 phone (DPR 3 -> 495)   518x648 desk (DPR 2 -> 1036)
 *   PortraitPair inset  165x248 phone (DPR 3 -> 495)   257x392 desk (DPR 2 ->  514)
 *
 * So 640 and 1280 bracket every one of them with a rung to spare.
 */
const INLINE_PHOTOS = [
  '/assets/photos/site/about-bg.webp',
  '/assets/photos/site/vero-art.webp',
  '/assets/photos/site/vero-ceremony-lawn.webp',
  '/assets/photos/site/vero-portrait-truck-tulips.webp',
];
const INLINE_WIDTHS = [640, 1280];
const INLINE_QUALITY = 78;

const PAGE_HERO_SRCS = Object.keys(PAGE_HEROES);
const PAGE_HERO_DESKTOP_SRCS = PAGE_HERO_SRCS.filter((s) => !PAGE_HEROES[s].mobileOnly);

/**
 * Page heroes get one rung the carousel does not: 2880.
 *
 * A full-bleed page hero is exactly viewport-wide, so a 1440px retina laptop
 * paints 2880 device pixels. With 2560 as the top rung there is no candidate
 * that reaches it and the browser falls back to the original, which measured
 * as zero saving on desktop for the one hero whose original is far wider than
 * that. The carousel does not need this rung and would waste files on it: its
 * slide is 1.2x the viewport, so at 1440 it needs ~3456 and skips 2880 too.
 */
const PAGE_HERO_EXTRA_WIDTHS = [2880];

// Only slides that can actually appear on mobile need a derivative. A slide's
// mobile source is its mobileUrl when set, otherwise its url — entry 8
// deliberately shows a different photo on mobile than on desktop.
const mobileSources = [
  ...new Set([
    ...slides.filter((s) => !s.mobileSkip).map((s) => s.mobileUrl || s.url),
    ...PAGE_HERO_SRCS,
  ]),
];

// Desktop uses `url`, never mobileUrl — entry 8 deliberately shows a different
// photo on each.
// Page heroes need desktop rungs too, and for the same reason the carousel
// does: at 1440 a full-bleed hero paints 2880 device pixels on a retina
// screen, so "it is only the mobile ones that are oversized" is false.
const desktopSources = [
  ...new Set([
    ...slides.filter((s) => !s.desktopSkip).map((s) => s.url),
    ...PAGE_HERO_DESKTOP_SRCS,
  ]),
];

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

  // The ORIGINAL's width, so a rung wider than the source can be skipped.
  // The desktop loop below has always done this; this one never did, and
  // with `withoutEnlargement: true` that meant a 960px source silently
  // produced two identical 960px files carrying 1280w and 1600w descriptors.
  // A `w` descriptor that lies makes the browser choose badly in BOTH
  // directions. It had not bitten yet only because every source listed here
  // happened to be wider than 1600.
  const srcMeta = await sharp(srcPath).metadata();
  for (const w of WIDTHS) {
    if (srcMeta.width && srcMeta.width <= w) continue;
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

  const widths = PAGE_HERO_DESKTOP_SRCS.includes(src)
    ? [...DESKTOP_WIDTHS, ...PAGE_HERO_EXTRA_WIDTHS]
    : DESKTOP_WIDTHS;
  for (const w of widths) {
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

// ---- inline photographs ----------------------------------------------
// Same generator, same output directory, same committed-not-built rule. The
// -i prefix keeps them from ever colliding with a hero rung for the same
// photograph, which matters because vero-portrait-truck-tulips could
// plausibly become a hero one day.
const inlineManifest = {};
const inlineName = (src, w) => `${basename(src, '.webp')}-i${w}.webp`;
for (const src of INLINE_PHOTOS) {
  const srcPath = join(root, 'public', src);
  if (!existsSync(srcPath)) {
    missingSources.push(src);
    continue;
  }
  const meta = await sharp(srcPath).metadata();
  inlineManifest[src] = {};
  if (meta.width) originalWidths[src] = meta.width;

  for (const w of INLINE_WIDTHS) {
    // Same guard as everywhere else: never claim a width the file does not
    // have. vero-ceremony-lawn.webp is 960 wide and gets one rung, not two.
    if (!meta.width || meta.width <= w) continue;
    const outName = inlineName(src, w);
    const outPath = join(outDir, outName);
    inlineManifest[src][w] = `/assets/hero/${outName}`;

    const fresh = isCheck
      ? existsSync(outPath)
      : !force && existsSync(outPath) && statSync(outPath).mtimeMs >= statSync(srcPath).mtimeMs;
    if (fresh) { reused++; continue; }
    if (isCheck) { stale++; console.error(`  MISSING ${outName}`); continue; }
    if (isDryRun) { console.log(`  WOULD WRITE ${outName}`); generated++; continue; }

    const buf = await sharp(srcPath)
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: INLINE_QUALITY, effort: 6 })
      .toBuffer();
    if (buf.length >= statSync(srcPath).size) {
      delete inlineManifest[src][w];
      continue;
    }
    writeFileSync(outPath, buf);
    const before = statSync(srcPath).size / 1024;
    const after = buf.length / 1024;
    console.log(`  \u2713 ${outName}: ${Math.round(before)}KB \u2192 ${Math.round(after)}KB (-${Math.round(100 - (after / before) * 100)}%)`);
    generated++;
  }
}

/**
 * ONE PRECOMPUTED srcset PER OPTIMISED PHOTOGRAPH.
 *
 * Both the client (src/utils/heroSrcSet.ts) and the prerenderer
 * (scripts/prerender-photos.mjs, which emits <link rel=preload> for the LCP
 * hero of each static page) need the exact same string. A preload whose
 * candidate list differs from the img's by one character is not a slow
 * preload, it is a SECOND DOWNLOAD of the largest image on the page.
 *
 * So neither of them builds it. This does, once, and they both look it up.
 * TypeScript and plain .mjs cannot share a function, but they can share a
 * JSON file.
 *
 * `src` is the widest MOBILE rung where one exists: a browser old enough to
 * ignore srcset is not one to hand a 4289px original to.
 */
const srcsets = {};
for (const src of [...PAGE_HERO_SRCS, ...INLINE_PHOTOS]) {
  const rungs = [];
  for (const [w, path] of Object.entries(manifest[src] ?? {})) rungs.push([Number(w), path]);
  for (const [w, path] of Object.entries(desktopManifest[src] ?? {})) rungs.push([Number(w), path]);
  for (const [w, path] of Object.entries(inlineManifest[src] ?? {})) rungs.push([Number(w), path]);
  if (!rungs.length) continue;
  // The original is a candidate only when its real width is known.
  const width = originalWidths[src];
  if (width) rungs.push([width, src]);
  rungs.sort((a, b) => a[0] - b[0]);
  const mobileRungs = manifest[src] ?? {};
  srcsets[src] = {
    srcset: rungs.map(([w, path]) => `${path} ${w}w`).join(', '),
    src: mobileRungs['1600'] ?? mobileRungs['1280'] ?? (inlineManifest[src] ?? {})['1280'] ?? (inlineManifest[src] ?? {})['640'] ?? src,
  };
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
  const untracked = [...Object.values(manifest), ...Object.values(desktopManifest)]
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

  // Same check on the desktop side. It was never here, and it now guards the
  // page heroes, whose desktop rungs are the ones a 1440px screen actually
  // paints. A rung missing from this manifest is not a blank hero, which is
  // why it could go unnoticed: it is the full-size original served silently.
  const onDiskD = existsSync(desktopManifestPath)
    ? JSON.parse(readFileSync(desktopManifestPath, 'utf-8'))
    : {};
  const driftD = desktopSources.filter(
    (s) => JSON.stringify((onDiskD.rungs ?? {})[s]) !== JSON.stringify(desktopManifest[s]),
  );
  if (driftD.length) {
    console.error('\n[hero-variants] FATAL: hero-variants-desktop.json is out of sync:');
    driftD.forEach((s) => console.error(`  ${s} -> committed:${JSON.stringify((onDiskD.rungs ?? {})[s]) ?? 'MISSING'}`));
    console.error('Run: npm run hero-variants');
    process.exit(1);
  }

  // photo-srcsets.json is the file the bundle imports AND the file the
  // prerenderer reads to emit its preload links. If it drifts, the preload
  // stops matching the img and the page downloads its hero twice.
  const onDiskS = existsSync(srcsetsPath) ? JSON.parse(readFileSync(srcsetsPath, 'utf-8')) : {};
  const driftS = Object.keys(srcsets).filter(
    (k) => JSON.stringify(onDiskS[k]) !== JSON.stringify(srcsets[k]),
  );
  const orphanS = Object.keys(onDiskS).filter((k) => !srcsets[k]);
  if (driftS.length || orphanS.length) {
    console.error('\n[hero-variants] FATAL: photo-srcsets.json is out of sync:');
    driftS.forEach((k) => console.error(`  drifted: ${k}`));
    orphanS.forEach((k) => console.error(`  no longer generated: ${k}`));
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
  // The one both the bundle and the prerenderer read. See the comment above
  // `srcsets` for why it is precomputed rather than derived twice.
  writeFileSync(srcsetsPath, JSON.stringify(srcsets, null, 2) + '\n');
}

console.log(
  `\n[hero-variants] ${generated} generated, ${reused} already current, ${Object.keys(manifest).length} in manifest.`,
);
