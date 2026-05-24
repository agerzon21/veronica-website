/**
 * Client gallery access endpoint.
 *
 * POST { password: string }
 *   → 200 { client_name, drive_url, files: DriveFile[] }   (correct password)
 *   → 401                                                   (wrong password)
 *   → 405                                                   (non-POST)
 *
 * Brute-force protection: a constant ~750ms delay on every wrong password.
 * Combined with random passwords ≥ 8 chars, this makes guessing impractical
 * (~80 years to brute-force at 1 request/sec). No need for persistent rate
 * limiting at our scale.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';
import { listFolderTree, extractFolderId, type FolderTree } from './_drive.js';

const WRONG_PASSWORD_DELAY_MS = 750;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type GalleryRow = {
  client_name: string | null;
  drive_url: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const password =
    typeof req.body?.password === 'string' ? req.body.password.trim() : '';

  if (!password) {
    await sleep(WRONG_PASSWORD_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Password required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      select client_name, drive_url
      from client_galleries
      where password = ${password}
      limit 1
    `) as GalleryRow[];

    if (rows.length === 0) {
      await sleep(WRONG_PASSWORD_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Incorrect password' });
    }

    const { client_name, drive_url } = rows[0];
    const folderId = extractFolderId(drive_url);

    if (!folderId) {
      console.error('[clients] stored drive_url has no extractable folder ID:', drive_url);
      return res.status(500).json({ success: false, error: 'Gallery is misconfigured. Please contact us.' });
    }

    let tree: FolderTree = { rootFiles: [], sections: [] };
    try {
      tree = await listFolderTree(folderId);
    } catch (err) {
      console.error('[clients] Drive API failed:', err);
      // Even if Drive listing fails, we still return the bare gallery so the
      // user has a "Download All from Drive" fallback link.
      return res.status(200).json({
        success: true,
        client_name,
        drive_url,
        rootFiles: [],
        sections: [],
        warning: 'Could not load photo previews — use "View in Drive" below.',
      });
    }

    return res.status(200).json({
      success: true,
      client_name,
      drive_url,
      rootFiles: tree.rootFiles,
      sections: tree.sections,
    });
  } catch (err) {
    console.error('[clients] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
