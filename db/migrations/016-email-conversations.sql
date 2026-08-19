-- Extends the messages table with two columns needed for email
-- conversation threading. The conversations + messages tables from
-- migration 005 already support platform='email' natively — this
-- just adds the email-specific header fields.
--
-- Why:
--   The unified inbox shipped in migration 005 is a "one row per
--   conversation, one row per message" shape that generalizes across
--   channels (Instagram today, WhatsApp / SMS / email planned).
--   Email conversations reuse the same tables — the `platform`
--   CHECK constraint already accepts 'email', and `external_user_id`
--   comfortably holds an email address for the customer.
--
--   Two things emails need that IG DMs don't:
--     1. Subject line — customer sees it, we want to display it in
--        the admin panel. Stored per-message (usually stable across
--        a thread, but the first message's subject drives the
--        conversation display).
--     2. `In-Reply-To` header — this is HOW email replies get
--        threaded. When Vero sends an outbound, we set a specific
--        SMTP Message-ID header (stored in the existing
--        external_message_id column, UNIQUE). When the customer
--        hits Reply in Gmail, their reply email carries our
--        Message-ID as its In-Reply-To header. Our inbound webhook
--        looks up which outbound message this reply is threading
--        against, finds that conversation, appends the reply.
--
-- Fields added to messages:
--   subject      — TEXT nullable. Populated for email messages (both
--                  inbound and outbound), NULL for IG DMs.
--   in_reply_to  — TEXT nullable. On INBOUND email messages, holds
--                  the In-Reply-To header value from the customer's
--                  reply. Empty on first-inbound (a fresh email
--                  thread with no prior context). NULL on all IG
--                  messages and on outbound (outbound messages have
--                  their own generated Message-ID in
--                  external_message_id, and we're the ones being
--                  replied to, not replying).
--
-- Nothing needs to change on the conversations table itself.
--
-- Not adding tenant_id or any multi-tenant scaffolding — per current
-- product direction, we're staying single-tenant on this project
-- (SaaS work will happen on a separate platform, cloady.com, if at
-- all). Adding tenant_id here would be premature complexity.
--
-- Run once against prod Neon. Safe re-run: ADD COLUMN IF NOT EXISTS.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS subject TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT;

-- Fast lookup: given an inbound reply's In-Reply-To value, find the
-- conversation it should attach to via the outbound message it's
-- responding to. The outbound has external_message_id = <our
-- generated Message-ID>; the inbound's in_reply_to matches that.
--
-- Query shape:
--   SELECT conversation_id FROM messages
--   WHERE external_message_id = <inbound.in_reply_to>
--   LIMIT 1;
--
-- No index needed on in_reply_to itself — we don't query BY in_reply_to;
-- we query by external_message_id which is already UNIQUE-indexed from
-- migration 005. Storing in_reply_to is purely for audit / debugging
-- ("what did this inbound think it was replying to?").
