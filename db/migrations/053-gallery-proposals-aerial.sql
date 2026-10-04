-- 053: two more public gallery categories, proposals and aerial.
--
-- gallery_photos.category was CHECKed against the original four since
-- migration 009. The list now lives in src/data/gallery-categories.ts, and
-- this widens the CHECK to match it. It has to be applied BEFORE the code
-- that knows the new names ships: the Drive sync would otherwise try to
-- insert a 'proposals' photo and fail the old CHECK.
--
-- Widening only: every existing row already satisfies the new CHECK, so it
-- validates instantly and nothing is rewritten. The constraint keeps the name
-- Postgres gave it in 009 (gallery_photos_category_check, read from the live
-- database on 2026-10-03), so a later migration can find it the same way.

ALTER TABLE gallery_photos DROP CONSTRAINT IF EXISTS gallery_photos_category_check;

ALTER TABLE gallery_photos
  ADD CONSTRAINT gallery_photos_category_check
  CHECK (category IN ('portraits', 'weddings', 'family', 'maternity', 'proposals', 'aerial'));
