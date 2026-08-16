-- Baseline + extension for contact_submissions — the "leads" table.
--
-- The base three columns (id, name, email, shoot_type, preferred_date,
-- location, message, status, created_at) were created by hand in Neon's
-- SQL editor before we had a migrations folder — same story as the
-- client_portals / payment_entries / payment_installments trio captured
-- in 001-baseline-client-portals.sql. The DDL matches what DATABASE.md
-- lines 61-71 documents and what api/contact.ts already inserts into.
--
-- This migration does two things:
--   1. Retro-captures the existing table's schema so a fresh Neon branch
--      can be spun up from zero without touching prod.
--   2. Adds three new columns to support the admin "Leads" section
--      (Phase 2 of the ongoing transitions plan):
--        - notes           — free-text Vero jots against a lead ("called
--                            back Tue", "ghosted after quote", etc.)
--        - contacted_at    — timestamp of first outbound reply. Distinct
--                            from status flips (a lead can be 'replied'
--                            without us caring about the exact time; but
--                            if we DO care later, this holds it).
--        - updated_at      — mirrors the pattern from reviews / journal /
--                            gallery_photos so status/notes edits leave
--                            an audit-friendly trace. Trigger below keeps
--                            it fresh on every UPDATE.
--
-- Fields (existing + new):
--   name             — required, from the form.
--   email            — required, from the form.
--   shoot_type       — one of: 'Portrait Session' | 'Wedding Photography'
--                      | 'Family Session' | 'Maternity Session' | 'Other'
--                      (validated client-side, not enforced in DB — we
--                      don't want a form-schema change to require a
--                      migration; freeform is fine).
--   preferred_date   — text, not date. HTML5 date input can yield 'YYYY-MM-DD'
--                      but also arbitrary text if a future form lets the
--                      client type it. Kept as text to avoid parse errors
--                      breaking submissions.
--   location         — freeform text ("Punta Cana", "Scranton, PA", "TBD").
--   message          — the actual inquiry body.
--   status           — 'new' | 'contacted' | 'replied' | 'booked' | 'ghosted'
--                      | 'spam'. Vero flips these from the admin UI. Not
--                      enforced with CHECK so we can add new statuses
--                      without a migration; validated app-side.
--   notes            — internal-only free text. Never shown to the lead.
--   contacted_at     — first outbound reply timestamp. NULL until Vero
--                      marks the lead 'contacted' or 'replied'.
--
-- Run once against prod Neon. Safe re-run: CREATE TABLE IF NOT EXISTS
-- + ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS +
-- DROP TRIGGER IF EXISTS / CREATE TRIGGER. Idempotent end-to-end.

-- ────────────────────────────────────────────────────────────────
-- Base table (already in prod; this is the retro-baseline block).

CREATE TABLE IF NOT EXISTS contact_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  shoot_type      TEXT,
  preferred_date  TEXT,
  location        TEXT,
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'new',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────
-- Extension columns for the admin Leads section (Phase 2).

ALTER TABLE contact_submissions
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE contact_submissions
  ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ;

ALTER TABLE contact_submissions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ────────────────────────────────────────────────────────────────
-- Prod cleanup: the hand-created table in Neon has status NULLABLE
-- (see DATABASE.md pre-014 doc). The retro CREATE TABLE block above
-- declares status NOT NULL, but CREATE TABLE IF NOT EXISTS is a no-op
-- on the existing prod table, so without this ALTER, prod would keep
-- allowing NULL status while any fresh Neon branch spun up from
-- migrations 001..014 gets NOT NULL — a schema drift.
--
-- Safe because: every row in prod already has a non-NULL status
-- (verified via the DEFAULT 'new' on the original DDL — every INSERT
-- since the table was created has picked up the default), and no
-- INSERT path in the codebase writes NULL. The UPDATE handler uses
-- COALESCE(nextStatus, status) so NULL is never written there either.
--
-- Idempotent: SET NOT NULL is a no-op if the column already has the
-- constraint. Postgres does a table scan to verify no NULLs exist,
-- which on a table with ~15 rows is instant.
ALTER TABLE contact_submissions
  ALTER COLUMN status SET NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- Indexes.
--
-- Admin list sorts by created_at DESC (newest first) — the same shape
-- as the reviews admin list. Even at 1000+ submissions the index-only
-- scan is a few ms.
CREATE INDEX IF NOT EXISTS contact_submissions_created_at_idx
  ON contact_submissions (created_at DESC);

-- Status-filtered views (e.g. "just the 'new' unread leads") get their
-- own partial index. 90%+ of leads eventually leave 'new' so a partial
-- index on the small unread subset stays tiny and fast.
CREATE INDEX IF NOT EXISTS contact_submissions_status_new_idx
  ON contact_submissions (created_at DESC)
  WHERE status = 'new';

-- ────────────────────────────────────────────────────────────────
-- Standard touch-updated-at trigger — same pattern as
-- reviews / journal_posts / gallery_photos / cron_jobs.
CREATE OR REPLACE FUNCTION touch_contact_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contact_submissions_touch_updated_at ON contact_submissions;
CREATE TRIGGER contact_submissions_touch_updated_at
  BEFORE UPDATE ON contact_submissions
  FOR EACH ROW EXECUTE FUNCTION touch_contact_submissions_updated_at();
