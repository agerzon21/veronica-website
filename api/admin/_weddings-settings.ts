/**
 * Admin: get/set the weddings-page settings in system_state.
 *
 * Three settings, one endpoint (the gallery-settings pattern):
 *   - heroes:        up to 6 pinned photo links (Drive file link or any
 *                    https image URL). These render constantly; Vero
 *                    curates them by hand.
 *   - folderId:      the Drive folder whose contents get sprinkled
 *                    dynamically through the page. Stored raw (URL or
 *                    id), parsed on every read like gallery/journal.
 *   - featuredSlugs: ordered journal-post slugs for "From the Journal"
 *                    (max 10 — Alex capped the section at 5-10).
 *
 * POST { password, action: 'get' }
 *   → { success, heroes, folderId, featuredSlugs }
 * POST { password, action: 'set', heroes?, folderId?, featuredSlugs? }
 *   → { success } — only the provided keys are written, so the three
 *   admin cards can save independently.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { extractFolderId } from '../_drive.js';
import { KEY_HEROES, KEY_FOLDER, KEY_FEATURED } from '../_weddings-page.js';

const MAX_HEROES = 6;
const MAX_FEATURED = 10;

function cleanStringArray(input: unknown, cap: number, maxLen: number): string[] | null {
  if (!Array.isArray(input)) return null;
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') return null;
    const s = item.trim();
    if (s.length > maxLen) return null;
    if (s) out.push(s);
  }
  return out.slice(0, cap);
}

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
        SELECT key, value FROM system_state
        WHERE key IN (${KEY_HEROES}, ${KEY_FOLDER}, ${KEY_FEATURED})
      `) as Array<{ key: string; value: string | null }>;
      const state = new Map(rows.map((r) => [r.key, r.value]));
      const parse = (raw: string | null | undefined): string[] => {
        try {
          const arr = JSON.parse(raw ?? '[]');
          return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : [];
        } catch {
          return [];
        }
      };
      return res.status(200).json({
        success: true,
        heroes: parse(state.get(KEY_HEROES)),
        folderId: state.get(KEY_FOLDER) ?? '',
        featuredSlugs: parse(state.get(KEY_FEATURED)),
      });
    }

    if (action === 'set') {
      const writes: Array<[string, string]> = [];

      if (req.body?.heroes !== undefined) {
        const heroes = cleanStringArray(req.body.heroes, MAX_HEROES, 600);
        if (heroes === null) {
          return res.status(400).json({ success: false, error: 'heroes must be an array of URLs' });
        }
        writes.push([KEY_HEROES, JSON.stringify(heroes)]);
      }

      if (req.body?.folderId !== undefined) {
        const raw = typeof req.body.folderId === 'string' ? req.body.folderId.trim() : null;
        if (raw === null) {
          return res.status(400).json({ success: false, error: 'folderId must be a string' });
        }
        // Empty string is a deliberate "no folder" choice. Anything else
        // must parse, so Vero hears about a bad paste immediately.
        if (raw && !extractFolderId(raw)) {
          return res.status(400).json({
            success: false,
            error: "Couldn't extract a Drive folder ID. Paste the folder's full URL (or its ID).",
          });
        }
        writes.push([KEY_FOLDER, raw]);
      }

      if (req.body?.featuredSlugs !== undefined) {
        const slugs = cleanStringArray(req.body.featuredSlugs, MAX_FEATURED, 200);
        if (slugs === null) {
          return res.status(400).json({ success: false, error: 'featuredSlugs must be an array of slugs' });
        }
        writes.push([KEY_FEATURED, JSON.stringify(slugs)]);
      }

      if (writes.length === 0) {
        return res.status(400).json({ success: false, error: 'Nothing to save' });
      }

      for (const [key, value] of writes) {
        await sql`
          INSERT INTO system_state (key, updated_at, value)
          VALUES (${key}, NOW(), ${value})
          ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
        `;
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: "action must be 'get' or 'set'" });
  } catch (err) {
    console.error('[admin/weddings-settings] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
