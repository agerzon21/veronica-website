/**
 * Admin: create or update a wedding vendor. The reviews-upsert pattern:
 * id present → UPDATE, absent → INSERT. Full-shape body, no patch
 * complexity — the editor always sends every field.
 *
 * POST { password, vendor: { id?, name, category, blurb?, websiteUrl?,
 *        instagram?, photoUrl?, sortOrder?, active? } }
 *   → { success, vendor }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

const MAX_TEXT = 2000;

function optionalUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  if (s.length > 600) return null;
  return s;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const v = req.body?.vendor;
  if (!v || typeof v !== 'object') {
    return res.status(400).json({ success: false, error: 'vendor is required' });
  }

  const name = typeof v.name === 'string' ? v.name.trim() : '';
  const category = typeof v.category === 'string' ? v.category.trim() : '';
  if (!name || !category) {
    return res.status(400).json({ success: false, error: 'name and category are required' });
  }
  const blurb = typeof v.blurb === 'string' ? v.blurb.trim().slice(0, MAX_TEXT) : '';
  const websiteUrl = optionalUrl(v.websiteUrl);
  const instagram = optionalUrl(v.instagram);
  const photoUrl = optionalUrl(v.photoUrl);
  const sortOrder = Number.isFinite(Number(v.sortOrder)) ? Math.trunc(Number(v.sortOrder)) : 0;
  const active = v.active !== false;

  try {
    const sql = getDb();

    if (v.id) {
      const rows = await sql`
        UPDATE wedding_vendors
        SET name = ${name}, category = ${category}, blurb = ${blurb},
            website_url = ${websiteUrl}, instagram = ${instagram},
            photo_url = ${photoUrl}, sort_order = ${sortOrder}, active = ${active}
        WHERE id = ${v.id}
        RETURNING id, name, category, blurb, website_url, instagram, photo_url,
                  sort_order, active, created_at, updated_at
      `;
      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Vendor not found' });
      }
      return res.status(200).json({ success: true, vendor: rows[0] });
    }

    const rows = await sql`
      INSERT INTO wedding_vendors
        (name, category, blurb, website_url, instagram, photo_url, sort_order, active)
      VALUES
        (${name}, ${category}, ${blurb}, ${websiteUrl}, ${instagram}, ${photoUrl},
         ${sortOrder}, ${active})
      RETURNING id, name, category, blurb, website_url, instagram, photo_url,
                sort_order, active, created_at, updated_at
    `;
    return res.status(200).json({ success: true, vendor: rows[0] });
  } catch (err) {
    console.error('[admin/weddings-vendors-upsert] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
