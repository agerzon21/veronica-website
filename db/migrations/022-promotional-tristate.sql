-- Makes `is_promotional` a three-state override instead of a boolean.
--
-- ─── Why two states weren't enough ──────────────────────────────
--
-- A thread is folded out of the inbox if EITHER Vero marked it, OR its
-- AI summary classified it 'spam-or-unrelated'. With a NOT NULL boolean
-- defaulting to FALSE, "she hasn't expressed an opinion" and "she
-- explicitly wants this visible" are the same value — so pressing
-- "show in main inbox" on an auto-classified thread wrote FALSE, which
-- was already the value, and the classification kept folding it. The
-- button did nothing.
--
-- Now:
--   NULL   — no opinion; the AI classification decides
--   TRUE   — Vero says hide it, whatever the classifier thinks
--   FALSE  — Vero says show it, whatever the classifier thinks
--
-- Effective state is `COALESCE(is_promotional, classification =
-- 'spam-or-unrelated')`, which is also what the eye / eye-slash icon
-- reflects — so the button always shows the thread's real current state
-- rather than only the manual half of it.
--
-- Existing rows are all FALSE, purely because that was the default and
-- nobody has pressed the button yet (verified: zero marked). Migrating
-- them to NULL is therefore lossless — treating them as "she wants this
-- visible" would instead disable auto-folding on every thread in the
-- inbox.
--
-- Run once against production Neon. Safe to re-run: the UPDATE only
-- touches rows that are still FALSE, so a genuine later "show this"
-- (also FALSE) would be reset by a re-run. Do not re-run after Vero has
-- started using the button.

ALTER TABLE conversations
  ALTER COLUMN is_promotional DROP NOT NULL;

ALTER TABLE conversations
  ALTER COLUMN is_promotional DROP DEFAULT;

UPDATE conversations
SET is_promotional = NULL
WHERE is_promotional = FALSE;

-- The partial index still only needs the explicitly-hidden rows.
DROP INDEX IF EXISTS conversations_promotional_idx;
CREATE INDEX IF NOT EXISTS conversations_promotional_idx
  ON conversations (is_promotional)
  WHERE is_promotional IS NOT NULL;
