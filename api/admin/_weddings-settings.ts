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
import {
  KEY_HEROES,
  KEY_FOLDER,
  KEY_FEATURED,
  KEY_SELECTED,
  isValidFocus,
  asZoom,
  parseFeatured,
  parsePinned,
  parseSelected,
} from '../_weddings-page.js';

const MAX_PINNED = 5;
// Alex capped the journal strip at six; the mosaic tops out at eight tiles.
const MAX_FEATURED = 6;
const MAX_SELECTED = 8;

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
        WHERE key IN (${KEY_HEROES}, ${KEY_FOLDER}, ${KEY_FEATURED}, ${KEY_SELECTED})
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
        pinned: parsePinned(state.get(KEY_HEROES), MAX_PINNED),
        folderId: state.get(KEY_FOLDER) ?? '',
        // Objects with per-entry focus points; legacy slug arrays are
        // normalized by parseFeatured with centered defaults.
        featured: parseFeatured(state.get(KEY_FEATURED), 6),
        selectedWork: parseSelected(state.get(KEY_SELECTED), MAX_SELECTED),
      });
    }

    if (action === 'set') {
      const writes: Array<[string, string]> = [];

      if (req.body?.pinned !== undefined) {
        const input = req.body.pinned;
        if (!Array.isArray(input)) {
          return res.status(400).json({ success: false, error: 'pinned must be an array' });
        }
        const entries: Array<{ url: string; focus: string; zoom: number }> = [];
        for (const item of input) {
          const url = typeof item?.url === 'string' ? item.url.trim() : '';
          if (url.length > 600) {
            return res.status(400).json({ success: false, error: 'pinned url too long' });
          }
          if (item?.focus !== undefined && !isValidFocus(item.focus)) {
            return res.status(400).json({ success: false, error: 'invalid focus value' });
          }
          // Empty url keeps the SLOT (slots have fixed jobs: packages 1-3,
          // FAQ, quote background) — an empty slot just renders nothing.
          entries.push({ url, focus: item?.focus ?? '50% 50%', zoom: asZoom(item?.zoom) });
        }
        writes.push([KEY_HEROES, JSON.stringify(entries.slice(0, MAX_PINNED))]);
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

      if (req.body?.featured !== undefined) {
        const input = req.body.featured;
        if (!Array.isArray(input)) {
          return res.status(400).json({ success: false, error: 'featured must be an array' });
        }
        const entries: Array<{
          slug: string;
          focusStage: string;
          focusThumb: string;
          zoomStage: number;
          zoomThumb: number;
        }> = [];
        for (const item of input) {
          const slug = typeof item?.slug === 'string' ? item.slug.trim() : '';
          if (!slug || slug.length > 200) {
            return res.status(400).json({ success: false, error: 'each featured entry needs a slug' });
          }
          const okFocus = (v: unknown) => v === undefined || isValidFocus(v);
          if (!okFocus(item.focusStage) || !okFocus(item.focusThumb)) {
            return res.status(400).json({ success: false, error: 'invalid focus value' });
          }
          entries.push({
            slug,
            focusStage: item.focusStage ?? '50% 50%',
            focusThumb: item.focusThumb ?? '50% 50%',
            zoomStage: asZoom(item.zoomStage),
            zoomThumb: asZoom(item.zoomThumb),
          });
        }
        writes.push([KEY_FEATURED, JSON.stringify(entries.slice(0, MAX_FEATURED))]);
      }

      if (req.body?.selectedWork !== undefined) {
        const input = req.body.selectedWork;
        if (!Array.isArray(input)) {
          return res.status(400).json({ success: false, error: 'selectedWork must be an array' });
        }
        // Objects now ({slug, focus, zoom}); plain slugs still accepted so a
        // stale admin bundle cannot wipe the list.
        const entries: Array<{ slug: string; focus: string; zoom: number }> = [];
        for (const item of input) {
          if (typeof item === 'string') {
            const slug = item.trim();
            if (!slug || slug.length > 200) {
              return res.status(400).json({ success: false, error: 'invalid selectedWork slug' });
            }
            entries.push({ slug, focus: '50% 50%', zoom: 1 });
            continue;
          }
          const slug = typeof item?.slug === 'string' ? item.slug.trim() : '';
          if (!slug || slug.length > 200) {
            return res.status(400).json({ success: false, error: 'each selectedWork entry needs a slug' });
          }
          if (item?.focus !== undefined && !isValidFocus(item.focus)) {
            return res.status(400).json({ success: false, error: 'invalid focus value' });
          }
          entries.push({ slug, focus: item?.focus ?? '50% 50%', zoom: asZoom(item?.zoom) });
        }
        writes.push([KEY_SELECTED, JSON.stringify(entries.slice(0, MAX_SELECTED))]);
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
