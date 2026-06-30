/**
 * Google Drive API helpers — list files in a folder + build URLs for display
 * and download. Uses a service-account JSON credential stored in the
 * GOOGLE_SERVICE_ACCOUNT_JSON env var.
 *
 * The service account must be granted Viewer access on the parent folder
 * (Veronika does this once when she creates a new client subfolder, or once
 * on a parent folder that all subfolders inherit from). See CLIENT_PORTAL.md.
 */

import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';

let cachedDrive: drive_v3.Drive | null = null;

function parseCredentials(): object {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON env var is missing. Add the service account JSON contents in Vercel → Settings → Environment Variables.',
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ${err}`);
  }
}

function getDrive(): drive_v3.Drive {
  if (cachedDrive) return cachedDrive;
  const auth = new google.auth.GoogleAuth({
    credentials: parseCredentials() as Record<string, string>,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  cachedDrive = google.drive({ version: 'v3', auth });
  return cachedDrive;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  // File size in bytes. May be null for files Drive doesn't report size on
  // (rare for images/video — mostly affects Google-native docs). Used on
  // the frontend to route huge files away from the in-app save flow.
  size: number | null;
  // Drive's thumbnail endpoint — server-side resized, fast loads in the grid.
  // sz=w800 is plenty for typical thumbnail rendering at any reasonable
  // viewport width.
  thumbnailUrl: string;
  // Larger preview, used in the lightbox/full-view modal.
  viewUrl: string;
  // Original file, forced as a download (browser triggers Save As). Used on
  // desktop where Save As → file system is the right UX.
  downloadUrl: string;
  // Original file, served inline as an image. Used on mobile where opening
  // the image lets the user long-press → "Save to Photos" (iOS) /
  // "Download image" (Android), getting the file into the phone's gallery
  // rather than its Files app.
  originalUrl: string;
  // Drive's native viewer URL — for files too large to safely pull through
  // our proxy + Web Share API on mobile. Opens Drive's file viewer where
  // the user gets a proper download button regardless of file size.
  driveViewUrl: string;
};

/**
 * Lists images + videos in a Drive folder. Filters out trashed items and
 * non-media files (so a misplaced .txt in the folder won't render).
 * Sorted by filename so the client sees a stable, predictable order.
 */
export type FolderSection = {
  id: string;
  name: string;
  files: DriveFile[];
};

export type FolderTree = {
  // Files placed directly inside the gallery's root folder (no subfolder).
  // If Veronika organizes everything into subfolders, this is empty.
  rootFiles: DriveFile[];
  // One entry per subfolder under the root. Subfolders are sorted by name
  // (so Veronika can prefix with "01 ", "02 ", etc. to control order).
  sections: FolderSection[];
};

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function toDriveFile(f: {
  id: string;
  name: string;
  mimeType: string;
  size?: string | null;
}): DriveFile {
  // For the optimized download path, the file is served as webp so the
  // filename should reflect that — strip the original extension and
  // append .webp. The user-facing "Open original" link still gets them
  // to the unmodified file via Drive's viewer.
  const baseName = f.name.replace(/\.[^.]+$/, '');
  const optimizedFilename = `${baseName}.webp`;

  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    // Drive returns size as a stringified number. Parse to int; null if
    // unreported (rare for media files).
    size: f.size ? parseInt(f.size, 10) : null,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${f.id}&sz=w800`,
    viewUrl: `https://drive.google.com/thumbnail?id=${f.id}&sz=w2000`,
    // Download = optimized 2400px webp via our proxy. ~1-2MB, in-page Save
    // dialog (Content-Disposition: attachment), no virus-scan interstitial.
    // Print-quality originals are available via the "Open original" link
    // (driveViewUrl) — that path goes straight to Drive and doesn't count
    // against our Vercel Origin Transfer quota.
    downloadUrl: `/api/photo?id=${f.id}&filename=${encodeURIComponent(optimizedFilename)}`,
    // Same-origin proxy so the browser can fetch() the bytes without
    // hitting Drive's CORS block. Required for the Web Share API path.
    originalUrl: `/api/photo?id=${f.id}`,
    driveViewUrl: `https://drive.google.com/file/d/${f.id}/view`,
  };
}

