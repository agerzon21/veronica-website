-- 026 — Admin users and sessions.
--
-- Run once BY HAND against production Neon. Safe to re-run. ADDITIVE ONLY —
-- creates two new tables and touches nothing existing, so it is safe to apply
-- before the code that uses it is deployed.
--
-- ─── What this replaces ──────────────────────────────────────────────────
--
-- Admin credentials live in Vercel environment variables today:
--   LOGIN_ADMIN_EMAIL + ADMIN_PASSWORD        → level 'admin' (Vero)
--   LOGIN_SUPER_EMAIL + SUPER_ADMIN_PASSWORD  → level 'super' (Alex)
--
-- Three problems with that. Rotating a password is a redeploy. There is no way
-- to add a third person without shipping code. And because there is no session,
-- the panel keeps the raw password in React state and sends it with every
-- single request — which is also why any reload logs you out.
--
-- ─── The cutover is deliberately not a cutover ───────────────────────────
--
-- requireAdmin() accepts EITHER a session token or the old env password, and
-- keeps doing so. The env vars stay valid the entire time. There is no moment
-- where a bad row or a failed seed can lock anyone out of their own admin
-- panel — worst case the token path fails and the password path still works.
--
-- Drop the env-var branch only once both accounts have signed in with a
-- database-backed password and it has been that way for a while.

CREATE TABLE IF NOT EXISTS admin_users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  email          TEXT NOT NULL,
  -- scrypt, same format as api/portal/_password.ts: scrypt$<saltHex>$<keyHex>.
  password_hash  TEXT NOT NULL,
  display_name   TEXT,

  -- Mirrors the existing two-tier model in api/_admin-auth.ts exactly:
  -- 'admin' can read and edit, 'super' can additionally delete.
  level          TEXT NOT NULL DEFAULT 'admin' CHECK (level IN ('admin', 'super')),

  -- Soft disable, so removing someone's access does not orphan the audit trail
  -- of what they did.
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ
);

-- Case-insensitive uniqueness. Emails are compared lower-cased everywhere, and
-- without this "Alex@" and "alex@" would be two accounts.
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_idx ON admin_users (LOWER(email));

CREATE TABLE IF NOT EXISTS admin_sessions (
  -- SHA-256 of the token. The raw token exists only in the browser, so a
  -- database leak does not hand over live sessions. Same reasoning as
  -- client_portals.reset_token_hash in migration 025.
  token_hash  TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  -- Rough provenance for ""was that me?"". Not security, just context.
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS admin_sessions_user_idx    ON admin_sessions (user_id);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON admin_sessions (expires_at);

-- After applying this, run:
--   node scripts/seed-admin-users.mjs
-- It inserts Vero and Alex with their CURRENT env-var passwords already hashed,
-- so the switch to database-backed auth is invisible — the same passwords keep
-- working, and nobody has to be told anything.
