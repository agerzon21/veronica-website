/**
 * Super-admin only: last N runs for a single cron.
 *
 * POST { password, name, limit? }
 *   → 200 { success, runs: [{ startedAt, finishedAt, status, trigger,
 *           durationMs, errorMessage }] }
 *   → 400 missing/invalid input
 *   → 401 wrong password
 *   → 403 admin-level (not super)
 *   → 405 non-POST
 *
 * Lookup is a subquery on cron_jobs.name → id so the caller doesn't
 * need to know the internal UUID. Ordered newest-first; capped by
 * `limit` (default 20, hard max 200 so a wild query can't drag the
 * table out of Neon).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin, requireSuper } from '../_admin-auth.js';
import { getDb } from '../_db.js';

interface Row {
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  duration_ms: number | null;
  error_message: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

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
  if (typeof name !== 'string' || !name) {
    return res.status(400).json({ success: false, error: 'name (string) required' });
  }
  const rawLimit = Number(req.body?.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT started_at, finished_at, status, trigger, duration_ms, error_message
      FROM cron_runs
      WHERE cron_job_id = (SELECT id FROM cron_jobs WHERE name = ${name})
      ORDER BY started_at DESC
      LIMIT ${limit}
    `) as Row[];

    const runs = rows.map((r) => ({
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      status: r.status,
      trigger: r.trigger,
      durationMs: r.duration_ms,
      errorMessage: r.error_message,
    }));

    return res.status(200).json({ success: true, runs });
  } catch (err) {
    console.error('[admin/crons-history] DB read failed:', err);
    return res.status(500).json({ success: false, error: 'Database unreachable' });
  }
}
