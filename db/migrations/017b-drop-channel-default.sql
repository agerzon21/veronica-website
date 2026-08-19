-- Removes the bridge default added by 017a.
--
-- ⚠️  ORDERING: run this ONLY AFTER the code that sets messages.channel
-- explicitly at every INSERT site is deployed and verified in
-- production. Running it early re-opens the NOT NULL violation that
-- 017a exists to prevent.
--
-- Verified INSERT sites that must be live first:
--   api/inbox/_ig-webhook.ts      channel = 'instagram'
--   api/_ai-reply.ts   (x2)       channel = (SELECT platform FROM conversations …)
--   api/_inbox-record.ts (x2)     channel = 'form' / 'email'
--   api/inbox/_email-webhook.ts   channel = 'email'
--   api/admin/_messages-send.ts   channel = 'instagram' / 'email'
--
-- Why remove it at all: with DEFAULT 'instagram' in place, a future
-- channel whose INSERT forgets the column is silently written as an
-- Instagram message instead of failing loudly. That is a data-integrity
-- bug that would surface much later as "why is this email showing an
-- Instagram icon", and it would be nearly impossible to reconstruct
-- after the fact. Fail fast instead.
--
-- Confirm before running (should return 0):
--   SELECT COUNT(*) FROM messages WHERE channel IS NULL;

ALTER TABLE messages
  ALTER COLUMN channel DROP DEFAULT;
