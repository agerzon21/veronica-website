-- Unified inbox, part 2: makes `messages` channel-aware and folds the
-- contact form into the conversation model.
--
-- Migration 016 added the two email-specific header columns (subject,
-- in_reply_to). This one adds the piece that actually merges the
-- channels: every message now records HOW it arrived, independently of
-- how the conversation is keyed.
--
-- ─── The model, stated once ──────────────────────────────────────
--
--   conversations.platform  = how we REPLY to this person
--   messages.channel        = how THIS message arrived
--
-- Those are different things, and conflating them is what blocked the
-- contact form from living in the inbox. A form submission arrives via
-- an HTTP POST (channel='form') but is answered by email
-- (platform='email'). Same for a future WhatsApp-in / email-out case.
--
-- Because email conversations are keyed on the sender's address
-- (external_user_id = lower(email)), a form submission and a later
-- direct email from the same person land in the SAME conversation
-- automatically — no identity-resolution table required. That's the
-- whole reason this migration is small.
--
-- ─── What this does NOT add, deliberately ────────────────────────
--
-- No `contacts` / `contact_identities` tables. An earlier design had
-- them so an Instagram thread and an email thread for the same human
-- could merge. But IG and email share no identifier — merging would be
-- a guess, and the correct UX for that is a manual "link these two"
-- button, not a schema. Revisit if that button ever gets built.
--
-- No tenant_id. Still single-tenant.
--
-- Run once against production Neon. Safe to re-run: every statement is
-- IF NOT EXISTS / ON CONFLICT guarded, and the backfills key on
-- deterministic external_message_ids so a second run is a no-op.

-- ────────────────────────────────────────────────────────────────
-- 1. messages.channel
-- ────────────────────────────────────────────────────────────────
-- Nullable on add so the backfill below can populate it before we
-- clamp it to NOT NULL. 'form' is intentionally NOT a valid
-- conversations.platform value — you cannot reply to a form.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS channel TEXT;

-- ────────────────────────────────────────────────────────────────
-- 2. messages.from_address
-- ────────────────────────────────────────────────────────────────
-- The actual sender of THIS message, lowercased. NULL for Instagram
-- (the IGSID on the conversation is the identity).
--
-- Two reasons this earns its place:
--   * Defense. Without a per-message sender, an inbound webhook has no
--     way to prove the message came from the person the thread claims
--     it did — the conversation's contact_name gets rendered next to
--     whatever body arrived.
--   * Reality. Clients email from a different address than the one they
--     typed into the form (work vs personal) more often than not. This
--     is what lets us later show "replied from a different address"
--     instead of silently forking a second thread.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS from_address TEXT;

-- ────────────────────────────────────────────────────────────────
-- 3. Backfill channel on existing rows, then enforce
-- ────────────────────────────────────────────────────────────────
-- Every message that exists today is an Instagram DM (verified: 113
-- messages, all on platform='instagram' conversations). Deriving from
-- the parent conversation is correct for all of them and stays correct
-- if this migration is applied to a DB that already has email rows.
UPDATE messages m
SET channel = c.platform
FROM conversations c
WHERE c.id = m.conversation_id
  AND m.channel IS NULL;

ALTER TABLE messages
  ALTER COLUMN channel SET NOT NULL;

-- Added after the backfill so pre-existing rows can't trip it.
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_channel_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_channel_check
  CHECK (channel IN ('instagram', 'whatsapp', 'sms', 'email', 'form'));

-- The inbox list and thread view both filter/group by channel.
CREATE INDEX IF NOT EXISTS messages_channel_idx
  ON messages (conversation_id, channel);

