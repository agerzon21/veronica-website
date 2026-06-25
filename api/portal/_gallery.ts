/**
 * Gallery Pass auth — password-only access for read-only photo viewing.
 *
 * POST { password }
 *   → 200 { success, client_name, drive_url, rootFiles, sections }   on hit
 *   → 200 { success, warning: 'Photos coming soon' }                 if gallery isn't ready yet
 *   → 401                                                            on wrong/disabled password
 *   → 405                                                            non-POST
 *
 * Brute-force protection: constant ~750ms delay on every wrong password
 * (same idiom we use everywhere else in this app).
 *
 * Used by the "Gallery Pass" tab of /portal. Both `mode='simple'` and
 * `mode='full'` portals expose this — for full portals, this is what the
 * client gives to wedding guests / family / anyone they want to share
 * photos with WITHOUT giving away their Client Portal login.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { listFolderTree, extractFolderId, type FolderTree } from '../_drive.js';

const WRONG_PASSWORD_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type GalleryRow = {
  client_display_name: string | null;
  drive_url: string | null;
  gallery_enabled: boolean;
  gallery_expires_at: string | null;
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
      select client_display_name, drive_url, gallery_enabled, gallery_expires_at
      from client_portals
      where gallery_password = ${password}
      limit 1
    `) as GalleryRow[];

    if (rows.length === 0 || !rows[0].gallery_enabled) {
      await sleep(WRONG_PASSWORD_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Incorrect password' });
    }

    const { client_display_name, drive_url, gallery_expires_at } = rows[0];

    // Gallery has expired (configurable per portal, defaults to 3 months
    // after delivery). Surface a clear message rather than silently
    // serving stale links.
    if (
      gallery_expires_at &&
      new Date(gallery_expires_at) < new Date()
    ) {
      return res.status(410).json({
        success: false,
        error:
          'This gallery has expired. Please contact Veronika to request access.',
      });
    }

    // Photos not yet uploaded — let the client know rather than 404'ing the
    // password. The portal entry exists (Veronika created it ahead of the
    // shoot), the photos just aren't ready yet.
    if (!drive_url) {
      return res.status(200).json({
        success: true,
        client_name: client_display_name,
        drive_url: null,
        rootFiles: [],
        sections: [],
        warning: 'Your photos are not ready yet. Check back soon!',
      });
    }

    const folderId = extractFolderId(drive_url);
    if (!folderId) {
      console.error('[portal/gallery] stored drive_url has no extractable folder ID:', drive_url);
      return res.status(500).json({ success: false, error: 'Gallery is misconfigured. Please contact us.' });
    }

    let tree: FolderTree = { rootFiles: [], sections: [] };
    try {
      tree = await listFolderTree(folderId);
    } catch (err) {
      console.error('[portal/gallery] Drive API failed:', err);
      return res.status(200).json({
        success: true,
        client_name: client_display_name,
        drive_url,
        rootFiles: [],
        sections: [],
        warning: 'Could not load photo previews — use "View in Drive" below.',
      });
    }

    return res.status(200).json({
      success: true,
      client_name: client_display_name,
      drive_url,
      rootFiles: tree.rootFiles,
      sections: tree.sections,
    });
  } catch (err) {
    console.error('[portal/gallery] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
