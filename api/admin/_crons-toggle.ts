/**
 * Super-admin only: flip a single cron's enabled flag.
 *
 * POST { password, name, enabled }
 *   → 200 { success, enabled }
 *   → 400 missing/invalid input
 *   → 401 wrong password
 *   → 403 admin-level (not super)
 *   → 404 no cron by that name
 *   → 405 non-POST
 *
 * The next invocation of the affected cron sees the new value via
 * runGuarded() and either does work or writes a 'skipped' run.
 * There's no separate deploy step — the toggle is live immediately.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin, requireSuper } from '../_admin-auth.js';
import { getDb } from '../_db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });
  const superCheck = requireSuper(auth.level);
  if (!superCheck.ok) return res.status(superCheck.status).json({ success: false, error: superCheck.error });

  const name = req.body?.name;
  const enabled = req.body?.enabled;
  if (typeof name !== 'string' || !name || typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'name (string) and enabled (boolean) required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      UPDATE cron_jobs SET enabled = ${enabled} WHERE name = ${name}
      RETURNING enabled
    `) as Array<{ enabled: boolean }>;
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: `No cron named '${name}'` });
    }
    return res.status(200).json({ success: true, enabled: rows[0].enabled });
  } catch (err) {
    console.error('[admin/crons-toggle] DB write failed:', err);
    return res.status(500).json({ success: false, error: 'Database unreachable' });
  }
}
