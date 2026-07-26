-- Adds a `value` column to system_state so we can store small opaque
-- payloads alongside the timestamp. First use: a hash of the current
-- IG_ACCESS_TOKEN. When the auto-detector notices the current env
-- var's hash differs from what we last saw, it knows a rotation
-- happened outside the admin UI and can auto-update the "last
-- refreshed" timestamp. Eliminates the manual "Mark as Refreshed"
-- click for the common flow (rotate → paste into Vercel → redeploy).
--
-- Nullable so existing rows (currently just the seeded ig_token_refreshed)
-- keep working without a value; the detector treats NULL as "haven't
-- seen this token yet, bootstrap the hash without touching the timestamp".
--
-- Run this once against production Neon (Neon console → SQL editor).

ALTER TABLE system_state ADD COLUMN IF NOT EXISTS value TEXT;
