-- Reviews table — powers both the public home-page "Kind Words"
-- section AND the new admin "Reviews" tab.
--
-- Manual entry from the admin panel is the source of truth. Google
-- Business Profile's `reviews.list` API was deprecated in Feb 2024,
-- and the Places API only returns 5 top-relevance reviews (stale +
-- doesn't surface new ones), so pulling isn't a real option.
-- Instead: Vero pastes new reviews as they come in (or, later, we
-- parse Google/Yelp notification emails from her inbox and
-- auto-draft entries here for her approval — Phase 6).
--
-- The current 9 hardcoded reviews in src/components/GoogleReviewsSection.tsx
-- get migrated in via a one-off seed script (scripts/seed-reviews.mjs)
-- after this table exists.
--
-- Fields:
--   author_name       — required, displayed
--   author_photo_url  — optional; from Google Maps profile if she pastes
--                       it, empty otherwise (falls back to initials)
--   rating            — 1-5 stars (Google + Yelp both use 1-5)
--   text              — the actual review body
--   publish_date      — when the review was published on the source
--                       platform (not when we added it to our DB)
--   source            — where it came from; drives the little icon
--                       (Google G, Yelp red dot, IG, direct email,
--                       'manual' for anything else)
--   featured          — whether this review is a candidate for the
--                       home-page "Kind Words" rotation. Vero curates
--                       her best 5-10; the home page picks 2 random
--                       from the featured set on each visit.
--   visible           — hard on/off toggle. Hidden reviews stay in
--                       the admin list (for history) but never render
--                       publicly. Delete only when you really mean it.
--
-- Run once against prod Neon. Safe re-run: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name       TEXT NOT NULL,
  author_photo_url  TEXT,
  rating            INTEGER NOT NULL DEFAULT 5
                      CHECK (rating BETWEEN 1 AND 5),
  text              TEXT NOT NULL,
  publish_date      DATE,
  source            TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('google', 'yelp', 'instagram', 'email', 'manual')),
  featured          BOOLEAN NOT NULL DEFAULT TRUE,
  visible           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Home-page rotation query filters on both visible AND featured; index
-- both so the picker is a fast filtered scan even at 100+ reviews.
CREATE INDEX IF NOT EXISTS reviews_featured_visible_idx
  ON reviews (featured, visible)
  WHERE visible = TRUE AND featured = TRUE;

-- Admin list is sorted by publish_date DESC (newest first), fallback
-- to created_at when publish_date is null.
CREATE INDEX IF NOT EXISTS reviews_publish_date_idx
  ON reviews (publish_date DESC NULLS LAST, created_at DESC);

-- Standard touch-updated-at trigger, matching the pattern used by
-- ai_context / assistant_chats / journal_posts / gallery_photos.
CREATE OR REPLACE FUNCTION touch_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reviews_touch_updated_at ON reviews;
CREATE TRIGGER reviews_touch_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION touch_reviews_updated_at();
