import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

/**
 * Admin: act on many gallery photos at once.
 *
 * POST { password, op: 'publish'   , ids: string[] }
 * POST { password, op: 'unpublish' , ids: string[] }
 * POST { password, op: 'recategorize', ids: string[], category }
 * POST { password, op: 'delete'    , ids: string[] }
 *   → 200 { success, affected, skipped }
 *
 * WHY THIS EXISTS
 * gallery-sync inserts new photos as status='draft', up to 20 per run. The only
 * way to publish one was to open its edit modal, review six fields and save. A
 * batch of twenty photos meant twenty modals, and the fields it makes you review
 * are AI-generated text that is usually fine as-is.
 *
 * SEMANTICS ARE COPIED FROM _gallery-update.ts DELIBERATELY
 * published_at is stamped only on the FIRST transition to published and is
 * preserved otherwise, so re-publishing something does not rewrite its original
 * publish date. Getting that subtly different between the single and bulk paths
 * would be the kind of divergence nobody notices until the gallery re-orders
 * itself.
 *
 * Delete is a SOFT delete (deleted_at), matching _gallery-delete.ts. A photo
 * still in Drive that is soft-deleted here gets RESTORED by the next sync —
 * that is the existing documented behaviour, not something this handler
 * changes, and the UI says so.
 */

const CATEGORIES = ['portraits', 'weddings', 'family', 'maternity'] as const;
type Category = (typeof CATEGORIES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Upper bound on one request. The gallery holds a few hundred photos, so this
 * is generous for any real selection while keeping a malformed or malicious
 * request from building an unbounded statement.
 */
const MAX_IDS = 500;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const op = typeof req.body?.op === 'string' ? req.body.op : '';
  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];

  // Filter to well-formed uuids rather than trusting the list: Postgres raises
  // on a malformed uuid, which would surface as an opaque 500.
  const ids = [...new Set(rawIds.filter((v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)))];

  if (ids.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid photo ids given.' });
  }
  if (ids.length > MAX_IDS) {
    return res.status(400).json({ success: false, error: `Too many photos at once (max ${MAX_IDS}).` });
  }

  try {
    const sql = getDb();

    if (op === 'publish') {
      // published_at is stamped ONLY where it is currently null, so a photo
      // that was published before, unpublished, and published again keeps its
      // original date. Same rule as the single-photo path.
      const rows = (await sql`
        UPDATE gallery_photos
        SET status = 'published',
            published_at = COALESCE(published_at, NOW()),
            updated_at = NOW()
        WHERE id = ANY(${ids}) AND deleted_at IS NULL
        RETURNING id
      `) as Array<{ id: string }>;
      return res.status(200).json({
        success: true,
        affected: rows.length,
        skipped: ids.length - rows.length,
      });
    }

    if (op === 'unpublish') {
      const rows = (await sql`
        UPDATE gallery_photos
        SET status = 'draft', updated_at = NOW()
        WHERE id = ANY(${ids}) AND deleted_at IS NULL
        RETURNING id
      `) as Array<{ id: string }>;
      return res.status(200).json({
        success: true,
        affected: rows.length,
        skipped: ids.length - rows.length,
      });
    }

    if (op === 'recategorize') {
      const category = typeof req.body?.category === 'string' ? req.body.category : '';
      if (!CATEGORIES.includes(category as Category)) {
        return res.status(400).json({ success: false, error: 'Invalid category.' });
      }
      const rows = (await sql`
        UPDATE gallery_photos
        SET category = ${category}, updated_at = NOW()
        WHERE id = ANY(${ids}) AND deleted_at IS NULL
        RETURNING id
      `) as Array<{ id: string }>;
      return res.status(200).json({
        success: true,
        affected: rows.length,
        skipped: ids.length - rows.length,
      });
    }

    if (op === 'delete') {
      // Destructive, so super-only — matching how deletes are gated elsewhere
      // in the panel. Soft delete: the row survives and the next sync restores
      // it if the file is still in Drive.
      if (auth.level !== 'super') {
        return res.status(403).json({ success: false, error: 'Requires super-admin access.' });
      }
      const rows = (await sql`
        UPDATE gallery_photos
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ANY(${ids}) AND deleted_at IS NULL
        RETURNING id
      `) as Array<{ id: string }>;
      return res.status(200).json({
        success: true,
        affected: rows.length,
        skipped: ids.length - rows.length,
      });
    }

    return res.status(400).json({ success: false, error: `Unknown op '${op}'.` });
  } catch (err) {
    console.error('[admin/gallery-bulk] failed:', err);
    return res.status(500).json({ success: false, error: 'Could not complete that action.' });
  }
}
