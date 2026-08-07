-- Public gallery photos. Replaces the file-based src/data/photos.csv +
-- public/assets/photos/{portraits,weddings,family,maternity}/ workflow
-- with a DB + Drive workflow so Vero can:
--   - drop a JPG into a Drive folder and see it appear in the gallery
--     without a code deploy;
--   - edit titles/alt/descriptions/keywords from the admin panel with
--     zero deploys;
--   - reorganize / delete without git commits.
--
-- Photos themselves live in Google Drive (under a "Gallery" parent
-- folder with per-category subfolders). This table holds the metadata
-- + the Drive file id we use to fetch them via /api/photo.
--
-- The `site/` category (backgrounds, hero images) stays self-hosted
-- in the repo — this table only covers the four gallery categories.

CREATE TABLE IF NOT EXISTS gallery_photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- URL-facing identifier. Editable from the admin panel. Unique so
  -- old URLs don't accidentally collide. On migration, this is
  -- copied from the existing CSV filename (minus .webp) so every
  -- current /photo/<cat>/<slug> URL keeps resolving unchanged.
  slug            TEXT NOT NULL UNIQUE,

  -- Which gallery tab it appears in. Enforced as a CHECK so a typo
  -- like 'wedding' (singular) can't silently orphan a row from the
  -- UI.
  category        TEXT NOT NULL CHECK (category IN ('portraits','weddings','family','maternity')),

  -- Drive plumbing. drive_file_id is the immutable identifier we
  -- pass to /api/photo. drive_filename is informational — helps
  -- debugging ("which Drive file is this row?") and lets the sync
  -- job match against Drive by name when it needs to.
  drive_file_id   TEXT NOT NULL UNIQUE,
  drive_filename  TEXT NOT NULL,

  -- Metadata (mirrors the old CSV columns).
  title           TEXT NOT NULL DEFAULT '',
  alt             TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  keywords        TEXT[] NOT NULL DEFAULT '{}',

  -- Natural dimensions from Drive's imageMediaMetadata. Used by
  -- the justified-layout algorithm so the grid renders correctly
  -- at first paint (no reflow). Nullable for files where Drive
  -- didn't return dims — rare edge case, the frontend falls back
  -- to 3:2 in that case.
  width           INTEGER,
  height          INTEGER,

  -- Draft/published state. New photos come in as 'draft' after the
  -- sync cron fills them in with AI-generated metadata. Only
  --'published' rows show up on the public gallery. This is the
  -- "human review before it goes live" checkpoint.
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published')),

  -- Manual sort override. Higher = shown first within category.
  -- 0 = default (sort by published_at). Lets us pin favourites to
  -- the top of a category without renaming files.
  sort_order      INTEGER NOT NULL DEFAULT 0,

  -- When it went (or will go) live. NULL for drafts, set on first
  -- transition to 'published'. Public gallery orders by this
  -- (newest first).
  published_at    TIMESTAMPTZ,

  -- The sync cron records when it last saw this file in Drive. If
  -- a file disappears from Drive (Vero deleted it), we set
  -- deleted_at rather than hard-deleting the row — makes recovery
  -- possible and preserves any custom metadata in case Vero
  -- re-uploads.
  drive_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public gallery query: fetch published photos for a category
-- ordered by (sort_order DESC, published_at DESC). This index
-- covers the common case; excludes soft-deleted rows.
CREATE INDEX IF NOT EXISTS gallery_photos_category_pub_idx
  ON gallery_photos (category, sort_order DESC, published_at DESC NULLS LAST)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Slug lookup for individual photo pages (/photo/<cat>/<slug>).
CREATE INDEX IF NOT EXISTS gallery_photos_slug_idx
  ON gallery_photos (slug)
  WHERE deleted_at IS NULL;

-- Sync cron looks up rows by drive_file_id to diff against Drive.
-- Already covered by the UNIQUE constraint, but noting for reference.

-- Auto-bump updated_at on any change so the admin can sort by "last
-- edited" and we can display "updated X ago" in the editor UI.
-- Reuses the same helper function pattern as journal_posts.
CREATE OR REPLACE FUNCTION touch_gallery_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gallery_photos_touch_updated_at ON gallery_photos;
CREATE TRIGGER gallery_photos_touch_updated_at
  BEFORE UPDATE ON gallery_photos
  FOR EACH ROW EXECUTE FUNCTION touch_gallery_updated_at();
