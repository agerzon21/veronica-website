-- Adds a tiny key/value table for infrastructure state that doesn't
-- naturally live on client_portals. First use: tracking when the
-- Instagram token was last refreshed, so the admin panel + cron
-- reminder can show "N days since last rotation" without needing
-- to call Meta's debug_token endpoint (which would require storing
-- IG_APP_SECRET on the server).
--
-- One row per key. Timestamp is the "when it was last set" — for
-- the ig-token case that's the moment of the manual rotation.
--
-- Seed row for the current install: today's manual rotation
-- (2026-07-24), so /admin doesn't start in a "never refreshed"
-- state on first load.
--
-- Run this once against production Neon (Neon console → SQL editor).

CREATE TABLE IF NOT EXISTS system_state (
  key         TEXT PRIMARY KEY,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the Instagram-token row with today's manual rotation date.
-- Safe to re-run: ON CONFLICT means re-execution just no-ops.
INSERT INTO system_state (key, updated_at)
VALUES ('ig_token_refreshed', '2026-07-24T20:00:00Z')
ON CONFLICT (key) DO NOTHING;
