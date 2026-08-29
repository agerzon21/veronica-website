-- 024 — Let Vero mark a sender as Personal (friends & family).
--
-- Run once BY HAND against production Neon. There is no migration runner in
-- this repo. Safe to re-run.
--
-- ─── Why a plain boolean, when is_promotional is tri-state ───────────────
--
-- is_promotional went tri-state in 022 because a SECOND signal competes with
-- it: summary_json->>'classification' = 'spam-or-unrelated'. With two signals
-- you need NULL to mean "no opinion, let the classifier decide" and FALSE to
-- mean "show it anyway, whatever the classifier thinks".
--
-- Nothing classifies personal, and nothing will. No model can reliably tell
-- Vero's sister from a bride, and guessing wrong in the "yes, this is your
-- sister" direction silently stops the business replying to a paying client.
-- This column has exactly one writer — Vero's thumb — so TRUE/FALSE is the
-- honest encoding of "she marked it" / "she didn't". A NULL would be a third
-- state nothing can produce and nothing would read.
--
-- ─── Why a flag on the conversation covers future messages ───────────────
--
-- 005-messaging.sql has UNIQUE (platform, external_user_id), so a conversation
-- IS the sender. Everything they send from now on routes into this same row,
-- already marked. No blocklist table to keep in sync.
--
-- Deliberately not a delete, same as 021: a mistaken tap costs a click to undo,
-- not a lost message.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT FALSE;

-- Belt and braces, not a hot path. api/admin/_messages-list.ts selects every
-- conversation unfiltered and the Personal/Promotional split happens in React,
-- so nothing queries this column today and the planner will not choose this
-- index — exactly like conversations_promotional_idx from 021. It exists so a
-- future server-side filter, or a manual "who has she marked?" query, is
-- already cheap. Costs one page.
CREATE INDEX IF NOT EXISTS conversations_personal_idx
  ON conversations (is_personal)
  WHERE is_personal = TRUE;
