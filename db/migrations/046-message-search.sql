-- 046-message-search.sql
--
-- Searching 98 conversations and 485 messages, and still searching them at
-- fifty times that.
--
-- ── WHY AN INDEX AT ALL, AT THIS SIZE ────────────────────────────────────
--
-- It is not needed today and that is exactly when to add it. The whole
-- messages table is 808 kB; a sequential ILIKE over it is instant and will
-- stay instant for a long while. What changes is the SHAPE of the query the
-- product then depends on: a search box gets typed into on every keystroke,
-- by one person, against a serverless function with a cold start, and the
-- first time it is slow is the first time it is unusable. An index added
-- while the table is small costs nothing to build and never has to be
-- retrofitted under load.
--
-- ── WHY TRIGRAM AND NOT FULL TEXT SEARCH ─────────────────────────────────
--
-- to_tsvector is the usual answer and it is the wrong one here. It matches
-- WORDS, after stemming, so "pag" finds nothing until "Pagiel" is typed in
-- full, and a phone number or an email address is one opaque token. The
-- thing being searched is mostly NAMES, addresses and numbers, and the way
-- it is used is typing the first few letters of somebody.
--
-- pg_trgm indexes three-character sequences, so a leading-wildcard
-- ILIKE '%pag%' uses the index instead of scanning, partial words work, and
-- a typo still matches because two of the three trigrams survive it.
--
-- ── WHAT IS NOT INDEXED, ON PURPOSE ──────────────────────────────────────
--
-- summary_json, client_facts and the assistant transcripts are JSONB and are
-- searched by extracting text at query time. They are small, one row per
-- conversation, and an expression index over a jsonb extraction would have to
-- be recreated every time the summary's shape changed. The conversation set
-- is already narrowed by the indexed columns before any of that runs.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- The three things a person actually types: a name, a handle, an address.
CREATE INDEX IF NOT EXISTS conversations_contact_name_trgm
  ON conversations USING gin (lower(coalesce(contact_name, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS conversations_contact_handle_trgm
  ON conversations USING gin (lower(coalesce(contact_handle, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS conversations_external_id_trgm
  ON conversations USING gin (lower(coalesce(external_user_id, '')) gin_trgm_ops);

-- What was actually said. The big one, and the one that grows.
CREATE INDEX IF NOT EXISTS messages_body_trgm
  ON messages USING gin (lower(coalesce(body, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS messages_subject_trgm
  ON messages USING gin (lower(coalesce(subject, '')) gin_trgm_ops);

-- Dates. A search for a day has to find the conversations whose booking is on
-- it, and event_date lives on the portal rather than the conversation.
CREATE INDEX IF NOT EXISTS client_portals_event_date_idx
  ON client_portals (event_date) WHERE event_date IS NOT NULL;

COMMIT;

-- Undo:
--   DROP INDEX IF EXISTS conversations_contact_name_trgm, conversations_contact_handle_trgm,
--     conversations_external_id_trgm, messages_body_trgm, messages_subject_trgm,
--     client_portals_event_date_idx;
--   -- pg_trgm is left installed; dropping an extension other things may later
--   -- use is not worth the one line it saves.
