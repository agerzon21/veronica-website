-- Drops the per-photo JSONB column from journal_posts. The column was
-- scaffolding for a per-URL photo list that we replaced with the
-- Drive folder workflow (migration 007) before ever publishing a
-- post. Since no post has ever been written, there's no data to
-- migrate — this is a clean drop.
--
-- If we later want a hand-picked photo list per post (rather than
-- an entire folder), we'll add it back with a schema that fits
-- whatever that flow ends up needing.
--
-- Run once against production Neon.

ALTER TABLE journal_posts
  DROP COLUMN IF EXISTS photos;
