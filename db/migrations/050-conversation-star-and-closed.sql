-- Two marks on a conversation, both Vero's own: a star, and "closed lead".
--
-- STARRED (starred_at). Alex, 2026-10-01: go through the inbox, star the
-- threads to work on, then list only those. A time rather than a boolean so
-- the starred list can be read in the order things were starred if that ever
-- helps; NULL means not starred.
--
-- CLOSED LEAD (closed_at). The Messages list folds dead leads into a "Closed
-- leads" section at the bottom, the way it folds personal and promotional
-- threads: a lead whose date has passed, or who has been written to twice with
-- no answer, closes on its own (api/admin/_messages-list.ts). This column is
-- for the ones Vero closes herself ("Not interested" on a follow-up, or Close
-- lead in the filing menu). A TIME, not a boolean, because it holds only while
-- nothing new is said: a message after it, from either side, reopens the lead,
-- so someone who writes back months later is never buried.
--
-- Both nullable with no default: catalog changes, no rewrite, safe while the
-- site is live and before any code that reads them is deployed.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS starred_at TIMESTAMPTZ;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

COMMENT ON COLUMN conversations.starred_at IS
  'When Vero starred this thread to work on. NULL means not starred.';

COMMENT ON COLUMN conversations.closed_at IS
  'When Vero closed this lead herself. Only counts while it is newer than the
   last message; anything said after it reopens the lead.';

-- Undo:
--   ALTER TABLE conversations DROP COLUMN IF EXISTS starred_at;
--   ALTER TABLE conversations DROP COLUMN IF EXISTS closed_at;
