#!/usr/bin/env node
// One-shot migration script: populate gallery_photos DB rows for the
// 205 existing gallery photos, matching each Drive file to its
// current CSV metadata by filename so every slug + title + alt +
// description + keywords carries over unchanged. Existing
// /photo/<cat>/<slug> URLs keep resolving after cutover.
//
// Usage:
//   1. Upload public/assets/photos/{portraits,weddings,family,maternity}/
//      to a Drive "Gallery" folder with matching subfolder names.
//   2. Share the parent folder with the service account (viewer OK).
//   3. Set env vars (probably in .env.local — `vercel env pull` if needed):
//        POSTGRES_URL, GOOGLE_SERVICE_ACCOUNT_JSON, GALLERY_DRIVE_FOLDER_ID
//   4. Dry run (default — prints what WOULD happen, changes nothing):
//        node scripts/migrate-gallery-to-drive.mjs
//   5. Actually commit to the DB after reviewing dry-run output:
//        node scripts/migrate-gallery-to-drive.mjs --commit
//
// The script is idempotent — running it twice does nothing on the
// second run (dup drive_file_id → skipped). Safe to re-run after
// uploading more files.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { google } from 'googleapis';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load .env.local (Vercel-style env file) so this runs from a plain
// shell without needing to `source` anything.
config({ path: join(root, '.env.local') });
config({ path: join(root, '.env') });

const COMMIT = process.argv.includes('--commit');
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const CATEGORIES = new Set(['portraits', 'weddings', 'family', 'maternity']);

// ─── Env checks ────────────────────────────────────────────────
const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) exitWith('POSTGRES_URL env var is missing.');
const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) exitWith('GOOGLE_SERVICE_ACCOUNT_JSON env var is missing.');

// Folder id: prefer the value from system_state (what the admin
// panel writes to), fall back to env var for backwards-compat with
// pre-admin-UI setups. Same precedence as the sync cron uses.
const sqlEarly = neon(dbUrl);
const stateRows = await sqlEarly`
  SELECT value FROM system_state WHERE key = 'gallery_drive_folder_id' LIMIT 1
`;
const dbFolder = stateRows[0]?.value ?? null;
const folderInput = dbFolder ?? process.env.GALLERY_DRIVE_FOLDER_ID ?? '';
if (!folderInput) {
  exitWith(
    "Gallery folder isn't configured. Set it via Admin → Gallery → Set up Drive folder (writes to system_state), or export GALLERY_DRIVE_FOLDER_ID in your shell.",
  );
}
console.log(`[migrate] Using folder ${dbFolder ? '(from DB)' : '(from env var)'}: ${folderInput}`);

const folderId = extractFolderId(folderInput);
if (!folderId) exitWith(`Could not extract folder id from '${folderInput}'.`);

