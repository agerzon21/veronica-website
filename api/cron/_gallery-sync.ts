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
import { runGuarded, type CronTrigger } from './_guard.js';

// Cron metadata registered into cron_jobs on the first run. Kept as a
// const so a grep for "gallery-sync" lands on the truth (schedule
// stays in sync with vercel.json by convention — the guard re-upserts
// on every invocation, so any manual drift auto-heals).
const CRON_META = {
  name: 'gallery-sync',
  path: '/api/cron/gallery-sync',
  schedule: '0 2 * * *',
  description:
    'Daily at 2:00 UTC: reconciles gallery_photos against the Drive Gallery folder. New photos get AI-drafted metadata; removed ones are soft-deleted.',
} as const;

type Category = 'portraits' | 'weddings' | 'family' | 'maternity';
const CATEGORIES: readonly Category[] = ['portraits', 'weddings', 'family', 'maternity'] as const;

// How many new photos to process per cron run. Bounded so a big
// initial import doesn't blow past Vercel's function timeout in
// one shot — leftovers get picked up on the next scheduled run.
/**
 * Mass-deletion guard thresholds. A run will not soft-delete more than
 * MAX_FRACTION of the live photos, and never trips below MIN_ABS so that
 * ordinary pruning of a handful of photos is unaffected.
 *
 * At the current 227 live photos the ceiling is 45, so removing any one
 * category (the smallest is 19, the largest 97) still passes for maternity and
 * family but stops weddings and portraits — which is the intent: the guard is
 * for "a whole chunk vanished at once", not for routine edits.
 */
const SOFT_DELETE_MAX_FRACTION = 0.2;
const SOFT_DELETE_MIN_ABS = 10;

const MAX_NEW_PER_RUN = 20;

// Concurrency for the OpenAI Vision fan-out. Vision calls take
// ~1-3s each; parallelizing 4 at a time makes 20 photos take
// ~10-15s of wall time instead of ~60s.
const VISION_CONCURRENCY = 4;

interface ExistingRow {
  id: string;
  drive_file_id: string;
  deleted_at: string | null;
  category: string;
}

// Sentinel error thrown for a misconfigured Drive folder. The guard
// treats it like any other throw (marks the run as 'error' with this
// message), and the outer handler unwraps it to a 400 rather than
// the default 500 — the operator-facing error message is user-facing.
class ConfigError extends Error {}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // The admin "Run now" button + the "Sync from Drive" admin action
  // both invoke this handler with ?trigger=manual so the history
  // table can distinguish scheduled runs from human-triggered ones.
  const rawTrigger = req.query?.trigger;
  const trigger: CronTrigger =
    (Array.isArray(rawTrigger) ? rawTrigger[0] : rawTrigger) === 'manual'
      ? 'manual'
      : 'schedule';

  const result = await runGuarded({ ...CRON_META, trigger }, doGallerySync);

  if (result.skipped) {
    return res.status(200).json({ success: true, skipped: true });
  }
  if (result.error) {
    // Config errors from the "folder not set" branch surface as 400.
    // Every other error is a server-side sync failure (500).
    const isConfig = /Gallery folder|extract a Drive folder/.test(result.error);
    return res
      .status(isConfig ? 400 : 500)
      .json({ success: false, error: result.error });
  }
  return res.status(200).json({ success: true, ...(result.ok ?? {}) });
}

/**
 * The reconciliation body — separated from the HTTP handler so
 * runGuarded() can time it and record enabled / disabled cleanly.
 * Returns a payload the handler splats into JSON.
 */
