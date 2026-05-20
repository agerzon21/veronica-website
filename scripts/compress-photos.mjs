/**
 * Compress oversized gallery photos in place.
 *
 * Usage:
 *   npm install --save-dev sharp
 *   node scripts/compress-photos.mjs --dry-run   # preview only, no writes
 *   node scripts/compress-photos.mjs             # rewrite files in-place
 *   node scripts/compress-photos.mjs -v          # verbose (show skipped files too)
 *
 * Target: under ~300KB per file, max dimension 2400px, WebP quality 80.
 * 2400px @ quality 80 is visually indistinguishable from the original at any
 * typical web viewing size (~typical max display ~1500px wide), but cuts file
 * size by 40-70% vs the camera-out WebP quality.
 *
 * Originals are overwritten. Run with --dry-run first; commit before running
 * for real so you can revert any image that compressed too aggressively.
 */

import { readdir, stat, writeFile, rename } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHOTOS_DIR = join(__dirname, '..', 'public', 'assets', 'photos');
const CATEGORIES = ['portraits', 'weddings', 'family', 'maternity'];

const TARGET_KB = 300;
const MAX_DIM = 2400;
const WEBP_QUALITY = 80;

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('-v') || args.includes('--verbose');

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('Missing dependency: sharp. Install with: npm install --save-dev sharp');
  process.exit(1);
}

async function processDir(category) {
  const dir = join(PHOTOS_DIR, category);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return { processed: 0, skipped: 0, savedBytes: 0 };
  }
  const webps = files.filter((f) => f.toLowerCase().endsWith('.webp'));

  let processed = 0;
  let skipped = 0;
  let savedBytes = 0;

  for (const file of webps) {
    const filepath = join(dir, file);
    const stats = await stat(filepath);
    const sizeKB = stats.size / 1024;

    if (sizeKB <= TARGET_KB) {
      skipped++;
      if (isVerbose) console.log(`  SKIP ${file} (${Math.round(sizeKB)}KB, under target)`);
      continue;
    }

    if (isDryRun) {
      console.log(`  WOULD COMPRESS ${file} (${Math.round(sizeKB)}KB)`);
      continue;
    }

    try {
      const buffer = await sharp(filepath)
        .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 6 })
        .toBuffer();

      const newSizeKB = buffer.length / 1024;
      if (newSizeKB >= sizeKB) {
        skipped++;
        if (isVerbose) console.log(`  SKIP ${file} (recompressed size not smaller)`);
        continue;
      }

      const tmpPath = filepath + '.tmp';
      await writeFile(tmpPath, buffer);
      await rename(tmpPath, filepath);
      savedBytes += stats.size - buffer.length;
      processed++;
      console.log(`  ✓ ${file}: ${Math.round(sizeKB)}KB → ${Math.round(newSizeKB)}KB`);
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }

  return { processed, skipped, savedBytes };
}

console.log(`Compressing photos — target: <${TARGET_KB}KB, max dim: ${MAX_DIM}px, quality: ${WEBP_QUALITY}`);
if (isDryRun) console.log('DRY RUN — no files will be modified');

let totalProcessed = 0;
let totalSkipped = 0;
let totalSaved = 0;
for (const cat of CATEGORIES) {
  console.log(`\n== ${cat} ==`);
  const r = await processDir(cat);
  totalProcessed += r.processed;
  totalSkipped += r.skipped;
  totalSaved += r.savedBytes;
}

console.log(
  `\nDone. Processed ${totalProcessed}, skipped ${totalSkipped}, saved ${(totalSaved / 1024 / 1024).toFixed(2)} MB`,
);
