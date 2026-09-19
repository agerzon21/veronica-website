-- 036-schema-migrations.sql
--
-- Make the database able to say which migrations it has.
--
-- Until now the answer lived only in memory: the .sql files record what was
-- WRITTEN, never what was RUN, so nobody could tell whether a given migration
-- had reached production. That matters more than it sounds. 017b-drop-channel-
-- default.sql removes a default from messages.channel, which is NOT NULL, so if
-- 017b ran and an insert path forgets to set channel, that insert throws; if it
-- never ran, the same insert silently files the message under the old default.
-- Two very different production behaviours, and no way to know which one is
-- live.
--
-- This table is the answer. From here on every migration records itself.
--
-- ADDITIVE AND INERT. It creates one table that nothing else references and
-- touches no existing row. Running it changes no application behaviour
-- whatsoever. It is safe to run at any time, safe to re-run, and safe to drop.
--
-- Deliberately plain SQL with no extensions and no Neon-specific types, because
-- this whole service is eventually moving off Neon and a migration ledger that
-- does not survive the move is worse than none.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  -- The filename exactly as it appears in db/migrations, e.g. '017b-drop-
  -- channel-default.sql'. Primary key because a file is applied once.
  filename    TEXT PRIMARY KEY,

  -- SHA-256 of the file's bytes at the moment it was applied. This is the
  -- whole point of storing anything beyond the name: it catches a migration
  -- file EDITED AFTER it was applied, which is the failure mode that silently
  -- desynchronises a repo from its database and is otherwise invisible. The
  -- file reads correct, the database disagrees, and nothing complains.
  checksum    TEXT NOT NULL,

  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who ran it. Defaults to the Postgres role, which is enough to tell a
  -- human run apart from an automated one.
  applied_by  TEXT NOT NULL DEFAULT CURRENT_USER,

  -- TRUE means "recorded as applied WITHOUT being executed". Used exactly once,
  -- to baseline the 36 migrations that were already run by hand before this
  -- ledger existed. Keeping it as a column rather than pretending those rows
  -- are ordinary is the honest record: an adopted row asserts that the schema
  -- LOOKS right, not that this tool watched it happen.
  adopted     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Wall-clock duration of the apply, or NULL for an adopted row. Cheap to
  -- store and the first thing anyone wants when a migration hangs in
  -- production.
  run_ms      INTEGER
);

COMMENT ON TABLE schema_migrations IS
  'One row per applied migration file. Written by scripts/migrate.mjs. Rows
   with adopted = TRUE were recorded during the one-time baseline and were not
   executed by the runner.';

-- Answers "what landed recently", which is the first question after a bad
-- deploy. Small table, but the index costs nothing and the query is the one
-- anyone actually runs.
CREATE INDEX IF NOT EXISTS schema_migrations_applied_at_idx
  ON schema_migrations (applied_at DESC);

COMMIT;

-- Undo:
--   DROP TABLE IF EXISTS schema_migrations;
-- Nothing references it, so dropping it loses the history and breaks nothing.
