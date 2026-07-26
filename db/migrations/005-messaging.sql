-- Adds the tables that power the Vero-facing "unified inbox" — the
-- messaging assistant that receives Instagram DMs, generates AI
-- replies from a knowledge base, and lets Vero take over any
-- conversation manually. Preps for WhatsApp / other platforms later
-- (see `platform` column on conversations).
--
-- The design goals we're baking in:
--   * One row per conversation, one row per message. Standard
--     inbox shape. Messages ordered by sent_at.
--   * `ai_enabled` per-conversation so Vero can silence the AI on
--     a specific chat when she wants to handle it herself
--   * Global kill switch via system_state so if the AI goes
--     rogue she can silence ALL of it in one click
--   * `linked_client_portal_id` — when the assistant converts a
--     prospect into a booked client, we link the conversation to
--     the new client_portal so /admin can show the full history
--   * `platform` + `external_conversation_id` is our polymorphism —
--     Instagram today, WhatsApp / SMS / email tomorrow, without
--     schema churn
--
-- Also seeds the global-kill-switch key so the UI code can rely on
-- it existing.
--
-- Run once against production Neon.

-- ────────────────────────────────────────────────────────────────
-- conversations
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Platform identifier. 'instagram' at launch; 'whatsapp', 'sms',
  -- 'email' when we add those. Kept as text (not enum) so adding a
  -- new platform doesn't require a schema migration.
  platform                  TEXT NOT NULL CHECK (platform IN ('instagram', 'whatsapp', 'sms', 'email')),
  -- The platform's own conversation identifier. For Instagram, this
  -- is the IGSID (Instagram-scoped user ID) of the person Vero is
  -- talking to. UNIQUE per platform so a webhook that re-references
  -- the same conversation finds the same row.
  external_user_id          TEXT NOT NULL,
  -- What we know about the human on the other end (from the
  -- webhook or from an inline lookup). Nullable — sometimes IG only
  -- gives us a scoped ID without a display name.
  contact_name              TEXT,
  contact_handle            TEXT,
  contact_profile_pic_url   TEXT,
  -- Per-conversation AI enable/disable. Vero flips this off to
  -- take over manually; back on to let the AI drive again.
  ai_enabled                BOOLEAN NOT NULL DEFAULT TRUE,
  -- If this prospect eventually books, link to their client_portal
  -- so the /admin conversation view can show contract + payment
  -- status inline, and the client_portal detail view can show the
  -- inbound conversation history that led to the booking.
  linked_client_portal_id   UUID REFERENCES client_portals(id) ON DELETE SET NULL,
  -- Freeform notes Vero can attach to a conversation ("came from
  -- Katya's referral", "wedding photographer for Vitaly's cousin").
  notes                     TEXT NOT NULL DEFAULT '',
  -- Denormalized "last activity" timestamp so the inbox list can
  -- sort without a subquery per row. Updated on every message
  -- insert via a trigger below.
  last_message_at           TIMESTAMPTZ,
  -- Unread count for the human (Vero). Reset to 0 when she opens
  -- the conversation. Incremented on every inbound message.
  unread_count              INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, external_user_id)
);

CREATE INDEX IF NOT EXISTS conversations_last_message_idx
  ON conversations (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS conversations_linked_portal_idx
  ON conversations (linked_client_portal_id)
  WHERE linked_client_portal_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- messages
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id       UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction             TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  -- Who sent this. Only meaningful for outbound — 'ai' or 'human'
  -- (Vero). For inbound, always 'contact'.
  sender                TEXT NOT NULL CHECK (sender IN ('contact', 'ai', 'human')),
  body                  TEXT NOT NULL,
  -- The platform's own message ID. UNIQUE so a re-delivered
  -- webhook (Instagram loves to retry) doesn't create duplicates.
  -- Nullable for outbound messages we send BEFORE getting confirmation.
  external_message_id   TEXT UNIQUE,
  -- Timestamp from the platform. May differ from created_at (we
  -- want the human's clock, not our DB insert clock).
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- For AI-generated messages: which model + how much did it cost.
  -- Lets us build a cost dashboard later + retroactively identify
  -- low-quality replies from a specific model version.
  ai_model              TEXT,
  ai_cost_usd           NUMERIC(10, 6),
  -- Attached to outbound-AI messages: the exact context snippets
  -- we fed to the model when generating this reply. Lets Vero
  -- click into a reply and see "the AI cited pricing X + tone Y",
  -- useful for debugging + tuning the knowledge base over time.
  ai_context_used       JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON messages (conversation_id, sent_at ASC);

-- Auto-update conversations.last_message_at + unread_count on every
-- inbound message insert. Outbound messages update last_message_at
-- but not unread_count (Vero sent it, she's aware).
CREATE OR REPLACE FUNCTION touch_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE conversations
    SET last_message_at = NEW.sent_at,
        unread_count = unread_count + 1,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
  ELSE
    UPDATE conversations
    SET last_message_at = NEW.sent_at,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_touch_conversation ON messages;
CREATE TRIGGER messages_touch_conversation
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION touch_conversation_on_message();

-- ────────────────────────────────────────────────────────────────
-- ai_context — the knowledge base the AI cites when replying
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_context (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Rough grouping so the admin UI can show entries by section.
  -- Not enforced as an enum — Vero can create new categories.
  -- Common ones we'll seed: 'pricing', 'packages', 'faq',
  -- 'tone', 'contact', 'availability'.
  category     TEXT NOT NULL,
  -- Short human label ("Wedding — Half-day package", "Retainer
  -- policy", etc.) shown in the admin list. NOT sent to the AI —
  -- purely for Vero's own navigation.
  label        TEXT NOT NULL,
  -- The actual text the AI sees. Should be phrased as a
  -- statement of fact, not a directive ("Half-day wedding coverage
  -- is $2,500 and includes ...").
  content      TEXT NOT NULL,
  -- Toggle whether the AI is allowed to cite this. Useful for
  -- seasonal offerings ("Autumn mini-sessions are $250") that
  -- expire.
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Display order in the admin UI. Lower = shown first.
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_context_active_idx
  ON ai_context (category, sort_order)
  WHERE active = TRUE;

-- Auto-bump updated_at.
CREATE OR REPLACE FUNCTION touch_ai_context_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_context_touch_updated_at ON ai_context;
CREATE TRIGGER ai_context_touch_updated_at
  BEFORE UPDATE ON ai_context
  FOR EACH ROW EXECUTE FUNCTION touch_ai_context_updated_at();

-- ────────────────────────────────────────────────────────────────
-- Global AI kill switch (via system_state)
-- ────────────────────────────────────────────────────────────────
-- The AI auto-reply engine will check this key on every inbound
-- message and refuse to reply if the value is 'off'. Default 'on'.
-- Vero flips this from the admin UI when she wants to silence the
-- bot globally (e.g., she's actively fielding a wave of DMs manually,
-- or she needs to fix a bad context entry before more replies fire).
INSERT INTO system_state (key, updated_at, value)
VALUES ('messaging_ai_state', NOW(), 'on')
ON CONFLICT (key) DO NOTHING;
