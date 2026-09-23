-- 045-conversation-client-facts.sql
--
-- Things Vero learned about ONE client, somewhere other than the thread.
--
-- She emails a client, then moves to text, and the booking gets settled over
-- SMS: a second location, the times, how they are paying. She pastes that back
-- into the assistant panel and asks it to remember, and it cannot, because
-- every durable write the assistant has points at ai_context, which is GLOBAL
-- and feeds the reply engine for every customer. The guard at
-- api/admin/_assistant-chat.ts correctly refuses to put one client's name in
-- there, and its own comment says why this column has to exist:
--
--     "The guard has to exist before the scoping does."
--
-- This is the scoping. A per-conversation place to put a fact about the person
-- on that thread, which is neither global knowledge nor a message.
--
-- ───────────────────────────────────────────────────────────────────────
-- WHY NOT summary_json
--
-- Because it is destroyed on the next message. The summary cache is keyed on
-- the id of the latest message (010), so the first reply from the client makes
-- it stale and api/admin/_messages-summary.ts overwrites the column wholesale.
-- Facts recorded by hand have to outlive that, so they live beside the summary
-- and are overlaid onto it at READ time, never written into it.
--
-- ───────────────────────────────────────────────────────────────────────
-- WHY NOT conversations.notes
--
-- notes is TEXT and has no application writer today, which makes it tempting.
-- But a fact that ends up in a CONTRACT should not be re-extracted from prose
-- by a model on every read. Structure it once, at the moment Vero says it,
-- with the words she used kept beside it.
--
-- ───────────────────────────────────────────────────────────────────────
-- SHAPE, and why `quote` is not decoration
--
--   [{ "field": "event_location",
--      "value": "Mountain View Vineyard, ...",
--      "quote": "Mountainview Winery 3:00pm-3:30pm",
--      "at": "2026-09-23T02:10:00Z" }]
--
-- `value` is the model's extraction. `quote` is the span of VERO'S OWN TYPED
-- MESSAGE it came from, and the handler refuses to write a fact whose quote is
-- not actually present in what she typed this turn. That is the rule this repo
-- learned from the send-gate incident: a safety-critical write needs a code
-- check on evidence the model did not author. It does not make the extraction
-- correct, and it is not claimed to; it makes the extraction TRACEABLE, so the
-- screen can show the value and the sentence it came from on the same line and
-- she can see at a glance that "3:00pm-3:30pm" became "3:00 PM to 3:30 PM" and
-- not something else.
--
-- Nothing here reaches a contract on its own. These facts seed the New Client
-- FORM, which Vero reads and edits before anything is created.
--
-- ADDITIVE AND INERT. One nullable column, no backfill, no existing row
-- changed. Every reader that does not ask for it is unaffected.

BEGIN;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS client_facts JSONB;

COMMENT ON COLUMN conversations.client_facts IS
  'Booking facts Vero gave the assistant about THIS thread''s client, learned
   outside the thread. [{field, value, quote, at}]. Never written by the
   summariser and never written INTO summary_json, which is destroyed on the
   next inbound message; overlaid onto the summary at read time instead.
   `quote` is the span of Vero''s own typed message the value came from, and
   the write is refused without it, so the extraction is traceable rather than
   merely asserted. Seeds the New Client form, which she reads and edits;
   nothing here reaches a contract unreviewed.';

COMMIT;

-- Undo:
--   ALTER TABLE conversations DROP COLUMN IF EXISTS client_facts;
-- Nothing else reads it, so dropping it loses only the recorded facts.
