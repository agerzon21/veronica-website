-- Lets Vero mark a conversation as promotional herself.
--
-- ─── Why the automatic classification isn't enough ──────────────
--
-- The inbox folds threads whose AI summary says 'spam-or-unrelated'.
-- But summaries are generated ON DEMAND — when Vero opens a thread and
-- the summary card loads. A thread she has never opened has no summary,
-- so it has no classification, so it cannot be folded. Right now that is
-- 23 of 35 email conversations: exactly the marketing mail she never
-- opens is exactly the mail that stays unfolded and in her way.
--
-- Classifying every inbound automatically would fix it, at the cost of
-- an OpenAI call per message including every advert. This is the cheaper
-- and more reliable half: one tap, no model involved, and it is HER
-- judgement rather than a guess.
--
-- ─── Why a flag on the conversation covers future mail too ──────
--
-- Email conversations are keyed on (platform='email', external_user_id =
-- the sender's address). Every future email from that sender routes into
-- this same row. So marking the conversation is automatically "mark this
-- sender" — no separate blocklist table, and nothing to keep in sync.
--
-- Deliberately NOT a delete. Marketing mail is occasionally worth
-- reading, senders change, and a mistaken tap should cost a click to
-- undo rather than lose a message permanently. It folds; it doesn't
-- disappear.
--
-- Run once against production Neon. Safe to re-run.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_promotional BOOLEAN NOT NULL DEFAULT FALSE;

-- The inbox list filters on this on every render.
CREATE INDEX IF NOT EXISTS conversations_promotional_idx
  ON conversations (is_promotional)
  WHERE is_promotional = TRUE;
