-- 025 — Hash client portal passwords.
--
-- Run once BY HAND against production Neon. There is no migration runner.
-- Safe to re-run. ADDITIVE ONLY — nothing existing is changed or dropped, so
-- this is safe to apply BEFORE the code that uses it is deployed.
--
-- ─── The problem ─────────────────────────────────────────────────────────
--
-- 001-baseline-client-portals.sql:72 stores client_password in PLAINTEXT. Its
-- own comment calls it "SECURITY: plaintext today, planned bcrypt migration".
-- It has been that way ever since. Anyone with database access can read every
-- client's portal password — and people reuse passwords.
--
-- ─── Why there is no backfill in this file ───────────────────────────────
--
-- SQL cannot hash these: you need the plaintext, and hashing it here would mean
-- reading every client's password out of the database into a process, which is
-- the exact exposure we are removing.
--
-- Instead the application upgrades lazily. api/portal/_password.ts verifies
-- against the hash when there is one, falls back to the plaintext column when
-- there is not, and writes a hash on the next successful login. Every active
-- client migrates the next time they sign in, using the password they already
-- have. Nothing to announce, no forced resets.
--
-- ─── Why client_password is NOT dropped here ─────────────────────────────
--
-- Until a client has logged in once, plaintext is still the only credential
-- that row has. Dropping it now would lock those clients out. That is a
-- separate migration, once this shows the backfill is effectively done:
--
--   SELECT
--     count(*) FILTER (WHERE client_password_hash IS NOT NULL) AS migrated,
--     count(*) FILTER (WHERE client_password IS NOT NULL
--                        AND client_password_hash IS NULL)     AS still_plaintext
--   FROM client_portals WHERE mode = 'full';
--
-- ─── gallery_password is deliberately untouched ──────────────────────────
--
-- That one is a bearer token in a shareable URL (/portal/pass?password=...) and
-- AdminClientDetail renders it so Vero can re-send the link. Hashing it would
-- mean she could never see it again, and it only guards a Drive URL that is
-- itself shareable. Different threat model, left as-is on purpose.

ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS client_password_hash TEXT;

-- Password reset. Only the SHA-256 of the token is stored, so a database leak
-- does not hand over working reset links.
ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS reset_token_hash       TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;

-- Partial unique index: only enforced on rows with a live token, so the
-- overwhelming majority of rows (NULL) cost nothing.
CREATE UNIQUE INDEX IF NOT EXISTS client_portals_reset_token_idx
  ON client_portals (reset_token_hash)
  WHERE reset_token_hash IS NOT NULL;
