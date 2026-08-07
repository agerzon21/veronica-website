/**
 * Gallery sync cron — reconciles the gallery_photos table against
 * the Drive "Gallery" parent folder that holds Vero's uploads.
 *
 * Runs on Vercel cron (see vercel.json). Also invokable via
 * /api/admin/gallery-sync-now for "run it now, don't wait for the
 * schedule" from the admin panel.
 *
 * The sync logic, in order:
 *   1. List every image file under the parent folder (via
 *      listFolderTree — one Drive call per subfolder, in parallel).
 *      Each subfolder's name is the category (case-insensitive match
 *      against the four gallery categories; unknown folders skipped
 *      with a log warning).
 *   2. For each Drive file:
 *        - If we already have a row with the same drive_file_id →
 *          just refresh drive_seen_at. Don't touch anything else
 *          (preserves any human edits to title/alt/description/slug
 *          from the admin panel).
 *        - If new → call OpenAI Vision to draft metadata. Insert a
 *          row with status='draft' so it doesn't go public until
 *          Vero reviews it in the admin panel.
 *   3. Any row whose drive_seen_at wasn't touched this run → soft
 *      delete (set deleted_at). We never hard-delete; that way a
 *      file Vero moved out and back into Drive gets restored with
 *      its old metadata intact.
 *   4. If anything actually changed (new/deleted/restored), fire
 *      the Vercel Deploy Hook so the prerendered per-photo HTML
 *      pages refresh with the new set.
 *
 * Concurrency + limits:
 *   - Vision calls happen with concurrency 4 so we don't blast
 *     OpenAI on the first run (which might have hundreds of
 *     unclassified photos).
 *   - Caps at MAX_NEW_PER_RUN new photos per invocation; the
 *     rest carry over to the next scheduled run. Keeps us under
 *     Vercel's function timeout even on a big initial import.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import {
  extractFolderId,
  listFolderTree,
  type DriveFile,
  type FolderSection,
} from '../_drive.js';
import { describePhoto, type VisionResult } from '../_ai-vision.js';

type Category = 'portraits' | 'weddings' | 'family' | 'maternity';
const CATEGORIES: readonly Category[] = ['portraits', 'weddings', 'family', 'maternity'] as const;

// How many new photos to process per cron run. Bounded so a big
// initial import doesn't blow past Vercel's function timeout in
// one shot — leftovers get picked up on the next scheduled run.
const MAX_NEW_PER_RUN = 20;

// Concurrency for the OpenAI Vision fan-out. Vision calls take
// ~1-3s each; parallelizing 4 at a time makes 20 photos take
// ~10-15s of wall time instead of ~60s.
const VISION_CONCURRENCY = 4;

interface ExistingRow {
  id: string;
  drive_file_id: string;
  deleted_at: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Folder id is admin-editable — stored in system_state so a
  // non-technical operator can set it from the Gallery tab without
  // touching Vercel env vars. Env var still respected as a fallback
  // for backwards-compat with any existing deploy that has it set.
  try {
    const sql = getDb();
    const stateRows = (await sql`
      SELECT value FROM system_state WHERE key = 'gallery_drive_folder_id' LIMIT 1
    `) as Array<{ value: string | null }>;
    const dbValue = stateRows[0]?.value ?? null;
    const folderUrl = dbValue ?? process.env.GALLERY_DRIVE_FOLDER_ID ?? '';

    if (!folderUrl) {
      return res.status(400).json({
        success: false,
        error:
          "Gallery folder isn't configured yet. Set it from Admin → Gallery → Change folder.",
      });
    }
    const folderId = extractFolderId(folderUrl);
    if (!folderId) {
      return res.status(400).json({
        success: false,
        error: `Could not extract a Drive folder id from '${folderUrl}'. Paste the Drive folder URL (or its id) into Admin → Gallery → Change folder.`,
      });
    }

    // ── 1. Discover: list every image in every category subfolder ──
    const tree = await listFolderTree(folderId);
    // Root files are ignored — Vero organizes into per-category
    // subfolders; anything at the root is a mistake and shouldn't
    // silently appear in some default category.
    const perCategory = groupByCategory(tree.sections);
    const driveFiles: Array<{ category: Category; file: DriveFile }> = [];
    for (const [category, files] of perCategory) {
      for (const file of files) driveFiles.push({ category, file });
    }

    // ── 2. Pull all existing rows in one query for diffing ──
    const existingRows = (await sql`
      SELECT id, drive_file_id, deleted_at FROM gallery_photos
    `) as ExistingRow[];
    const byDriveId = new Map<string, ExistingRow>();
    for (const r of existingRows) byDriveId.set(r.drive_file_id, r);

    // Bucket into { existing (refresh timestamp), restored (undelete
    // + refresh), new (needs Vision + insert) }.
    const toRefresh: string[] = [];  // drive_file_ids currently in Drive AND DB
    const toRestore: string[] = [];  // in Drive + DB but soft-deleted
    const toInsert: Array<{ category: Category; file: DriveFile }> = [];
    for (const { category, file } of driveFiles) {
      const existing = byDriveId.get(file.id);
      if (!existing) {
        toInsert.push({ category, file });
      } else if (existing.deleted_at) {
        toRestore.push(file.id);
      } else {
        toRefresh.push(file.id);
      }
    }

    // Anything in DB but NOT in Drive today = soft delete
    const seenDriveIds = new Set(driveFiles.map((d) => d.file.id));
    const toSoftDelete = existingRows
      .filter((r) => !seenDriveIds.has(r.drive_file_id) && !r.deleted_at)
      .map((r) => r.drive_file_id);

    // ── 3. Refresh + restore in a single pass ──
    if (toRefresh.length > 0) {
      await sql`
        UPDATE gallery_photos
        SET drive_seen_at = NOW()
        WHERE drive_file_id = ANY(${toRefresh})
      `;
    }
    if (toRestore.length > 0) {
      await sql`
        UPDATE gallery_photos
        SET deleted_at = NULL, drive_seen_at = NOW()
        WHERE drive_file_id = ANY(${toRestore})
      `;
    }
    if (toSoftDelete.length > 0) {
      await sql`
        UPDATE gallery_photos
        SET deleted_at = NOW()
        WHERE drive_file_id = ANY(${toSoftDelete})
      `;
    }

    // ── 4. Insert new photos — bounded + concurrent Vision calls ──
    const batch = toInsert.slice(0, MAX_NEW_PER_RUN);
    const inserted: string[] = [];
    const insertFailures: Array<{ file: string; error: string }> = [];

    await mapWithConcurrency(batch, VISION_CONCURRENCY, async ({ category, file }) => {
      try {
        const vision = await describePhoto(file.thumbnailUrl, category);
        // Slug uniqueness: append a short suffix on collision. We
        // check by inserting with ON CONFLICT and retrying with an
        // incrementing suffix — simple and race-safe.
        const finalSlug = await insertWithUniqueSlug(
          sql,
          vision,
          file,
          category,
        );
        inserted.push(finalSlug);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        insertFailures.push({ file: file.name, error: msg });
        console.error(`[gallery-sync] insert failed for ${file.name}:`, err);
      }
    });

    const remainingNew = Math.max(0, toInsert.length - batch.length);

    // ── 5. Trigger a Vercel deploy so prerendered HTML pages
    //     refresh with the new set. Only fire if the set of live
    //     photos actually changed — a pure "refresh timestamps"
    //     run doesn't need to redeploy.
    const changed =
      inserted.length > 0 || toRestore.length > 0 || toSoftDelete.length > 0;
    let deployTriggered = false;
    if (changed) {
      deployTriggered = await triggerDeployHook();
    }

    return res.status(200).json({
      success: true,
      driveFilesSeen: driveFiles.length,
      inserted: inserted.length,
      insertedSlugs: inserted,
      restored: toRestore.length,
      softDeleted: toSoftDelete.length,
      refreshed: toRefresh.length,
      insertFailures,
      remainingNewNextRun: remainingNew,
      deployTriggered,
    });
  } catch (err) {
    console.error('[gallery-sync] handler failed:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Sync failed',
    });
  }
}

/**
 * Groups a Drive folder tree's sections into { category → files }.
 * Case-insensitive match against our four categories; sections
 * whose name doesn't match any category are skipped with a warn
 * (so Vero adding a "reference" or "temp" folder doesn't cause
 * mysterious photos to appear in the wrong category).
 */
