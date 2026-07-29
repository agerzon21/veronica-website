/**
 * Admin: update a Journal post.
 *
 * POST { password, id, ...postFields }
 *   → 200 { success, post }
 *   → 400 validation failure
 *   → 401 bad password
 *   → 404 no such post
 *   → 409 slug collides with another post
 *
 * All post fields are replaced (full-object update, not partial patch).
 * Simpler than diffing partials; the admin form always sends the full
 * shape. `published_at` transitions: draft→published sets to NOW if
 * not previously set; published→draft leaves published_at as-is so
 * un-publishing then re-publishing doesn't reset the original date.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { validateJournalInput } from './_journal-shared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!id) return res.status(400).json({ success: false, error: 'id is required' });

  const validated = validateJournalInput(req.body);
  if (!validated.ok) {
    return res.status(validated.status).json({ success: false, error: validated.error });
  }
  const v = validated.value;

  try {
    const sql = getDb();

    // Look up the existing published_at so we don't clobber the
    // original publish date on a re-save.
    const existing = (await sql`
      SELECT published_at FROM journal_posts WHERE id = ${id} LIMIT 1
    `) as Array<{ published_at: string | null }>;
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Only stamp published_at on the FIRST transition to published.
    // Subsequent saves preserve it (even if status is 'draft' now).
    const publishedAt =
      v.status === 'published' && !existing[0].published_at
        ? new Date().toISOString()
        : existing[0].published_at;

    const rows = (await sql`
      UPDATE journal_posts
      SET
        slug = ${v.slug},
        title = ${v.title},
        excerpt = ${v.excerpt},
        body_markdown = ${v.body_markdown},
        cover_image_url = ${v.cover_image_url},
        cover_image_alt = ${v.cover_image_alt},
        drive_folder_url = ${v.drive_folder_url},
        session_type = ${v.session_type},
        tags = ${v.tags},
        status = ${v.status},
        published_at = ${publishedAt}
      WHERE id = ${id}
      RETURNING id, slug, status, updated_at, published_at
    `) as Array<{
      id: string;
      slug: string;
      status: string;
      updated_at: string;
      published_at: string | null;
    }>;

    return res.status(200).json({ success: true, post: rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate key') && msg.includes('journal_posts')) {
      return res.status(409).json({ success: false, error: `Another post already uses slug "${v.slug}".` });
    }
    console.error('[admin/journal-update] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
