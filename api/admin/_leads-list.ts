/**
 * Admin: list all contact-form submissions (leads).
 *
 * POST { password }
 *   → 200 { success, level, leads: [...] }
 *   → 401 bad password
 *
 * Ordered newest-first via the composite index on created_at DESC. The
 * admin list is expected to grow slowly (a handful of leads per week);
 * no server-side pagination for now. If the list ever crosses ~500 rows
 * we'll add a limit/offset — mirrors the reviews handler philosophy.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

type Row = {
  id: string;
  name: string;
  email: string;
  shoot_type: string | null;
  preferred_date: string | null;
  location: string | null;
  message: string | null;
  status: string;
  notes: string | null;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT
        id,
        name,
        email,
        shoot_type,
        preferred_date,
        location,
        message,
        status,
        notes,
        contacted_at,
        created_at,
        updated_at
      FROM contact_submissions
      ORDER BY created_at DESC
    `) as Row[];

    return res.status(200).json({
      success: true,
      level: auth.level,
      leads: rows,
    });
  } catch (err) {
    console.error('[admin/leads-list] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
