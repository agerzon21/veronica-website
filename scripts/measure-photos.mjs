#!/usr/bin/env node
// Walks public/assets/photos (recursively) for .webp files, reads
// each file's natural pixel dimensions via sharp, and writes the
// results as JSON to src/data/photo-dims.json. Runs as part of the
// build so the frontend can compute a justified/masonry layout with
// real aspects at first paint — no reflow while thumbnails load,
// no square-cropping of portraits or landscapes.
//
// The output is keyed by filename (which matches the CSV's
// `filename` column) so photos.ts can look each entry up cheaply.

import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const PHOTOS_DIR = resolve(ROOT, 'public/assets/photos');
const OUTPUT = resolve(ROOT, 'src/data/photo-dims.json');

async function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...(await walk(full)));
    } else if (/\.webp$/i.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

const files = await walk(PHOTOS_DIR);
const dims = {};

// Read dimensions in parallel — sharp's metadata is cheap (just reads
// the header, doesn't decode the pixels).
await Promise.all(
  files.map(async (path) => {
    const filename = path.split('/').pop();
    try {
      const meta = await sharp(path).metadata();
      if (meta.width && meta.height) {
        dims[filename] = { width: meta.width, height: meta.height };
      }
    } catch (err) {
      console.warn(`[measure-photos] skipped ${filename}: ${err.message}`);
    }
  }),
);

// Sort keys for a stable, diff-friendly output file.
const sorted = Object.fromEntries(
  Object.entries(dims).sort(([a], [b]) => a.localeCompare(b)),
);

writeFileSync(OUTPUT, JSON.stringify(sorted, null, 2) + '\n');
console.log(
  `[measure-photos] wrote ${Object.keys(sorted).length} dimensions to ${OUTPUT}`,
);
