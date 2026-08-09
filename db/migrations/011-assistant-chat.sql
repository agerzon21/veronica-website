-- Rework of the Assistant admin tab from a spreadsheet-style form
-- into a conversational chatbot Vero can talk to in Russian. Two
-- schema additions:
--
--   1. assistant_chats — persists the running chat thread. Single
--      thread per install for now (single-user site); the id column
--      is future-proofing for per-user threads later. Messages are
--      stored as a JSONB array of OpenAI-shaped message objects
--      (role, content, tool_calls, tool_call_id, name) so we can
--      just concat + resend to the model each turn.
--
--   2. ai_context.source — 'manual' (added or edited from the Data
--      tab) or 'chatbot' (added or edited by the assistant on Vero's
--      behalf during a chat). Lets the Data tab show a small pill
--      indicator so Vero can spot recent auto-changes at a glance.
--
-- Run once against production Neon.

CREATE TABLE IF NOT EXISTS assistant_chats (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Slot lets us have a small handful of named threads (e.g.
  -- 'default', 'planning-2027') without pouring rows. For MVP
  -- everything writes to 'default'.
  slot           TEXT NOT NULL DEFAULT 'default' UNIQUE,
  -- OpenAI-shaped messages: [{role, content, tool_calls?, ...}, ...]
  -- Full thread; we compact if it ever exceeds context limits.
  messages       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_context
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'chatbot'));

-- Auto-bump updated_at on any change so the UI can show "N minutes
-- ago" without extra bookkeeping.
CREATE OR REPLACE FUNCTION touch_assistant_chats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assistant_chats_touch_updated_at ON assistant_chats;
CREATE TRIGGER assistant_chats_touch_updated_at
  BEFORE UPDATE ON assistant_chats
  FOR EACH ROW EXECUTE FUNCTION touch_assistant_chats_updated_at();
