/**
 * Admin: get/set gallery-sync settings that live in system_state.
 *
 * Right now that's just the Drive folder ID the sync cron pulls from.
 * Kept as a single admin endpoint so we have a natural home to add
 * future toggles (auto-publish on sync, sync interval, etc.) without
 * multiplying files.
 *
 * POST { password, action: 'get' }
 *   → 200 { success, folderId, folderIdSource: 'db' | 'env' | 'none' }
 *
 * POST { password, action: 'set', folderId }
 *   → 200 { success }
 *   → 400 if folderId is empty or unparseable
 *
 * The stored value is whatever the user typed (URL or bare id) —
 * the cron re-parses it each run so future edits don't require a
 * particular format.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { extractFolderId } from '../_drive.js';

const KEY = 'gallery_drive_folder_id';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const action = req.body?.action;

  try {
    const sql = getDb();

    if (action === 'get') {
      const rows = (await sql`
        SELECT value FROM system_state WHERE key = ${KEY} LIMIT 1
      `) as Array<{ value: string | null }>;
      const dbValue = rows[0]?.value ?? null;
      const envValue = process.env.GALLERY_DRIVE_FOLDER_ID ?? null;
      const folderId = dbValue ?? envValue ?? '';
      const source: 'db' | 'env' | 'none' = dbValue
        ? 'db'
        : envValue
        ? 'env'
        : 'none';
      return res.status(200).json({ success: true, folderId, folderIdSource: source });
    }

    if (action === 'set') {
      const raw = typeof req.body?.folderId === 'string' ? req.body.folderId.trim() : '';
      if (!raw) {
        return res.status(400).json({ success: false, error: 'folderId is required' });
      }
      // Validate up front so the admin gets immediate feedback rather
      // than a cron failure hours later. Sync uses the same helper.
      const parsedId = extractFolderId(raw);
      if (!parsedId) {
        return res.status(400).json({
          success: false,
          error: "Couldn't extract a Drive folder ID. Paste the folder's full URL (or its ID).",
        });
      }
      // Store whatever the user typed — the sync code parses it each
      // time, so we don't lose the URL format if that's what they
      // pasted (helps visual verification later).
      await sql`
        INSERT INTO system_state (key, updated_at, value)
        VALUES (${KEY}, NOW(), ${raw})
        ON CONFLICT (key) DO UPDATE SET value = ${raw}, updated_at = NOW()
      `;
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: "action must be 'get' or 'set'" });
  } catch (err) {
    console.error('[admin/gallery-settings] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
