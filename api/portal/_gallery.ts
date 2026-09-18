/**
 * Gallery Pass auth — password-only access for read-only photo viewing.
 *
 * POST { password }
 *   → 200 { success, client_name, drive_url, rootFiles, sections, gallery_expires_at }   on hit
 *   → 200 { success, warning: 'Photos coming soon' }                 if gallery isn't ready yet
 *   → 401                                                            on wrong/disabled password
 *   → 403 { gallery_withheld: true }                                 full portal not delivered yet
 *   → 405                                                            non-POST
 *
 * Brute-force protection: constant ~750ms delay on every wrong password
 * (same idiom we use everywhere else in this app).
 *
 * Used by the "Gallery Pass" tab of /portal. Both `mode='simple'` and
 * `mode='full'` portals expose this: for full portals, this is what the
 * client gives to wedding guests / family / anyone they want to share
 * photos with WITHOUT giving away their Client Portal login.
 *
 * Because it serves full portals too, it is the second door onto the same
 * photos and enforces the same release gate as /api/portal/client. Gating
 * only the logged-in portal would have left this one open, which is the whole
 * reason the predicate lives in ./_gallery-gate.ts instead of in one handler.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isGalleryReleased,
  verifyGalleryPreviewToken,
  GALLERY_WITHHELD_MESSAGE,
} from './_gallery-gate.js';
import { getDb } from '../_db.js';
import { listFolderTree, extractFolderId, type FolderTree } from '../_drive.js';

const WRONG_PASSWORD_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type GalleryRow = {
  // Needed to verify an admin preview token, which is signed per portal.
  id: string;
  client_display_name: string | null;
  drive_url: string | null;
  gallery_enabled: boolean;
  gallery_expires_at: string | null;
  // Both feed the release gate. A gallery password matches portals of either
  // mode, so the mode has to come back with the row.
  mode: 'simple' | 'full';
  gallery_delivered_at: string | null;
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
      select id, client_display_name, drive_url, gallery_enabled, gallery_expires_at,
             mode, gallery_delivered_at
      from client_portals
      where gallery_password = ${password}
      limit 1
    `) as GalleryRow[];

    if (rows.length === 0 || !rows[0].gallery_enabled) {
      await sleep(WRONG_PASSWORD_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Incorrect password' });
    }

    const { client_display_name, drive_url, gallery_expires_at } = rows[0];

    // The release gate, before anything else is computed: a full portal's
    // photos are served only after Vero marks the gallery delivered.
    //
    // 403 rather than a 200 carrying empty lists. Portal.tsx feeds any
    // successful response straight into ClientGallery, which with no files
    // and no Drive URL renders its "previews aren't loading" state and a
    // "View in Google Drive" button pointing at nothing. A non-2xx lands in
    // the password form's error slot instead, which is the honest surface.
    // gallery_withheld rides along so a caller can tell this apart from a
    // wrong password without matching on copy.
    //
    // One bypass, for Vero only: the admin panel's "Preview Client Gallery"
    // button opens this very URL, so without it she could no longer check a
    // gallery before releasing it, which is exactly when checking matters. The
    // token is a short-lived HMAC minted by the authenticated admin endpoint,
    // so it cannot be guessed and it expires on its own.
    const rawPreview = req.query.preview;
    const previewToken = Array.isArray(rawPreview)
      ? rawPreview[0]
      : typeof rawPreview === 'string'
      ? rawPreview
      : '';
    const adminPreview =
      !!previewToken && verifyGalleryPreviewToken(rows[0].id, previewToken);

    if (!isGalleryReleased(rows[0]) && !adminPreview) {
      return res.status(403).json({
        success: false,
        gallery_withheld: true,
        error: GALLERY_WITHHELD_MESSAGE,
      });
    }

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

    // Photos not yet uploaded. Let the client know rather than 404'ing the
    // password: the portal entry exists (Veronika created it ahead of the
    // shoot), the photos just aren't ready yet.
    if (!drive_url) {
      return res.status(200).json({
        success: true,
        client_name: client_display_name,
        drive_url: null,
        rootFiles: [],
        sections: [],
        gallery_expires_at,
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
        gallery_expires_at,
        warning: 'Could not load photo previews. Use "View in Drive" below.',
      });
    }

    return res.status(200).json({
      success: true,
      client_name: client_display_name,
      drive_url,
      rootFiles: tree.rootFiles,
      sections: tree.sections,
      gallery_expires_at,
    });
  } catch (err) {
    console.error('[portal/gallery] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
