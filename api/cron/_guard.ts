/**
 * Shared wrapper every cron handler runs through. Three jobs:
 *
 *   1. Register / heal the cron_jobs row for `name`. On the first
 *      call after deploy this INSERTs it; on subsequent calls the
 *      UPSERT rewrites path/schedule/description so any drift between
 *      code and DB self-heals without a manual sync step.
 *
 *   2. Read cron_jobs.enabled. If false, write a 'skipped' run row
 *      and return { skipped: true } WITHOUT calling work(). The admin
 *      toggle in AdminCrons is the single source of truth for whether
 *      a cron does anything — flipping it off pauses instantly, no
 *      redeploy or vercel.json edit required.
 *
 *   3. Run work() with try/finally bookkeeping — insert a 'running'
 *      row up front, then UPDATE it to 'ok' + duration_ms on success
 *      or 'error' + first-line-of-message on throw. The 'running'
 *      insert is deliberately BEFORE the try so a work() exception
 *      still hits a real row (rather than leaking an unrecorded run).
 *
 * Fail-open on infrastructure errors: if the cron_jobs table itself
 * has a problem (missing during rollout, transient DB blip, ...) the
 * work still runs. The alternative — silently NOT running scheduled
 * work because the meta-table is broken — is scarier than a run that
 * doesn't get logged. Errors log to the function output; that's the
 * escape hatch.
 */

import { getDb } from '../_db.js';
import { randomUUID } from 'crypto';

export type CronTrigger = 'schedule' | 'manual';

export interface GuardResult<T> {
  /** True if the enabled flag was off and work() was never called. */
  skipped: boolean;
  /** work()'s return value; undefined if skipped or work() threw. */
  ok?: T;
  /** Non-null if work() threw; message is the first line of the error. */
  error?: string;
}

interface GuardInput {
  name: string;
  path: string;
  schedule: string;
  description: string;
  trigger: CronTrigger;
}

/**
 * Wrap a cron handler body. `work` is only invoked when the DB says
 * this cron is enabled — a disabled cron records a 'skipped' run and
 * returns early. The caller decides how to shape its HTTP response
 * from the returned struct.
 */
export async function runGuarded<T>(
  input: GuardInput,
  work: () => Promise<T>,
): Promise<GuardResult<T>> {
  const { name, path, schedule, description, trigger } = input;

  // ── 1. Upsert the cron_jobs row + read enabled ──
  // Doing both in a single round-trip keeps the "warm start" path
  // fast. RETURNING gives us the row's id (needed for cron_runs FK)
  // and current enabled flag in one shot. On the cold path where
  // the table doesn't exist, we swallow the error and fall through
  // to running the work — see the fail-open note at the top.
  let cronJobId: string | null = null;
  let enabled = true;
  try {
    const sql = getDb();
    const rows = (await sql`
      INSERT INTO cron_jobs (name, path, schedule, description)
      VALUES (${name}, ${path}, ${schedule}, ${description})
      ON CONFLICT (name) DO UPDATE SET
        path = EXCLUDED.path,
        schedule = EXCLUDED.schedule,
        description = EXCLUDED.description
      RETURNING id, enabled
    `) as Array<{ id: string; enabled: boolean }>;
    if (rows[0]) {
      cronJobId = rows[0].id;
      enabled = rows[0].enabled;
    }
  } catch (err) {
    console.error(
      `[cron-guard/${name}] register/read failed — running work anyway (fail-open):`,
      err,
    );
    // No cron_jobs row → we can't write run rows either. Just do the
    // work and return; the caller still gets a normal result.
    try {
      const ok = await work();
      return { skipped: false, ok };
    } catch (workErr) {
      return { skipped: false, error: firstLine(workErr) };
    }
  }

  // ── 2. Disabled? Record + short-circuit. ──
  if (!enabled) {
    try {
      // cronJobId is null only when the upsert above failed (e.g. the table
      // does not exist yet). There is nothing to attach a run row to in that
      // case, so skip the bookkeeping rather than crash the job — this guard
      // is fail-open by design, see the note at the top of the file.
      if (cronJobId) await insertRun(cronJobId, 'skipped', trigger, null, null);
    } catch (err) {
      console.error(`[cron-guard/${name}] skipped-row insert failed:`, err);
    }
    return { skipped: true };
  }

  // ── 3. Insert 'running' up front so a mid-work crash still leaves
  //     a row (marked 'running' forever — a signal the process was
  //     killed). Then run work, then UPDATE with the outcome. ──
  const runId = randomUUID();
  try {
    if (cronJobId) await insertRunWithId(runId, cronJobId, 'running', trigger);
  } catch (err) {
    // Even the running-marker insert failed. Still run the work —
    // fail-open — but we won't be able to record the outcome either.
    console.error(`[cron-guard/${name}] running-row insert failed:`, err);
    try {
      const ok = await work();
      return { skipped: false, ok };
    } catch (workErr) {
      return { skipped: false, error: firstLine(workErr) };
    }
  }

  const startedMs = Date.now();
  try {
    const ok = await work();
    await finalizeRun(runId, 'ok', Date.now() - startedMs, null, ok);
    return { skipped: false, ok };
  } catch (workErr) {
    const msg = firstLine(workErr);
    // Best-effort finalize — if THIS also fails we've done what we
    // can. The 'running' row lingers as a signal for the operator.
    try {
      await finalizeRun(runId, 'error', Date.now() - startedMs, msg);
    } catch (finalizeErr) {
      console.error(`[cron-guard/${name}] error-finalize failed:`, finalizeErr);
    }
    return { skipped: false, error: msg };
  }
}

