-- Recommended vendors for the weddings page.
--
-- Vero wants to feature local wedding businesses she knows and trusts —
-- venues, florists, DJs, planners, makeup artists. No money changes
-- hands in either direction: it is mutual promotion, and the page says
-- so explicitly (independent businesses, not our responsibility). Rows
-- are managed from the admin panel's Weddings tab.
--
-- Modeled on reviews (012): sort_order integer for display order, no
-- reorder widget — the admin types a number. `active` hides a vendor
-- without losing the row (a business closes, a falling-out happens).
--
-- Run manually once against production Neon via the console SQL editor.
CREATE TABLE IF NOT EXISTS wedding_vendors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name          TEXT NOT NULL,
  -- Free text on purpose ('DJ', 'Bridal & custom dresses') — a CHECK
  -- list would need a migration every time Vero meets a florist.
  category      TEXT NOT NULL,
  blurb         TEXT NOT NULL DEFAULT '',

  website_url   TEXT,
  instagram     TEXT,
  -- Optional portrait/logo. A Drive file link or any https image URL;
  -- the API normalizes Drive links to thumbnail URLs at read time.
  photo_url     TEXT,

  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wedding_vendors_display_idx
  ON wedding_vendors (sort_order, created_at)
  WHERE active = TRUE;

CREATE OR REPLACE FUNCTION touch_wedding_vendors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wedding_vendors_touch_updated_at ON wedding_vendors;
CREATE TRIGGER wedding_vendors_touch_updated_at
  BEFORE UPDATE ON wedding_vendors
  FOR EACH ROW EXECUTE FUNCTION touch_wedding_vendors_updated_at();
