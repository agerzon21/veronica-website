/**
 * Records the moment a manual Instagram token rotation was done.
 *
 * POST { password }
 *   → 200 { success, refreshedAt }
 *   → 401 wrong password
 *   → 403 password is admin-level, not super
 *   → 405 non-POST
 *
 * The flow this supports: Alex runs `node scripts/refresh-instagram-token.mjs`
 * locally, pastes the new token into Vercel, redeploys — and then clicks the
 * "Mark as Refreshed" button in the admin Integrations tab. That button
 * hits this endpoint, which upserts `updated_at = now()` on the
 * `system_state` row keyed by 'ig_token_refreshed'. The admin card + the
 * daily reminder cron both read that timestamp to know when the next
 * rotation is due (~50 days after the last one).
 *
 * Superadmin-gated on the same principle as portal-delete: we don't want
 * Vero accidentally hitting this and desynchronizing the reminder clock.
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
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, error: auth.error });
  }
  const superCheck = requireSuper(auth.level);
  if (!superCheck.ok) {
    return res.status(superCheck.status).json({ success: false, error: superCheck.error });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      INSERT INTO system_state (key, updated_at)
      VALUES ('ig_token_refreshed', NOW())
      ON CONFLICT (key) DO UPDATE SET updated_at = NOW()
      RETURNING updated_at
    `) as Array<{ updated_at: string }>;

    return res.status(200).json({
      success: true,
      refreshedAt: rows[0]?.updated_at ?? new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin/instagram-mark-refreshed] DB write failed:', err);
    return res.status(500).json({ success: false, error: 'Could not save timestamp' });
  }
}