async function insertRun(
  cronJobId: string,
  status: 'ok' | 'skipped' | 'error',
  trigger: CronTrigger,
  durationMs: number | null,
  errorMessage: string | null,
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO cron_runs (cron_job_id, status, trigger, finished_at, duration_ms, error_message)
    VALUES (${cronJobId}, ${status}, ${trigger}, NOW(), ${durationMs}, ${errorMessage})
  `;
}

async function insertRunWithId(
  runId: string,
  cronJobId: string,
  status: 'running',
  trigger: CronTrigger,
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO cron_runs (id, cron_job_id, status, trigger)
    VALUES (${runId}, ${cronJobId}, ${status}, ${trigger})
  `;
}

/**
 * Serialize a work() return value for the cron_runs.result column.
 *
 * Bounded on purpose: a cron that returns something enormous (a full file
 * listing, say) must not write a multi-megabyte row on every run. Anything that
 * is not a plain object is wrapped so the column shape stays predictable.
 */
function serializeResult(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    const payload =
      typeof value === 'object' && !Array.isArray(value) ? value : { value };
    const json = JSON.stringify(payload);
    if (json.length > 8000) {
      return JSON.stringify({ truncated: true, bytes: json.length });
    }
    return json;
  } catch {
    // Circular or otherwise unserializable. Not worth failing the run over.
    return null;
  }
}

async function finalizeRun(
  runId: string,
  status: 'ok' | 'error',
  durationMs: number,
  errorMessage: string | null,
  result?: unknown,
): Promise<void> {
  const sql = getDb();
  const serialized = serializeResult(result);
  try {
    await sql`
      UPDATE cron_runs
      SET status = ${status},
          finished_at = NOW(),
          duration_ms = ${durationMs},
          error_message = ${errorMessage},
          result = ${serialized}::jsonb
      WHERE id = ${runId}
    `;
  } catch (err) {
    // Migration 028 adds cron_runs.result, and migrations here are applied BY
    // HAND — so this code can legitimately be live before the column exists.
    // Retry without it rather than failing the run: losing the summary is a
    // cosmetic regression, a thrown finalize is a broken cron.
    console.error('[cron-guard] result write failed, retrying without it:', err);
    await sql`
      UPDATE cron_runs
      SET status = ${status},
          finished_at = NOW(),
          duration_ms = ${durationMs},
          error_message = ${errorMessage}
      WHERE id = ${runId}
    `;
  }
}

/**
 * Compress an unknown error to a single line for the error_message
 * column. Multi-line stack traces would blow out the history table's
 * display; the first line is where the useful signal usually lives.
 */
function firstLine(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = raw.split('\n')[0].trim();
  // Bound the width so a rogue "here's the entire JSON blob" error
  // doesn't blow out the DB row.
  return line.length > 500 ? line.slice(0, 500) + '…' : line;
}
