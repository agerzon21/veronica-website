-- Cache the AI-generated conversation summary on the conversations
-- row so we don't regenerate it on every admin-panel open.
--
-- Cache invalidation is "check at read time": we store the id of
-- the message that was latest when we generated the summary; if
-- the current latest message id differs, the cache is stale and
-- we regenerate. If they match, we return the cached summary
-- instantly (no OpenAI call).
--
-- No active invalidation needed on new messages — the next
-- summary request notices the change on its own.
--
-- Run once against production Neon.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS summary_json JSONB,
  ADD COLUMN IF NOT EXISTS summary_message_id TEXT,
  ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMPTZ;
