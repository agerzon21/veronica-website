-- 041-journal-series.sql
--
-- Let two journal entries know they are one story.
--
-- The Boston courthouse post already PROMISES this in its own excerpt: "the
-- first half of a two-part wedding story." Nothing in the schema could keep
-- that promise, so the second half exists as an unrelated entry and a reader
-- who finishes the first one has no way to reach it.
--
-- Deliberately NOT a tag. tags is a public, freeform TEXT[] used for filtering
-- and display, and overloading it with `series:nicole-tucker` would put
-- machinery in a field that is read by people. It also cannot express ORDER,
-- which is the entire point: part two is not merely related to part one, it
-- comes after it.
--
-- Deliberately not a join table either. A series is a handful of posts that
-- always belong to exactly one story, so a table would buy nothing but a join.
--
-- ADDITIVE. Three nullable columns. Every existing post reads NULL and renders
-- exactly as it does now, because "no series" is the common case and always
-- will be.

BEGIN;

ALTER TABLE journal_posts
  -- The story these posts share, as a slug: 'nicole-and-tucker'. NULL for a
  -- standalone entry, which is most of them.
  ADD COLUMN IF NOT EXISTS series_slug TEXT,

  -- Where this entry sits in it. 1, 2, 3. Ordering is the reason this column
  -- exists rather than a tag: "part two" is a fact about sequence, and a set
  -- of tags has no sequence.
  ADD COLUMN IF NOT EXISTS series_part INTEGER,

  -- What the series is CALLED where a reader sees it: "Nicole and Tucker, in
  -- two parts". Stored per post rather than in a series table so the label can
  -- be written to suit the entry it appears on, and so adding a series needs
  -- no second insert.
  ADD COLUMN IF NOT EXISTS series_label TEXT;

-- Finding the siblings of a post, which is the only query this feature makes.
CREATE INDEX IF NOT EXISTS journal_posts_series_idx
  ON journal_posts (series_slug, series_part)
  WHERE series_slug IS NOT NULL;

-- Two entries cannot both be part one of the same story. A duplicate part
-- number would make the ordering ambiguous and the "next part" link would pick
-- one at random, which is the kind of bug that looks like a content mistake.
CREATE UNIQUE INDEX IF NOT EXISTS journal_posts_series_part_key
  ON journal_posts (series_slug, series_part)
  WHERE series_slug IS NOT NULL AND series_part IS NOT NULL;

COMMIT;

-- Undo:
--   DROP INDEX IF EXISTS journal_posts_series_part_key;
--   DROP INDEX IF EXISTS journal_posts_series_idx;
--   ALTER TABLE journal_posts
--     DROP COLUMN IF EXISTS series_label,
--     DROP COLUMN IF EXISTS series_part,
--     DROP COLUMN IF EXISTS series_slug;
