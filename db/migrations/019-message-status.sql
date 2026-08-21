-- Adds `messages.status`, which is what lets the AI write a reply
-- WITHOUT sending it.
--
-- ─── Why email can't work like Instagram ────────────────────────
--
-- On Instagram the assistant replies automatically. That's tolerable: a
-- DM is casual, it's visibly from an assistant, and a bad one is
-- embarrassing rather than damaging.
--
-- Email is not that. It's the channel every real booking arrives on, the
-- message is permanent and forwardable, and it goes out under Vero's own
-- name from her own address. An assistant that has been live for two
-- days should not be sending those unattended.
--
-- So on email the AI drafts and stops. Vero sees the draft in the
-- composer, edits it if she wants, and sends. Same guardrails, same
-- knowledge base, one human step before anything leaves.
--
-- ─── Values ─────────────────────────────────────────────────────
--
--   'sent'   — it went out. Every existing row, and the default, so no
--              backfill and no behavior change for Instagram.
--   'draft'  — written by the AI, NOT delivered. Never counts as a
--              reply: the reply engine's dedup gate looks for an
--              outbound after the newest inbound, and a draft must not
--              satisfy that or a single un-actioned draft would silence
--              the assistant on that thread forever.
--   'failed' — reserved. Today a failed send deletes its row rather than
--              marking it, so nothing writes this yet; it exists so that
--              the alternative doesn't need another migration.
--
-- Deliberately NOT nullable and defaulted to 'sent': the alternative is
-- NULL meaning "sent", which every future query then has to remember to
-- handle. Migration 017 already taught us what a NOT NULL column with no
-- default does to code written before it — hence the default here.
--
-- Run once against production Neon. Safe to re-run.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent';

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_status_check
  CHECK (status IN ('sent', 'draft', 'failed'));

-- Every thread render asks "is there a pending draft here?", and drafts
-- are a tiny fraction of rows, so a partial index is the right shape.
CREATE INDEX IF NOT EXISTS messages_pending_draft_idx
  ON messages (conversation_id, sent_at DESC)
  WHERE status = 'draft';
