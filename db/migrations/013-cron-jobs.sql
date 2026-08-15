-- Cron control-plane tables. Give the super-admin a single place to see
-- every registered Vercel cron, toggle each on/off without a redeploy,
-- fire an ad-hoc "run now", and inspect a rolling history of past runs.
--
-- Why this exists at all:
--   Vercel's dashboard shows cron schedules but no enable toggle, no run
--   history, no manual trigger. Rather than block Alex on Vercel adding
--   those, we self-serve: each cron handler runs through runGuarded()
--   in api/cron/_guard.ts, which reads cron_jobs.enabled here to decide
--   whether to actually do the work, and writes a cron_runs row every
--   time. The admin UI (AdminCrons) drives this table directly.
--
-- Registration is transparent: the first time a handler runs after
-- deploy it upserts its own row here (name/path/schedule/description
-- pulled from the wrapping call). No manual DDL step to add a new
-- cron — write the handler, deploy, done. That also means schedule /
-- description drift between vercel.json and this table auto-heals on
-- the next invocation.
--
-- Fields:
--   cron_jobs.enabled — the on/off switch the admin toggles. When
--     false, runGuarded() records a 'skipped' run and returns without
--     calling the work function. NEVER unregister a cron here; the
--     next auto-upsert would just recreate it and blow away the
--     enabled=false toggle. Deletion of a cron is a code-level
--     operation (remove from HANDLERS + vercel.json + delete rows).
--
--   cron_runs.trigger — 'schedule' when Vercel Cron fired it,
--     'manual' when the admin hit "Run now". Lets the history table
--     distinguish autopilot from human intervention when debugging.
--
--   cron_runs.status — 'running' while in-flight (updated to
--     'ok'/'error' on completion). A row stuck on 'running' longer
--     than Vercel's function timeout means the process was killed
--     without our finally block getting to run — treat as failed.
--
-- Run once against production Neon. Safe re-run: CREATE TABLE IF NOT
-- EXISTS + CREATE OR REPLACE FUNCTION.

CREATE TABLE IF NOT EXISTS cron_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Matches the key in api/cron.ts HANDLERS map. Unique so the guard's
  -- upsert can idempotently register-or-refresh on every invocation.
  name         TEXT UNIQUE NOT NULL,
  -- Canonical URL Vercel Cron hits. Stored so the admin UI can show
  -- it without having to import the code, and so any drift between
  -- vercel.json and reality is visible in the DB.
  path         TEXT NOT NULL,
  -- Standard 5-field cron expression. Human-formatted in the UI via
  -- a small lookup in AdminCrons.tsx.
  schedule     TEXT NOT NULL,
  -- One-line human description surfaced in the admin panel. Filled
  -- in from the runGuarded() call site; blank string default so the
  -- first sync doesn't NULL-out until every handler is retrofitted.
  description  TEXT NOT NULL DEFAULT '',
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cron_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cascade so removing a cron (rare — usually retired via disable,
  -- not delete) cleans up its history too. Keeps the table bounded
  -- without a separate janitor.
  cron_job_id    UUID NOT NULL REFERENCES cron_jobs(id) ON DELETE CASCADE,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Null while status='running'. Set at completion in the same
  -- UPDATE that flips status → 'ok' or 'error'.
  finished_at    TIMESTAMPTZ,
  status         TEXT NOT NULL
                   CHECK (status IN ('ok', 'skipped', 'error', 'running')),
  trigger        TEXT NOT NULL DEFAULT 'schedule'
                   CHECK (trigger IN ('schedule', 'manual')),
  error_message  TEXT,
  -- Milliseconds; null while still running or if the finally block
  -- couldn't stamp it. Wall-clock time of the work() call, not
  -- including the enabled-flag lookup overhead.
  duration_ms    INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

-- "Recent history for cron X" is the primary query pattern; index it
-- so pulling the latest 20 rows for a given job is a small index scan
-- regardless of how much accumulated history sits behind it.
CREATE INDEX IF NOT EXISTS cron_runs_job_started_idx
  ON cron_runs (cron_job_id, started_at DESC);

-- Auto-bump cron_jobs.updated_at on any change so the UI can show
-- "toggled 5 min ago" without extra bookkeeping. Same pattern as
-- reviews / journal_posts / ai_context / gallery_photos.
CREATE OR REPLACE FUNCTION touch_cron_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cron_jobs_touch_updated_at ON cron_jobs;
CREATE TRIGGER cron_jobs_touch_updated_at
  BEFORE UPDATE ON cron_jobs
  FOR EACH ROW EXECUTE FUNCTION touch_cron_jobs_updated_at();
