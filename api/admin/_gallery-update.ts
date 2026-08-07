/**
 * Admin: update a single gallery photo row.
 *
 * POST { password, id, ...fields }
 *   → 200 { success, photo }
 *   → 400 validation failure
 *   → 401 wrong password
 *   → 404 row not found
 *   → 409 slug collides with another row
 *
 * All editable fields are optional in the request — only the ones
 * present get updated. This lets the admin UI patch a single field
 * (e.g. "flip to published", "edit description") without sending
 * the whole row shape.
 *
 * status='draft' → status='published' transition auto-stamps
 * published_at (only on the first transition — subsequent flips
 * preserve the original date so unpublishing then republishing
 * doesn't reset the chronological order).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

type Category = 'portraits' | 'weddings' | 'family' | 'maternity';
const CATEGORIES: readonly Category[] = ['portraits', 'weddings', 'family', 'maternity'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const body = req.body ?? {};
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return res.status(400).json({ success: false, error: 'id is required' });

  // Normalize + validate each editable field. undefined means "skip",
  // so the caller can PATCH just what they want.
  const slug = typeof body.slug === 'string' ? normalizeSlug(body.slug) : undefined;
  if (slug === '') return res.status(400).json({ success: false, error: 'slug cannot be empty' });

  const category = typeof body.category === 'string'
    ? CATEGORIES.includes(body.category as Category)
      ? (body.category as Category)
      : null
    : undefined;
  if (category === null) return res.status(400).json({ success: false, error: 'invalid category' });

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : undefined;
  const alt = typeof body.alt === 'string' ? body.alt.trim().slice(0, 500) : undefined;
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : undefined;
  const keywords = Array.isArray(body.keywords)
    ? body.keywords
        .filter((k: unknown): k is string => typeof k === 'string')
        .map((k: string) => k.trim().toLowerCase())
        .filter((k: string) => k.length > 0 && k.length <= 40)
        .slice(0, 20)
    : undefined;
  const status = body.status === 'draft' || body.status === 'published' ? body.status : undefined;
  const sort_order = typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
    ? Math.round(body.sort_order)
    : undefined;

  try {
    const sql = getDb();

    // Fetch current row so we can:
    //   1. Return 404 if not found
    //   2. Compute the correct published_at (stamp NOW only on first
    //      transition to published; preserve otherwise).
    const existing = (await sql`
      SELECT status, published_at FROM gallery_photos WHERE id = ${id} LIMIT 1
    `) as Array<{ status: 'draft' | 'published'; published_at: string | null }>;
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Row not found' });
    }
    const cur = existing[0];

    let publishedAt: string | null | undefined = undefined; // undefined = don't touch
    if (status === 'published' && !cur.published_at) {
      publishedAt = new Date().toISOString();
    }

    // COALESCE-based patch — only overwrite columns that were
    // provided in the request. Every field falls back to the
    // existing column value when we pass NULL.
    const rows = (await sql`
      UPDATE gallery_photos SET
        slug         = COALESCE(${slug ?? null}, slug),
        category     = COALESCE(${category ?? null}, category),
        title        = COALESCE(${title ?? null}, title),
        alt          = COALESCE(${alt ?? null}, alt),
        description  = COALESCE(${description ?? null}, description),
        keywords     = COALESCE(${keywords ?? null}, keywords),
        status       = COALESCE(${status ?? null}, status),
        sort_order   = COALESCE(${sort_order ?? null}, sort_order),
        published_at = COALESCE(${publishedAt ?? null}, published_at)
      WHERE id = ${id}
      RETURNING *
    `) as Array<Record<string, unknown>>;

    return res.status(200).json({ success: true, photo: rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('gallery_photos_slug_key') || msg.includes('duplicate key')) {
      return res.status(409).json({ success: false, error: `Slug "${slug}" already in use by another photo.` });
    }
    console.error('[admin/gallery-update] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
