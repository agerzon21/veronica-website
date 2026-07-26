-- Adds the "Journal" section to the site — weekly-ish recap posts
-- Vero writes about recent photoshoots (10-15 photos + description).
-- The idea:
--   * She currently posts these to Google Business Profile weekly
--   * GBP posts expire after 7 days; her blog posts live forever
--   * Owning + indexing the content gives us SEO surface area for
--     long-tail queries ("wedding photographer + [style/location]")
--   * Eventually we can also syndicate to GBP via their API (Phase 2
--     — Google's API access requires an application process)
--
-- Schema:
--   journal_posts — the entries themselves. `slug` is URL-friendly,
--     unique. `body_markdown` supports simple formatting. `photos`
--     JSONB is an ordered list of image objects (url + alt + optional
--     caption) — kept as JSONB rather than a separate table because
--     the photos never exist independently of a post and we always
--     want them in a specific order set by Vero.
--   journal_post_status — draft vs published. Drafts stay hidden
--     from /journal but show in the admin editor.
--
-- Run once against production Neon.

CREATE TABLE IF NOT EXISTS journal_posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  -- Short one-liner shown in card previews + as the SEO meta
  -- description. Distinct from the body — this is the hook.
  excerpt           TEXT NOT NULL DEFAULT '',
  body_markdown     TEXT NOT NULL DEFAULT '',
  -- The featured/cover image URL — used for og:image and the top of
  -- the post page. Should be one of the images in `photos` (Vero
  -- picks which one during editing).
  cover_image_url   TEXT,
  cover_image_alt   TEXT,
  -- Ordered array of photos: [{url, alt, caption?}]. Simple JSONB
  -- rather than a normalized table because photos never exist
  -- outside a post and ordering matters.
  photos            JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Session type (wedding, portrait, family, maternity) for
  -- filtering + display. Nullable — some posts might be non-shoot
  -- content (a studio update, gear post, etc.).
  session_type      TEXT,
  -- Freeform tags for further filtering (["outdoor", "sunset",
  -- "downtown"]). Kept as text array so Postgres can index them
  -- efficiently.
  tags              TEXT[] NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published')),
  -- When it went (or will go) live. NULL for drafts.
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookups for the public /journal index (only published, most
-- recent first).
CREATE INDEX IF NOT EXISTS journal_posts_published_idx
  ON journal_posts (published_at DESC NULLS LAST)
  WHERE status = 'published';

-- Fast lookup by slug (individual post pages).
CREATE INDEX IF NOT EXISTS journal_posts_slug_idx
  ON journal_posts (slug);

-- Auto-bump updated_at on any change so the admin can sort by "last
-- edited" and we can display "updated X ago" in the editor UI.
CREATE OR REPLACE FUNCTION touch_journal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_posts_touch_updated_at ON journal_posts;
CREATE TRIGGER journal_posts_touch_updated_at
  BEFORE UPDATE ON journal_posts
  FOR EACH ROW EXECUTE FUNCTION touch_journal_updated_at();
