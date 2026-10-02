-- Who changed money on a booking, when, and from what to what (audit M11).
--
-- WHY THIS EXISTS
-- A booking's money can be changed in several places (the price and retainer,
-- the free-booking switch, the tax setting, payments typed in, payments
-- deleted, card-fee waivers, extra charges, insurance) and none of them kept
-- a record. A total that moved from $3,000 to $2,800 left no trace of who
-- moved it or when, and a deleted payment left nothing at all. The money
-- screens were right about the present and silent about the past.
--
-- Written in the SAME transaction as the change wherever the change is a
-- transaction, so there is never a change without its row or a row without
-- its change. api/_money-history.ts holds the one insert everyone uses.
--
-- NO FOREIGN KEY, on purpose. A booking can be deleted once it has no
-- payments, and the history of how its payments were removed is exactly what
-- should survive that. booking_name is a snapshot for the same reason.
--
-- detail is structured (amounts, methods, before and after), not prose, so
-- the admin shows it in whichever language the reader uses.

CREATE TABLE IF NOT EXISTS money_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_portal_id  UUID NOT NULL,
  booking_name      TEXT,
  at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor             TEXT NOT NULL,
  action            TEXT NOT NULL,
  detail            JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS money_history_portal_at
  ON money_history (client_portal_id, at DESC);

COMMENT ON TABLE money_history IS
  'Every human change to a booking''s money, written with the change. See api/_money-history.ts.';

-- Undo:
--   DROP TABLE IF EXISTS money_history;