async function doGallerySync() {
  // Folder id is admin-editable — stored in system_state so a
  // non-technical operator can set it from the Gallery tab without
  // touching Vercel env vars. Env var still respected as a fallback
  // for backwards-compat with any existing deploy that has it set.
  const sql = getDb();
  const stateRows = (await sql`
    SELECT value FROM system_state WHERE key = 'gallery_drive_folder_id' LIMIT 1
  `) as Array<{ value: string | null }>;
  const dbValue = stateRows[0]?.value ?? null;
  const folderUrl = dbValue ?? process.env.GALLERY_DRIVE_FOLDER_ID ?? '';

  if (!folderUrl) {
    throw new ConfigError(
      "Gallery folder isn't configured yet. Set it from Admin → Gallery → Change folder.",
    );
  }
  const folderId = extractFolderId(folderUrl);
  if (!folderId) {
    throw new ConfigError(
      `Could not extract a Drive folder id from '${folderUrl}'. Paste the Drive folder URL (or its id) into Admin → Gallery → Change folder.`,
    );
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
    SELECT id, drive_file_id, deleted_at, category FROM gallery_photos
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
  const missingFromDrive = existingRows
    .filter((r) => !seenDriveIds.has(r.drive_file_id) && !r.deleted_at)
    .map((r) => r.drive_file_id);

  // ── Mass-deletion guard ───────────────────────────────────────────────
  //
  // "Not in the Drive listing" is trusted to mean "deleted from Drive", but a
  // short listing looks exactly the same. Ways that happens WITHOUT anyone
  // deleting a photo:
  //
  //   - a category subfolder is renamed or moved (listFolderTree matches
  //     sections by name, so it silently stops contributing files)
  //   - a subfolder listing succeeds but comes back empty; listFolderTree
  //     drops empty sections, so the whole category vanishes from the tree
  //   - permissions or sharing change on one folder
  //
  // Any of those would soft-delete an entire category on the 2am cron, and the
  // public gallery would be missing a third of its photos until someone
  // noticed. A thrown error is safe (the run aborts before this point); a
  // quietly-short listing is not.
  //
  // So: refuse implausibly large deletions rather than perform them. Small
  // prunes pass untouched. Genuine bulk removal is done from the admin gallery
  // screen, which is explicit and immediate.
  const liveRows = existingRows.filter((r) => !r.deleted_at);
  const liveCount = liveRows.length;

  // A whole category disappearing in one run is the folder-rename signature,
  // and it is not caught by the percentage ceiling — maternity is only 19 of
  // 227 photos, well under it, yet losing all of maternity is exactly the
  // failure this guard exists for. So treat "every live photo in some category
  // is suddenly missing" as blocking on its own, at any size.
  const missingSet = new Set(missingFromDrive);
  const wipedCategories = [...new Set(liveRows.map((r) => r.category))].filter(
    (category) => {
      const live = liveRows.filter((r) => r.category === category);
      return live.length > 0 && live.every((r) => missingSet.has(r.drive_file_id));
    },
  );
  const softDeleteCeiling = Math.max(
    SOFT_DELETE_MIN_ABS,
    Math.floor(liveCount * SOFT_DELETE_MAX_FRACTION),
  );
  // An empty listing is always suspect when we hold photos: it is what a total
  // listing failure looks like when it does not throw.
  const listingLooksEmpty = driveFiles.length === 0 && liveCount > 0;
  const softDeleteBlocked =
    listingLooksEmpty ||
    wipedCategories.length > 0 ||
    missingFromDrive.length > softDeleteCeiling;

  const toSoftDelete = softDeleteBlocked ? [] : missingFromDrive;
  if (softDeleteBlocked) {
    console.error(
      `[gallery-sync] REFUSED to soft-delete ${missingFromDrive.length} of ${liveCount} live photos ` +
        `(ceiling ${softDeleteCeiling}, drive listing had ${driveFiles.length} files` +
        `${wipedCategories.length ? `, categories wiped: ${wipedCategories.join(', ')}` : ''}). ` +
        `Nothing was deleted.`,
    );
  }

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

  // Raised AFTER every safe operation (refresh, restore, insert) has already
  // been committed, so a tripped guard never blocks the harmless work.
  //
  // Thrown rather than returned because runGuarded only records 'ok' or
  // 'error': a returned flag would finalize the run green with no message, and
  // the whole point is that someone has to SEE this. It surfaces in the Crons
  // panel as a failed run with this text.
  if (softDeleteBlocked) {
    throw new Error(
      `Refused to soft-delete ${missingFromDrive.length} of ${liveCount} live photos ` +
        `(ceiling ${softDeleteCeiling}; Drive listing returned ${driveFiles.length} files` +
        `${wipedCategories.length ? `; entire categories missing: ${wipedCategories.join(', ')}` : ''}). ` +
        `Nothing was deleted. Check that no category subfolder in Drive was renamed, ` +
        `moved, or had its sharing changed. If the removal is intentional, delete the ` +
        `photos from the admin Gallery screen instead.`,
    );
  }

  return {
    driveFilesSeen: driveFiles.length,
    inserted: inserted.length,
    insertedSlugs: inserted,
    restored: toRestore.length,
    softDeleted: toSoftDelete.length,
    softDeleteBlocked,
    refreshed: toRefresh.length,
    insertFailures,
    remainingNewNextRun: remainingNew,
    deployTriggered,
  };
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
