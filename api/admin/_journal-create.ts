/**
 * Admin: create a new Journal post.
 *
 * POST { password, ...postFields }
 *   → 200 { success, post }
 *   → 400 validation failure (missing/invalid field)
 *   → 401 bad password
 *   → 409 slug already in use
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

  const validated = validateJournalInput(req.body);
  if (!validated.ok) {
    return res.status(validated.status).json({ success: false, error: validated.error });
  }
  const v = validated.value;

  // Prefer an explicit event date if Vero supplied one (via the
  // admin date picker). Otherwise, stamp NOW on first publish, null
  // for drafts. Explicit date wins even for drafts so she can set
  // the event date in advance and just flip status when ready.
  const publishedAt = v.published_at
    ? v.published_at
    : v.status === 'published'
    ? new Date().toISOString()
    : null;

  try {
    const sql = getDb();
    const rows = (await sql`
      INSERT INTO journal_posts (
        slug, title, excerpt, body_markdown,
        cover_image_alt, drive_folder_url,
        session_type, tags, status, published_at
      )
      VALUES (
        ${v.slug}, ${v.title}, ${v.excerpt}, ${v.body_markdown},
        ${v.cover_image_alt}, ${v.drive_folder_url},
        ${v.session_type}, ${v.tags}, ${v.status}, ${publishedAt}
      )
      RETURNING id, slug, status, created_at, updated_at, published_at
    `) as Array<{
      id: string;
      slug: string;
      status: string;
      created_at: string;
      updated_at: string;
      published_at: string | null;
    }>;

    return res.status(200).json({ success: true, post: rows[0] });
  } catch (err) {
    // Postgres unique-violation on the slug is by far the most common
    // failure — surface it as 409 with a friendly message so the UI
    // can nudge the user to change the slug.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate key') && msg.includes('journal_posts')) {
      return res.status(409).json({ success: false, error: `A post with slug "${v.slug}" already exists.` });
    }
    console.error('[admin/journal-create] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
