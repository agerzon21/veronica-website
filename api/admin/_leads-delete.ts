/**
 * Admin: delete a lead. Superadmin only — same principle as
 * reviews-delete / journal-delete / portal-delete: an irreversible
 * destructive action stays out of Vero's reach so an accidental click
 * can't wipe an inquiry we might still want to reference.
 *
 * POST { password, id }
 *   → 200 { success }
 *   → 400 missing id
 *   → 401 bad password
 *   → 403 not superadmin
 *   → 404 no such lead
 *
 * Vero's normal workflow for "this lead is done" is to flip its status
 * to 'booked' / 'ghosted' / 'spam' via _leads-update — that keeps the
 * row for history/analytics. Delete is only for genuine junk (test
 * submissions Alex fires while developing, obvious spam that slipped
 * past the honeypot, etc.).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin, requireSuper } from '../_admin-auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });
  const superCheck = requireSuper(auth.level);
  if (!superCheck.ok) {
    return res.status(superCheck.status).json({ success: false, error: superCheck.error });
  }

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!id) return res.status(400).json({ success: false, error: 'id is required' });

  try {
    const sql = getDb();
    const rows = (await sql`
      DELETE FROM contact_submissions WHERE id = ${id} RETURNING id
    `) as Array<{ id: string }>;

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/leads-delete] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
