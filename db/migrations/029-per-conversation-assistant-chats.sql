-- 029: per-conversation assistant transcripts, and evict per-customer
--      knowledge rows from the shared prompt.
--
-- Run in order. Steps 1 and 2 are additive and safe. Step 3 DELETES rows and
-- has a backup taken immediately before it, in the same transaction.
--
-- No schema change is needed for the scoping itself: assistant_chats.slot is
-- already TEXT NOT NULL UNIQUE, so a per-conversation thread is just a
-- different string ('conv:<uuid>'). The application already writes that.

BEGIN;

-- ── 1. Rename the one existing shared transcript ─────────────────────────
-- It held every conversation at once. It is now the general, not-tied-to-any-
-- conversation thread, and the code looks for it under 'general'. Skipping
-- this orphans 392 messages of real working history: nothing would read the
-- 'default' row again.
-- Safe to run late, and safe to run twice. If the Assistant tab was opened
-- before this migration, the app will have created an empty 'general' row, and
-- a bare rename would then fail the UNIQUE constraint on slot. Clear that
-- placeholder first, but only when it is genuinely empty.
DELETE FROM assistant_chats
WHERE slot = 'general'
  AND coalesce(jsonb_array_length(messages), 0) = 0
  AND EXISTS (SELECT 1 FROM assistant_chats WHERE slot = 'default');

UPDATE assistant_chats SET slot = 'general'
WHERE slot = 'default'
  AND NOT EXISTS (SELECT 1 FROM assistant_chats WHERE slot = 'general');

-- ── 2. Back up the knowledge base before touching it ─────────────────────
DROP TABLE IF EXISTS ai_context_backup_029;
CREATE TABLE ai_context_backup_029 AS SELECT * FROM ai_context;

-- ── 3. Delete per-customer "response example" rows ───────────────────────
-- ai_context is loaded WHOLE into the prompt that answers customers, so these
-- put one customer's name and correspondence into the context used to reply to
-- everybody else. There were 12, all category='tone', all source='chatbot',
-- roughly 7,200 characters of verbatim replies naming five real clients.
--
-- They accumulated because the dedupe guard matches on category + label, and a
-- label like "Response example for <name> with a personal touch" never collides
-- with anything, so every one inserted. The application now rejects labels
-- containing a known contact name, which stops new ones.
--
-- Matched against real contact names rather than a hardcoded list, and
-- source='system' rows are protected as everywhere else.
DELETE FROM ai_context ac
WHERE ac.source <> 'system'
  AND ac.category = 'tone'
  AND EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.contact_name IS NOT NULL
      AND length(c.contact_name) > 2
      AND lower(ac.label) LIKE '%' || lower(c.contact_name) || '%'
  );

COMMIT;

-- Verify:
--   SELECT slot, jsonb_array_length(messages) FROM assistant_chats;
--     -> expect one row, slot='general'
--   SELECT count(*) FROM ai_context;
--     -> expect 12 fewer than ai_context_backup_029
--
-- Undo step 3 if needed:
--   INSERT INTO ai_context SELECT * FROM ai_context_backup_029
--   ON CONFLICT (id) DO NOTHING;
