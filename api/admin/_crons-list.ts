/**
 * Super-admin only: enumerate every registered cron with its enabled
 * flag and last-run info. Drives the AdminCrons panel.
 *
 * POST { password }
 *   → 200 { success, crons: [{ id, name, path, schedule, description,
 *           enabled, lastRun: {...} | null }] }
 *   → 401 wrong password
 *   → 403 admin-level (not super)
 *   → 405 non-POST
 *
 * "Last run" is one LEFT JOIN LATERAL — the DB picks the single most
 * recent cron_runs row per cron_jobs row without pulling the whole
 * history into the app. Falls back to lastRun: null for a cron that
 * has never executed (which shouldn't happen once vercel.json is
 * wired up, but is the honest state during a first-deploy rollout).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin, requireSuper } from '../_admin-auth.js';
import { getDb } from '../_db.js';
import { UNSCHEDULED_CRON_META } from '../cron.js';

interface Row {
  id: string;
  name: string;
  path: string;
  schedule: string;
  description: string;
  enabled: boolean;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_status: string | null;
  last_duration_ms: number | null;
  last_error_message: string | null;
  last_trigger: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });
  const superCheck = requireSuper(auth.level);
  if (!superCheck.ok) return res.status(superCheck.status).json({ success: false, error: superCheck.error });

  try {
    const sql = getDb();

    // Seed rows for jobs that have no vercel.json schedule entry. Without this
    // they can never appear here: the list reads cron_jobs, only runGuarded
    // writes cron_jobs, and runGuarded only runs when the job runs — which for
    // an unscheduled job can only be triggered from this list. ON CONFLICT keeps
    // the operator's `enabled` choice intact and only refreshes the metadata.
    for (const meta of UNSCHEDULED_CRON_META) {
      await sql`
        INSERT INTO cron_jobs (name, path, schedule, description)
        VALUES (${meta.name}, ${meta.path}, ${meta.schedule}, ${meta.description})
        ON CONFLICT (name) DO UPDATE SET
          path = EXCLUDED.path,
          schedule = EXCLUDED.schedule,
          description = EXCLUDED.description
      `;
    }

    const rows = (await sql`
      SELECT
        c.id, c.name, c.path, c.schedule, c.description, c.enabled,
        r.started_at    AS last_started_at,
        r.finished_at   AS last_finished_at,
        r.status        AS last_status,
        r.duration_ms   AS last_duration_ms,
        r.error_message AS last_error_message,
        r.trigger       AS last_trigger
      FROM cron_jobs c
      LEFT JOIN LATERAL (
        SELECT started_at, finished_at, status, duration_ms, error_message, trigger
        FROM cron_runs
        WHERE cron_job_id = c.id
        ORDER BY started_at DESC
        LIMIT 1
      ) r ON TRUE
      ORDER BY c.name ASC
    `) as Row[];

    const crons = rows.map((r) => ({
      id: r.id,
      name: r.name,
      path: r.path,
      schedule: r.schedule,
      description: r.description,
      enabled: r.enabled,
      lastRun: r.last_started_at
        ? {
            startedAt: r.last_started_at,
            finishedAt: r.last_finished_at,
            status: r.last_status,
            durationMs: r.last_duration_ms,
            errorMessage: r.last_error_message,
            trigger: r.last_trigger,
          }
        : null,
    }));

    return res.status(200).json({ success: true, crons });
  } catch (err) {
    console.error('[admin/crons-list] DB read failed:', err);
    const msg = err instanceof Error ? err.message : String(err);
    // Table missing = migration not run yet. Report gracefully so the
    // UI can prompt the operator instead of showing a scary 500.
    if (msg.includes('cron_jobs') && msg.toLowerCase().includes('does not exist')) {
      return res.status(200).json({
        success: true,
        crons: [],
        migrationRequired:
          'The cron_jobs table has not been created yet. Run db/migrations/013-cron-jobs.sql against production Neon.',
      });
    }
    return res.status(500).json({ success: false, error: 'Database unreachable' });
  }
}
