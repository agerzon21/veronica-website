/**
 * Admin: list gallery photos for the Gallery tab in /admin.
 *
 * POST { password, category?, status?, includeDeleted? }
 *   → 200 { success, level, photos: [Row, ...] }
 *   → 401 wrong password
 *
 * Returns ALL rows (drafts + published) by default so Vero can
 * review AI-generated drafts and flip them to published. Filters:
 *   - category?: only that category
 *   - status?:   'draft' | 'published' — only that status
 *   - includeDeleted?: boolean (default false) — include
 *                      soft-deleted rows too (for "restore"
 *                      workflows). Hidden by default so the
 *                      standard editing view isn't polluted.
 *
 * Sorted by (status='draft' first, then updated_at DESC) so
 * new-drafts-needing-review always float to the top of the list.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

type Category = 'portraits' | 'weddings' | 'family' | 'maternity';
const CATEGORIES: readonly Category[] = ['portraits', 'weddings', 'family', 'maternity'];

interface Row {
  id: string;
  slug: string;
  category: Category;
  drive_file_id: string;
  drive_filename: string;
  title: string;
  alt: string;
  description: string;
  keywords: string[];
  width: number | null;
  height: number | null;
  status: 'draft' | 'published';
  sort_order: number;
  published_at: string | null;
  drive_seen_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const body = req.body ?? {};
  const category = typeof body.category === 'string' && CATEGORIES.includes(body.category as Category)
    ? (body.category as Category)
    : null;
  const status = body.status === 'draft' || body.status === 'published' ? body.status : null;
  const includeDeleted = Boolean(body.includeDeleted);

  try {
    const sql = getDb();
    // Neon's tagged template can't easily do dynamic WHERE clauses
    // via string concatenation. Branch on the filter combo instead
    // — verbose but each query is straightforward and safe.
    let rows: Row[];
    if (category && status && !includeDeleted) {
      rows = (await sql`
        SELECT * FROM gallery_photos
        WHERE category = ${category} AND status = ${status} AND deleted_at IS NULL
        ORDER BY (status = 'draft') DESC, updated_at DESC
      `) as Row[];
    } else if (category && status && includeDeleted) {
      rows = (await sql`
        SELECT * FROM gallery_photos
        WHERE category = ${category} AND status = ${status}
        ORDER BY (status = 'draft') DESC, updated_at DESC
      `) as Row[];
    } else if (category && !includeDeleted) {
      rows = (await sql`
        SELECT * FROM gallery_photos
        WHERE category = ${category} AND deleted_at IS NULL
        ORDER BY (status = 'draft') DESC, updated_at DESC
      `) as Row[];
    } else if (category && includeDeleted) {
      rows = (await sql`
        SELECT * FROM gallery_photos
        WHERE category = ${category}
        ORDER BY (status = 'draft') DESC, updated_at DESC
      `) as Row[];
    } else if (status && !includeDeleted) {
      rows = (await sql`
        SELECT * FROM gallery_photos
        WHERE status = ${status} AND deleted_at IS NULL
        ORDER BY (status = 'draft') DESC, updated_at DESC
      `) as Row[];
    } else if (status && includeDeleted) {
      rows = (await sql`
        SELECT * FROM gallery_photos
        WHERE status = ${status}
        ORDER BY (status = 'draft') DESC, updated_at DESC
      `) as Row[];
    } else if (includeDeleted) {
      rows = (await sql`
        SELECT * FROM gallery_photos
        ORDER BY (status = 'draft') DESC, updated_at DESC
      `) as Row[];
    } else {
      rows = (await sql`
        SELECT * FROM gallery_photos
        WHERE deleted_at IS NULL
        ORDER BY (status = 'draft') DESC, updated_at DESC
      `) as Row[];
    }

    // Attach a thumbnail URL for the admin list. We use Drive's own
    // ?sz=w600 thumbnail endpoint (cheap JPEG, CDN-cached by Google)
    // instead of routing through our /api/photo proxy, which returns
    // the full 2400px display-quality WebP (~1-2MB each, ~15-30MB
    // decoded in memory). At ~200+ photos, a fast scroll to the bottom
    // of the admin grid was OOM-ing mobile Safari and dropping the
    // whole tab to a white "cannot display" page.
    //
    // The proxy stays required for the PUBLIC gallery and photo pages
    // (CORS + WebP + share pre-fetch); the admin grid just needs a
    // small preview thumbnail, so use Drive's cheapest path.
    const photos = rows.map((r) => ({
      ...r,
      preview_url: `https://drive.google.com/thumbnail?id=${r.drive_file_id}&sz=w600`,
    }));

    return res.status(200).json({
      success: true,
      level: auth.level,
      photos,
    });
  } catch (err) {
    console.error('[admin/gallery-list] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
