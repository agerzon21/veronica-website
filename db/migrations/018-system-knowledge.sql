-- Splits `ai_context` into two kinds of knowledge that must never mix.
--
-- ─── The problem ────────────────────────────────────────────────
--
-- `ai_context` currently holds one thing: facts about Vero's photography
-- business that the CUSTOMER-FACING reply engine cites when answering
-- Instagram DMs and emails. Pricing, packages, tone, turnaround.
--
-- We're adding a second, very different kind of knowledge: how the ADMIN
-- PANEL ITSELF works, so Veronika can ask "I finished a gallery, how do I
-- give the client access?" and get an answer instead of messaging Alex.
--
-- These must be strictly separated. `api/_ai-reply.ts` loads every active
-- row into the prompt it sends to customers — so without a filter, a
-- client asking about wedding coverage could get told how to use the
-- Journal panel. That would be both confusing and a small leak of how the
-- business is run.
--
-- ─── The mechanism ──────────────────────────────────────────────
--
-- `source` already exists (defaulting to 'manual', with 'chatbot' used for
-- assistant-written rows). This adds 'system' as a third value and makes
-- the set explicit:
--
--   'manual'  — Vero typed it in the Context tab
--   'chatbot' — the in-panel assistant wrote it on her behalf
--   'system'  — WE wrote it: documentation about the panel itself
--
-- Rules enforced in code, not here (a CHECK can't express them):
--   * api/_ai-reply.ts excludes source='system' — customers never see it
--   * context-update / context-delete refuse to touch source='system'
--   * the assistant's upsert_knowledge / delete_knowledge refuse it too
--
-- That last one matters more than it looks: the assistant has a
-- delete_knowledge tool, so without the guard it could be talked into
-- deleting its own documentation, and nobody would notice until Veronika
-- asked a question it used to be able to answer.
--
-- Seeding of the actual 'system' rows happens separately, from content
-- extracted and verified against the code — deliberately not inlined here
-- so it can be re-run and corrected without a schema migration.
--
-- Run once against production Neon. Safe to re-run.

ALTER TABLE ai_context
  DROP CONSTRAINT IF EXISTS ai_context_source_check;

ALTER TABLE ai_context
  ADD CONSTRAINT ai_context_source_check
  CHECK (source IN ('manual', 'chatbot', 'system'));

-- The reply engine filters on (active, source) on every single inbound
-- message, so it is worth an index even at this table's small size.
CREATE INDEX IF NOT EXISTS ai_context_source_active_idx
  ON ai_context (source, category, sort_order)
  WHERE active = TRUE;
