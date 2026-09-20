-- 042-message-sent-via.sql
--
-- Record HOW an outbound message was sent, so the assistant's sends can be
-- told apart from Vero's.
--
-- WHY THIS EXISTS. On 2026-09-18 the assistant mailed a paying customer
-- without approval. That produced a real gate in code (looksLikeSendApproval
-- in api/_house-style.ts) and it produced this question, which nothing in the
-- database can answer: WHICH messages did the assistant send?
--
-- api/_reply-delivery.ts writes sender = 'human' for every panel send, whether
-- it came from the Messages composer under Vero's hands or from the
-- assistant's send_reply tool. The two are identical in the messages table.
-- The only trace of an assistant send is a console.log line in Vercel's logs,
-- which roll off. So the one incident class this system has actually suffered
-- is the one it cannot audit after the fact.
--
-- The automated customer reply engine is already distinguishable: it writes
-- sender = 'ai'. This column exists for the ambiguity inside sender = 'human'.
--
-- VOCABULARY (deliberately not a CHECK constraint or an enum: this system is
-- intended to be sold to other photographers, and a new value should not need
-- a migration in every installation):
--   'composer'   Vero typed it in the Messages panel and pressed Send.
--   'assistant'  the assistant's send_reply tool, after the approval gate.
--
-- SCOPE: panel sends only, which is exactly where the ambiguity is. The
-- automated reply engine in api/_ai-reply.ts writes sender = 'ai' and is
-- already identifiable without this column, so its five insert sites are left
-- untouched. Editing the highest-traffic customer-facing path in the system to
-- record a fact it already records would be risk without information.
--
-- ADDITIVE and nullable, and NOTHING IS BACKFILLED.
--
-- Every historical outbound row keeps sent_via NULL, including the ones
-- sender = 'ai' would let us label confidently. A column that means "how this
-- was sent, if we were recording it at the time" is honest. One where some
-- rows were inferred later and others observed live invites a reader to trust
-- an inference during an incident investigation, which is the one moment this
-- column exists for and the one moment a confident wrong answer does damage.
-- NULL means "sent before this was recorded", and that is the truth.

BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sent_via TEXT;

-- Finding every assistant send, which is the query this column exists for.
CREATE INDEX IF NOT EXISTS messages_sent_via_idx
  ON messages (sent_via)
  WHERE sent_via IS NOT NULL;

COMMIT;

-- Undo:
--   DROP INDEX IF EXISTS messages_sent_via_idx;
--   ALTER TABLE messages DROP COLUMN IF EXISTS sent_via;
