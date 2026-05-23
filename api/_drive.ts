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
};

/**
 * Lists images + videos in a Drive folder. Filters out trashed items and
 * non-media files (so a misplaced .txt in the folder won't render).
 * Sorted by filename so the client sees a stable, predictable order.
 */
export async function listFolderMedia(folderId: string): Promise<DriveFile[]> {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`,
    fields: 'files(id, name, mimeType)',
    pageSize: 1000,
    orderBy: 'name',
  });
  const files = res.data.files ?? [];
  return files
    .filter((f): f is { id: string; name: string; mimeType: string } =>
      Boolean(f.id && f.name && f.mimeType),
    )
    .map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      thumbnailUrl: `https://drive.google.com/thumbnail?id=${f.id}&sz=w800`,
      viewUrl: `https://drive.google.com/thumbnail?id=${f.id}&sz=w2000`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${f.id}`,
      originalUrl: `https://drive.google.com/uc?export=view&id=${f.id}`,
    }));
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
