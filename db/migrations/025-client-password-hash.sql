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
-- ─── The backfill ────────────────────────────────────────────────────────
--
-- scripts/hash-client-passwords.mjs hashes every existing plaintext password
-- and nulls the column, in one pass. It has been run: 4 rows hashed, 0
-- plaintext remaining.
--
-- The first version of this file argued AGAINST a backfill, on the grounds that
-- a script would mean "reading every client's password out of the database".
-- That was wrong, and the owner caught it. The plaintext is already in the
-- database — that IS the exposure. Reading it once in a script that immediately
-- replaces it with a hash is how the exposure ends. Relying on lazy upgrade
-- instead would have left those passwords readable indefinitely for any client
-- who never signs in again, which is most of them once a wedding is delivered.
--
-- api/portal/_password.ts still supports the plaintext fallback. After this
-- backfill it should never fire; it stays only as a safety net for a row
-- written between deploy and the backfill run.
--
-- ─── Dropping client_password ────────────────────────────────────────────
--
-- Now safe. Left in place for one release as a rollback path, then dropped in
-- its own migration. Confirm first:
--
--   SELECT count(*) FROM client_portals WHERE client_password IS NOT NULL;
--   -- must be 0
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