function isMediaFile(f: { mimeType?: string | null }): boolean {
  return Boolean(
    f.mimeType?.startsWith('image/') || f.mimeType?.startsWith('video/'),
  );
}

// Natural-sort compare: "photo-2.jpg" < "photo-10.jpg". Drive's
// orderBy='name' is purely lexical, so something like "20June2026-10.jpg"
// ends up between "-1.jpg" and "-2.jpg". Vero numbers her deliveries
// chronologically (1, 2, 3 … 10, 11) so a lexical sort scrambles the
// timeline. localeCompare with numeric:true is the standard fix.
const naturalNameCompare = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

async function listMediaInFolder(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<DriveFile[]> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`,
    fields: 'files(id, name, mimeType, size)',
    pageSize: 1000,
    orderBy: 'name',
  });
  return (res.data.files ?? [])
    .filter((f): f is { id: string; name: string; mimeType: string; size?: string | null } =>
      Boolean(f.id && f.name && f.mimeType),
    )
    .sort(naturalNameCompare)
    .map(toDriveFile);
}

/**
 * Lists media in the gallery's root folder AND each immediate subfolder.
 * Returns a tree with one section per subfolder, in name-sorted order.
 * Photographers commonly deliver weddings as a parent folder with subfolders
 * for each part of the day (Bride, Groom, Ceremony, etc.) — this preserves
 * that organization in the client portal.
 *
 * Supports ONE level of nesting. Deeper structures (Bride/Hair/closeups)
 * are flattened: anything under a top-level subfolder shows up in that
 * section regardless of deeper nesting. Good enough for typical wedding
 * delivery; revisit if Veronika starts using deeper trees.
 */
export async function listFolderTree(parentFolderId: string): Promise<FolderTree> {
  const drive = getDrive();

  // 1. List immediate children (both folders + media files in one call).
  const rootRes = await drive.files.list({
    q: `'${parentFolderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size)',
    pageSize: 1000,
    orderBy: 'name',
  });
  const items = rootRes.data.files ?? [];

  const subFolders = items
    .filter((f) => f.mimeType === FOLDER_MIME)
    .sort((a, b) => naturalNameCompare({ name: a.name ?? '' }, { name: b.name ?? '' }));
  const rootFiles = items
    .filter(isMediaFile)
    .sort((a, b) => naturalNameCompare({ name: a.name ?? '' }, { name: b.name ?? '' }))
    .map((f) =>
      toDriveFile({
        id: f.id!,
        name: f.name!,
        mimeType: f.mimeType!,
        size: f.size,
      }),
    );

  // 2. For each subfolder, fetch its media in parallel. Bounded fanout —
  //    typical weddings have <20 subfolders, well under Drive's quota.
  const sections = await Promise.all(
    subFolders
      .filter((f): f is { id: string; name: string; mimeType: string } =>
        Boolean(f.id && f.name),
      )
      .map(async (folder) => ({
        id: folder.id,
        name: folder.name,
        files: await listMediaInFolder(drive, folder.id),
      })),
  );

  return {
    rootFiles,
    // Drop empty sections so we don't render bare headers for folders
    // that just have nested subfolders (or are entirely empty).
    sections: sections.filter((s) => s.files.length > 0),
  };
}

/**
 * Legacy flat listing — kept for code paths that don't care about folder
 * structure. New callers should use listFolderTree.
 */
export async function listFolderMedia(folderId: string): Promise<DriveFile[]> {
  return listMediaInFolder(getDrive(), folderId);
}

/**
 * Extracts a Drive folder ID from a full folder URL. Accepts either the raw
 * ID or various URL shapes that include it. Useful so Veronika can paste
 * either the URL or just the ID into the DB without us needing to care.
 */
export function extractFolderId(input: string): string {
  if (!input) return '';
  // Match URLs like https://drive.google.com/drive/folders/ID or
  // https://drive.google.com/drive/u/2/folders/ID
  const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // If it looks like a bare ID, return as-is.
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input.trim())) return input.trim();
  return input.trim();
}