// ─── Google Drive setup ────────────────────────────────────────
let serviceCreds;
try {
  serviceCreds = JSON.parse(serviceAccountJson);
} catch (err) {
  exitWith(`GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ${err.message}`);
}
const auth = new google.auth.GoogleAuth({
  credentials: serviceCreds,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

// ─── Read CSV ──────────────────────────────────────────────────
const csvPath = join(root, 'src', 'data', 'photos.csv');
const csvRaw = readFileSync(csvPath, 'utf-8');
const csvRows = parseCsv(csvRaw);
const csvHeader = csvRows[0];
const csvIdx = {
  filename: csvHeader.indexOf('filename'),
  category: csvHeader.indexOf('category'),
  alt: csvHeader.indexOf('alt'),
  title: csvHeader.indexOf('title'),
  description: csvHeader.indexOf('description'),
  keywords: csvHeader.indexOf('keywords'),
};

// { filename → { slug, category, title, alt, description, keywords[] } }
// Only gallery categories (skip 'site' backgrounds).
const csvByFilename = new Map();
for (const row of csvRows.slice(1)) {
  const filename = (row[csvIdx.filename] ?? '').trim();
  const category = (row[csvIdx.category] ?? '').trim();
  const title = (row[csvIdx.title] ?? '').trim();
  if (!filename || !CATEGORIES.has(category) || !title) continue;
  csvByFilename.set(filename, {
    filename,
    slug: filename.replace(/\.webp$/i, ''),
    category,
    title,
    alt: (row[csvIdx.alt] ?? '').trim(),
    description: (row[csvIdx.description] ?? '').trim(),
    keywords: (row[csvIdx.keywords] ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
  });
}

console.log(`[migrate] Loaded ${csvByFilename.size} gallery photos from CSV.`);

// ─── List the Drive Gallery folder tree ────────────────────────
const tree = await listGalleryTree(drive, folderId);
console.log(`[migrate] Drive folder tree: ${tree.sections.length} subfolder(s), ${tree.rootFiles.length} root file(s).`);

// Flatten into { category, file } pairs, only picking known categories.
const drivePairs = [];
for (const section of tree.sections) {
  const cat = section.name.trim().toLowerCase();
  if (!CATEGORIES.has(cat)) {
    console.warn(`[migrate] Skipping unknown category folder: "${section.name}" (${section.files.length} files)`);
    continue;
  }
  for (const f of section.files) drivePairs.push({ category: cat, file: f });
}
console.log(`[migrate] ${drivePairs.length} image files in Drive under known categories.`);

// ─── Diff: match Drive files ↔ CSV rows ────────────────────────
const matched = [];
const driveUnmatched = [];
for (const { category, file } of drivePairs) {
  const csv = csvByFilename.get(file.name);
  if (csv) {
    // Sanity: CSV category should match Drive folder category.
    if (csv.category !== category) {
      console.warn(
        `[migrate] Category mismatch for "${file.name}": CSV says "${csv.category}", Drive folder is "${category}" — using Drive folder.`,
      );
    }
    matched.push({ csv, driveFile: file, category });
  } else {
    driveUnmatched.push({ category, file });
  }
}

const csvUnmatched = [...csvByFilename.values()].filter(
  (c) => !drivePairs.some((p) => p.file.name === c.filename),
);

console.log('');
console.log(`[migrate] ── DIFF ─────────────────────────────`);
console.log(`  Matched (CSV ↔ Drive):      ${matched.length}`);
console.log(`  In Drive, missing from CSV: ${driveUnmatched.length}`);
console.log(`  In CSV, missing from Drive: ${csvUnmatched.length}`);
if (driveUnmatched.length > 0) {
  console.log('');
  console.log('  Files in Drive without CSV metadata (would be inserted as drafts with empty fields):');
  for (const { category, file } of driveUnmatched.slice(0, 10)) {
    console.log(`    - [${category}] ${file.name}`);
  }
  if (driveUnmatched.length > 10) console.log(`    ...and ${driveUnmatched.length - 10} more.`);
}
if (csvUnmatched.length > 0) {
  console.log('');
  console.log('  Files in CSV without matching Drive upload (WILL NOT be migrated — upload them first):');
  for (const csv of csvUnmatched.slice(0, 10)) {
    console.log(`    - [${csv.category}] ${csv.filename}`);
  }
  if (csvUnmatched.length > 10) console.log(`    ...and ${csvUnmatched.length - 10} more.`);
}

// ─── Insert into DB ────────────────────────────────────────────
if (!COMMIT) {
  console.log('');
  console.log('[migrate] Dry run complete. Re-run with --commit to actually write to the DB.');
  process.exit(0);
}

console.log('');
console.log('[migrate] --commit specified. Writing to DB...');
const sql = sqlEarly;

let inserted = 0;
let skipped = 0;
let failed = 0;

// Insert matched rows first — they get the full CSV metadata + go
// straight to 'published' status (they're already live on the site).
for (const { csv, driveFile, category } of matched) {
  try {
    const result = await sql`
      INSERT INTO gallery_photos (
        slug, category,
        drive_file_id, drive_filename,
        title, alt, description, keywords,
        width, height,
        status, published_at
      ) VALUES (
        ${csv.slug}, ${category},
        ${driveFile.id}, ${driveFile.name},
        ${csv.title}, ${csv.alt}, ${csv.description}, ${csv.keywords},
        ${driveFile.width ?? null}, ${driveFile.height ?? null},
        'published', NOW()
      )
      ON CONFLICT (drive_file_id) DO NOTHING
      RETURNING id
    `;
    if (result.length > 0) inserted++;
    else skipped++;
  } catch (err) {
    failed++;
    console.error(`[migrate]   FAILED [${category}] ${driveFile.name}: ${err.message}`);
  }
}

// Insert unmatched Drive files as drafts with empty metadata —
// Vero can edit them in the admin panel. This handles the case
// where she uploaded NEW photos to Drive during the migration
// window that aren't in the CSV yet.
for (const { category, file } of driveUnmatched) {
  try {
    const fallbackSlug = file.name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || `untitled-${Date.now()}`;
    const result = await sql`
      INSERT INTO gallery_photos (
        slug, category,
        drive_file_id, drive_filename,
        title, alt, description, keywords,
        width, height,
        status
      ) VALUES (
        ${fallbackSlug}, ${category},
        ${file.id}, ${file.name},
        '', '', '', ${[category]},
        ${file.width ?? null}, ${file.height ?? null},
        'draft'
      )
      ON CONFLICT (drive_file_id) DO NOTHING
      RETURNING id
    `;
    if (result.length > 0) inserted++;
    else skipped++;
  } catch (err) {
    failed++;
    console.error(`[migrate]   FAILED [${category}] ${file.name}: ${err.message}`);
  }
}

console.log('');
console.log(`[migrate] DB write complete: ${inserted} inserted, ${skipped} already existed, ${failed} failed.`);
if (csvUnmatched.length > 0) {
  console.log('');
  console.log(`[migrate] REMINDER: ${csvUnmatched.length} CSV row(s) had no matching Drive upload.`);
  console.log(`[migrate] Upload those files to Drive and re-run this script — it's safe to run again.`);
}

// ─── Helpers ───────────────────────────────────────────────────

function exitWith(msg) {
  console.error(`[migrate] ERROR: ${msg}`);
  process.exit(1);
}

function extractFolderId(input) {
  const s = input.trim();
  const match = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return '';
}

async function listGalleryTree(drive, parentFolderId) {
  // Fetch immediate children (files + subfolders) with dims metadata.
  const fields = 'files(id, name, mimeType, size, imageMediaMetadata(width, height), videoMediaMetadata(width, height))';
  const rootRes = await drive.files.list({
    q: `'${parentFolderId}' in parents and trashed = false`,
    fields,
    pageSize: 1000,
    orderBy: 'name',
  });
  const items = rootRes.data.files ?? [];
  const subFolders = items
    .filter((f) => f.mimeType === FOLDER_MIME)
    .sort(natCmp);
  const rootFiles = items.filter(isMediaFile).sort(natCmp).map(toDriveFile);

  // Fan out over subfolders in parallel — typical gallery has 4.
  const sections = await Promise.all(
    subFolders
      .filter((f) => f.id && f.name)
      .map(async (folder) => ({
        id: folder.id,
        name: folder.name,
        files: await listMediaInFolder(drive, folder.id, fields),
      })),
  );

  return { rootFiles, sections };
}

async function listMediaInFolder(drive, folderId, fields) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`,
    fields,
    pageSize: 1000,
    orderBy: 'name',
  });
  return (res.data.files ?? [])
    .filter((f) => f.id && f.name && f.mimeType)
    .sort(natCmp)
    .map(toDriveFile);
}

function toDriveFile(f) {
  const meta = f.imageMediaMetadata ?? f.videoMediaMetadata ?? null;
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size ? parseInt(f.size, 10) : null,
    width: typeof meta?.width === 'number' ? meta.width : null,
    height: typeof meta?.height === 'number' ? meta.height : null,
  };
}

function isMediaFile(f) {
  return Boolean(
    f.mimeType?.startsWith('image/') || f.mimeType?.startsWith('video/'),
  );
}

function natCmp(a, b) {
  return (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true, sensitivity: 'base' });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}
