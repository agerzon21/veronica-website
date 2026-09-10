/**
 * Export every published public-gallery photo to a static file at build time.
 *
 * WHY THIS EXISTS
 *
 * The public gallery serves all 227 photos through /api/photo, a Drive proxy.
 * That means every photo crosses Compute -> CDN, which is what Vercel bills as
 * Fast Origin Transfer, and the CDN cache resets on every deploy, so the whole
 * set is re-fetched each time. Measured: ~532 KB per photo, ~121 MB per deploy.
 *
 * A static file under public/assets/photos/ is served straight from the CDN and
 * never touches a function, so it costs nothing and cannot be used to drain the
 * quota. The proxy stays for client-gallery downloads, which genuinely need it.
 *
 * WHY THE GALLERY IS ON DRIVE AT ALL
 *
 * So Veronika can drop a photo into a Drive folder and have it appear without
 * anyone rebuilding anything. That workflow is preserved: the nightly sync adds
 * the row and triggers a rebuild, and this script bakes the file in during that
 * rebuild. A photo is simply not shown until it has a file, which is a few
 * hours' delay nobody notices, rather than a permanent per-view cost.
 *
 * WHAT IT WRITES
 *
 *   public/assets/photos/<category>/<slug>.webp   — resized, one per photo
 *   api/_gallery-statics.json                     — the manifest api/gallery.ts
 *                                                   filters on, so a photo the
 *                                                   build could not export is
 *                                                   hidden rather than broken
 *
 * MODES
 *
 *   node scripts/build-gallery-statics.mjs           export anything missing
 *   node scripts/build-gallery-statics.mjs --check   fail if anything is missing
 *
 * The --check mode is what stops a photo silently disappearing: if a published
 * row has no file and cannot get one, the build fails loudly instead of
 * deploying a gallery with holes in it.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { google } from 'googleapis';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS_DIR = join(root, 'public/assets/photos');
const MANIFEST = join(root, 'api/_gallery-statics.json');
const CHECK = process.argv.includes('--check');
/**
 * Strict on Vercel, tolerant on a laptop. GOOGLE_SERVICE_ACCOUNT_JSON is a
 * sensitive var that does not pull locally, so a hard failure would make the
 * project unbuildable off CI. In CI a missing export is a real problem and must
 * stop the deploy; locally it just means those photos are absent from your dev
 * build, which is harmless.
 */
const STRICT = process.env.VERCEL === '1' || process.env.CI === 'true';

/**
 * 2400px matches what the proxy already produces, so nothing about how a photo
 * looks changes. Several of the legacy static files are far larger than this
 * (up to 3902x6000) and re-encoding them at 2400 makes the deployment smaller,
 * which also helps the deployment-storage quota.
 */
const MAX_WIDTH = 2400;
const WEBP_QUALITY = 82;

function loadEnv() {
  // Vercel injects real env vars in CI; locally fall back to .env.local.
  if (process.env.POSTGRES_URL || process.env.DATABASE_URL) return;
  const p = join(root, '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

function driveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    return null;
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

const relPath = (p) => `assets/photos/${p.category}/${p.slug}.webp`;
const absPath = (p) => join(PHOTOS_DIR, p.category, `${p.slug}.webp`);

async function main() {
  loadEnv();
  const url = process.env.POSTGRES_URL_LOCAL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('gallery-statics: no database url — cannot determine which photos are published');
    process.exit(1);
  }
  const sql = neon(url);
  const photos = await sql`
    SELECT slug, category, drive_file_id FROM gallery_photos
    WHERE deleted_at IS NULL AND status = 'published'
    ORDER BY category, slug
  `;

  const missing = photos.filter((p) => !existsSync(absPath(p)));
  console.log(`gallery-statics: ${photos.length} published photos, ${missing.length} without a static file`);

  if (CHECK) {
    if (missing.length) {
      const log = STRICT ? console.error : console.warn;
      log(`\ngallery-statics --check: ${missing.length} published photo(s) have no static file:`);
      for (const p of missing.slice(0, 20)) log(`  ${p.category}/${p.slug}`);
      if (missing.length > 20) log(`  … and ${missing.length - 20} more`);
      if (STRICT) {
        console.error('\nRun: node scripts/build-gallery-statics.mjs');
        process.exit(1);
      }
      console.warn('  (local build — these will simply be absent from the gallery here)');
    } else {
      console.log('gallery-statics --check: every published photo has a static file.');
    }
    writeManifest(photos.filter((p) => existsSync(absPath(p))));
    process.exit(0);
  }

  if (missing.length) {
    const drive = driveClient();
    if (!drive) {
      const msg =
        'gallery-statics: GOOGLE_SERVICE_ACCOUNT_JSON is missing or unparseable, so ' +
        `${missing.length} photo(s) cannot be exported.`;
      if (STRICT) {
        console.error(`${msg} Refusing to continue: shipping now would hide them from the gallery.`);
        process.exit(1);
      }
      console.warn(`${msg} Local build — continuing without them.`);
      writeManifest(photos.filter((p) => existsSync(absPath(p))));
      return;
    }
    let done = 0;
    for (const p of missing) {
      const out = absPath(p);
      mkdirSync(dirname(out), { recursive: true });
      const res = await drive.files.get(
        { fileId: p.drive_file_id, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      const buf = Buffer.from(res.data);
      await sharp(buf)
        .rotate() // honour EXIF orientation, same as the proxy
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(out);
      done++;
      console.log(`  exported ${p.category}/${p.slug} (${Math.round(statSync(out).size / 1024)} KB)  ${done}/${missing.length}`);
    }
  }

  const present = photos.filter((p) => existsSync(absPath(p)));
  if (present.length !== photos.length && STRICT) {
    console.error(`gallery-statics: ${photos.length - present.length} photo(s) still missing after export — failing`);
    process.exit(1);
  }
  writeManifest(present);
  console.log(`gallery-statics: ${present.length} photos available as static files.`);
}

function writeManifest(present) {
  const manifest = Object.fromEntries(present.map((p) => [`${p.category}/${p.slug}`, relPath(p)]));
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`gallery-statics: wrote manifest with ${Object.keys(manifest).length} entries`);
}

main().catch((err) => {
  console.error('gallery-statics failed:', err?.message || err);
  process.exit(1);
});