-- ────────────────────────────────────────────────────────────────
-- 4. Link contact_submissions to its conversation
-- ────────────────────────────────────────────────────────────────
-- The structured lead record (shoot_type, preferred_date, location,
-- status, notes) stays where it is — a conversation thread is the wrong
-- shape for it, and the Leads panel is a genuinely better view of that
-- data. This column is the join between the two views so the admin UI
-- can offer "open the conversation" / "see the lead details".
--
-- ON DELETE SET NULL: deleting a conversation must not cascade into
-- destroying the lead record.
ALTER TABLE contact_submissions
  ADD COLUMN IF NOT EXISTS conversation_id UUID
  REFERENCES conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contact_submissions_conversation_idx
  ON contact_submissions (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- 5. Editable email signature
-- ────────────────────────────────────────────────────────────────
-- Seeded from the wording already used by the contact-form auto-reply
-- in api/_auto-reply.ts, so outbound mail from the admin panel reads
-- identically to what clients already receive. Editable from the admin
-- panel — these are seeds, not constants, and ON CONFLICT DO NOTHING
-- means re-running this migration will never clobber an edit.
INSERT INTO system_state (key, updated_at, value)
VALUES ('email_signature_text', NOW(), E'Warmly,\nVeronika\nVero Photography')
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_state (key, updated_at, value)
VALUES (
  'email_signature_html',
  NOW(),
  '<p style="margin:24px 0 0;">Warmly,<br><em>Veronika</em></p>' ||
  '<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;' ||
  'text-transform:uppercase;color:#c9a96e;margin:8px 0 0;">Vero Photography</p>'
)
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- 6. Backfill past contact submissions into conversations
-- ────────────────────────────────────────────────────────────────
-- 31 submissions across 26 distinct email addresses, all still
-- status='new' with contacted_at NULL on every row — the Leads panel
-- has never been used to mark one handled.
--
-- ⚠️  READ THIS BEFORE RUNNING. These threads will look UNANSWERED even
-- where Veronika replied, because she replied from Gmail and we have no
-- record of it. The database cannot reconstruct her side. Two guards:
--
--   ai_enabled = FALSE  — the important one. Without it, once the AI
--                         reply pipeline is enabled for email it could
--                         look at a six-month-old thread with no
--                         outbound and "follow up" with a lead who
--                         already booked and shot.
--   unread_count = 0    — imported history is not new mail; 26 unread
--                         badges on first open would be noise.
--
-- To undo the whole section:
--   DELETE FROM conversations WHERE notes LIKE 'Imported from contact form%';
-- (messages cascade; contact_submissions.conversation_id resets to NULL)

-- 6a. One conversation per distinct email address.
INSERT INTO conversations (
  platform, external_user_id, contact_name, contact_handle,
  ai_enabled, notes, created_at
)
SELECT
  'email',
  LOWER(TRIM(cs.email)),
  -- Most recent name wins if they submitted twice under different names.
  (ARRAY_AGG(cs.name ORDER BY cs.created_at DESC))[1],
  LOWER(TRIM(cs.email)),
  FALSE,
  'Imported from contact form. Replies Veronika sent by email before '
    || 'the inbox existed are not in this thread — check Gmail for the '
    || 'full history.',
  MIN(cs.created_at)
FROM contact_submissions cs
WHERE cs.email IS NOT NULL
  AND TRIM(cs.email) <> ''
GROUP BY LOWER(TRIM(cs.email))
ON CONFLICT (platform, external_user_id) DO NOTHING;

-- 6b. Point each submission at its conversation.
UPDATE contact_submissions cs
SET conversation_id = c.id
FROM conversations c
WHERE c.platform = 'email'
  AND c.external_user_id = LOWER(TRIM(cs.email))
  AND cs.conversation_id IS NULL;

-- 6c. One inbound message per submission, rendered from the form fields.
--
-- external_message_id is deterministic ('form:<submission uuid>') so the
-- UNIQUE constraint makes this insert idempotent — re-running the
-- migration inserts nothing. It's also what api/contact.ts will use for
-- live submissions, so a submission can never be double-recorded.
INSERT INTO messages (
  conversation_id, direction, sender, channel, body,
  external_message_id, from_address, subject, sent_at, created_at
)
SELECT
  cs.conversation_id,
  'inbound',
  'contact',
  'form',
  CONCAT_WS(E'\n',
    'Name: '  || cs.name,
    'Email: ' || cs.email,
    CASE WHEN NULLIF(TRIM(cs.shoot_type), '')     IS NOT NULL THEN 'Shoot type: '     || cs.shoot_type     END,
    CASE WHEN NULLIF(TRIM(cs.preferred_date), '') IS NOT NULL THEN 'Preferred date: ' || cs.preferred_date END,
    CASE WHEN NULLIF(TRIM(cs.location), '')       IS NOT NULL THEN 'Location: '       || cs.location       END,
    CASE WHEN NULLIF(TRIM(cs.message), '')        IS NOT NULL THEN E'\n' || cs.message END
  ),
  'form:' || cs.id::text,
  LOWER(TRIM(cs.email)),
  'Contact form inquiry'
    || CASE WHEN NULLIF(TRIM(cs.shoot_type), '') IS NOT NULL
            THEN ' — ' || cs.shoot_type ELSE '' END,
  cs.created_at,
  cs.created_at
FROM contact_submissions cs
WHERE cs.conversation_id IS NOT NULL
ON CONFLICT (external_message_id) DO NOTHING;

-- 6d. Repair the denormalized counters the insert trigger just moved.
--
-- messages_touch_conversation fires per row and sets
-- last_message_at = NEW.sent_at unconditionally, so after a bulk insert
-- it holds whatever row happened to land last, not the newest. It also
-- incremented unread_count once per imported message. Fix both.
UPDATE conversations c
SET last_message_at = latest.max_sent,
    unread_count    = 0,
    updated_at      = NOW()
FROM (
  SELECT conversation_id, MAX(sent_at) AS max_sent
  FROM messages
  WHERE channel = 'form'
  GROUP BY conversation_id
) latest
WHERE c.id = latest.conversation_id
  AND c.notes LIKE 'Imported from contact form%';
