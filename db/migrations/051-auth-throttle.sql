-- Failed-attempt counters for the client portal's password checks.
--
-- WHY THIS EXISTS
-- Every portal endpoint answers a wrong password with a 401 after a fixed
-- 750 ms delay, but nothing counted the attempts, so the delay was the only
-- brake and requests in parallel step straight past it. A gallery password is
-- a short bearer token in a shareable link, and a client's portal holds their
-- contract and home address. api/portal/_throttle.ts counts failures here per
-- email and per IP over a 15 minute window and answers 429 past a limit.
--
-- KEYS ARE HASHES. A row is keyed by sha256 of "email:<address>" or
-- "ip:<address>", never the address itself: this table exists to slow
-- guessing down, not to keep a list of who tried what.
--
-- Rows are tiny and few (failures only), and the module deletes anything a
-- week old as it writes, so there is no cron.
--
-- Safe before the code that reads it, and the code is safe before it: the
-- module treats a missing table as "no limit", never as a reason to refuse.

CREATE TABLE IF NOT EXISTS auth_throttle (
  key                TEXT PRIMARY KEY,
  failures           INTEGER NOT NULL DEFAULT 0,
  window_started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_failure_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE auth_throttle IS
  'Failed portal password attempts per hashed email or IP, in a 15 minute window. See api/portal/_throttle.ts.';

-- Undo:
--   DROP TABLE IF EXISTS auth_throttle;
