-- Adds a Google Drive folder URL to journal posts. Vero uploads a
-- post's 5–15 photos to a Drive folder (same workflow she already
-- uses for client galleries) and pastes the folder's shareable link
-- here. The public post endpoint lists the folder at request time
-- and returns the images in filename order — no per-photo bookkeeping.
--
-- The existing `photos` JSONB column stays: it's still the fallback
-- for posts written before Drive folders were wired up. Reads prefer
-- drive_folder_url when both are set.
--
-- Run once against production Neon.

ALTER TABLE journal_posts
  ADD COLUMN IF NOT EXISTS drive_folder_url TEXT;