function groupByCategory(sections: FolderSection[]): Map<Category, DriveFile[]> {
  const out = new Map<Category, DriveFile[]>();
  for (const cat of CATEGORIES) out.set(cat, []);
  for (const s of sections) {
    const normalized = s.name.trim().toLowerCase() as Category;
    if (!CATEGORIES.includes(normalized)) {
      console.warn(`[gallery-sync] unknown category folder '${s.name}' — skipping ${s.files.length} files`);
      continue;
    }
    out.get(normalized)!.push(...s.files);
  }
  return out;
}

/**
 * Insert a new gallery row, resolving slug collisions with a
 * numeric suffix (e.g. "sunset-portrait", "sunset-portrait-2",
 * "sunset-portrait-3"). Returns the slug that was actually
 * inserted. Race-safe via the DB's UNIQUE constraint + retry.
 */
async function insertWithUniqueSlug(
  sql: ReturnType<typeof getDb>,
  vision: VisionResult,
  file: DriveFile,
  category: Category,
): Promise<string> {
  const baseSlug = vision.slug || fallbackSlug(file.name);
  let candidate = baseSlug;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      await sql`
        INSERT INTO gallery_photos (
          slug, category,
          drive_file_id, drive_filename,
          title, alt, description, keywords,
          width, height,
          status
        ) VALUES (
          ${candidate}, ${category},
          ${file.id}, ${file.name},
          ${vision.title}, ${vision.alt}, ${vision.description}, ${vision.keywords},
          ${file.width}, ${file.height},
          'draft'
        )
      `;
      return candidate;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Unique-violation on slug → append/increment suffix + retry.
      // drive_file_id unique-violation → someone raced us; fine,
      // treat as "already inserted" and exit.
      if (msg.includes('gallery_photos_slug_key') || msg.includes('gallery_photos_slug_idx')) {
        candidate = `${baseSlug}-${attempt + 1}`;
        continue;
      }
      if (msg.includes('gallery_photos_drive_file_id_key')) {
        return candidate;
      }
      throw err;
    }
  }
  throw new Error(`Could not find a unique slug for '${baseSlug}' after 20 attempts`);
}

function fallbackSlug(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'untitled-photo';
}

/**
 * Bounded-concurrency map. Runs `fn` over every item in `items`
 * with at most `limit` in flight at a time. Errors inside `fn`
 * don't stop other work — the caller is expected to handle them
 * inside the callback.
 */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

/**
 * POSTs to the Vercel Deploy Hook so the prerendered per-photo
 * static HTML pages get regenerated with the new set. No-op if
 * the env var isn't set (local dev, or the hook hasn't been
 * created yet — the site still works, just static HTML doesn't
 * auto-refresh).
 */
async function triggerDeployHook(): Promise<boolean> {
  const url = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!url) {
    console.log('[gallery-sync] VERCEL_DEPLOY_HOOK_URL not set — skipping redeploy trigger');
    return false;
  }
  try {
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      console.warn(`[gallery-sync] deploy hook returned ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[gallery-sync] deploy hook failed:', err);
    return false;
  }
}
