/**
 * Reports on the last-known Instagram token rotation, derived from the
 * `system_state` row keyed by 'ig_token_refreshed' (upserted by the
 * "Mark as Refreshed" button in the admin UI).
 *
 * POST { password }
 *   → 200 { success, status, refreshedAt, daysSinceRefresh,
 *           daysUntilExpiry, userId }
 *   → 401 wrong password
 *   → 405 non-POST
 *
 * Deliberately does NOT call Meta's debug_token endpoint — that path
 * required us to store IG_APP_SECRET in Vercel just so we could check
 * expiry, and Alex correctly pointed out the simpler path is: assume
 * every rotation lasts exactly 60 days, track when the last one
 * happened, count from there. Same accuracy for practical purposes;
 * one fewer secret on the server.
 *
 * `status` maps to badge colors in the UI:
 *   fresh    → green   (rotated <40 days ago; plenty of runway)
 *   aging    → amber   (40–50 days; getting close, cron may fire soon)
 *   overdue  → red     (>50 days; rotate NOW — cron already emailed)
 *   unknown  → grey    (never marked; run migration or click the button)
 *
 * Accepts either admin OR super — read-only.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';
import { getDb } from '../_db.js';

// A long-lived Instagram token is 60 days from the moment it's minted.
// We alert at day 50 (10 days before expiry) — plenty of runway to
// notice + rotate.
const TOKEN_LIFETIME_DAYS = 60;
const AGING_THRESHOLD_DAYS = 40;
const OVERDUE_THRESHOLD_DAYS = 50;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, error: auth.error });
  }

  const userId = process.env.IG_USER_ID ?? null;

  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT updated_at
      FROM system_state
      WHERE key = 'ig_token_refreshed'
      LIMIT 1
    `) as Array<{ updated_at: string }>;

    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        status: 'unknown',
        refreshedAt: null,
        daysSinceRefresh: null,
        daysUntilExpiry: null,
        userId,
        message:
          'No rotation date on record. Run the DB migration (db/migrations/002-system-state.sql) or rotate + Mark as Refreshed now.',
      });
    }

    const refreshedAt = rows[0].updated_at;
    const daysSinceRefresh = Math.floor(
      (Date.now() - new Date(refreshedAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    const daysUntilExpiry = TOKEN_LIFETIME_DAYS - daysSinceRefresh;

    let status: 'fresh' | 'aging' | 'overdue';
    if (daysSinceRefresh >= OVERDUE_THRESHOLD_DAYS) {
      status = 'overdue';
    } else if (daysSinceRefresh >= AGING_THRESHOLD_DAYS) {
      status = 'aging';
    } else {
      status = 'fresh';
    }

    return res.status(200).json({
      success: true,
      status,
      refreshedAt,
      daysSinceRefresh,
      daysUntilExpiry,
      userId,
    });
  } catch (err) {
    console.error('[admin/instagram-status] DB read failed:', err);
    // If the table doesn't exist yet (migration not run), report that
    // specifically instead of a generic 500 — the admin UI can prompt
    // Alex to run the migration.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('system_state') && msg.toLowerCase().includes('does not exist')) {
      return res.status(200).json({
        success: true,
        status: 'unknown',
        refreshedAt: null,
        daysSinceRefresh: null,
        daysUntilExpiry: null,
        userId,
        message:
          'The system_state table has not been created yet. Run db/migrations/002-system-state.sql against production Neon.',
      });
    }
    return res.status(500).json({ success: false, error: 'Database unreachable' });
  }
}
