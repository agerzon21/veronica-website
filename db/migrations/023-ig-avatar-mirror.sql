-- 023 — Mirror Instagram contact avatars to our own storage.
--
-- Run once against production Neon. Safe to re-run.
--
-- WHY
-- conversations.contact_profile_pic_url holds whatever Meta handed us at first
-- contact: a PRE-SIGNED cdninstagram URL that expires in 24-72h (as little as
-- 1-3h during a CDN rotation, per api/_ig-profile.ts). Nothing renewed it, so
-- every avatar in the admin inbox eventually 403'd and rendered as a broken
-- image. It was never a bug in one line — the value was always on a timer.
--
-- The first fix was a daily job that re-fetched a fresh signed URL. That works
-- but is the wrong shape: it needs a cron forever, it can drift, and a URL can
-- still die between runs. This column is the right shape — download the bytes
-- ONCE into Vercel Blob and store a permanent URL that never expires. After a
-- row is mirrored it never needs touching again, so the job naturally goes
-- idle instead of running forever.
--
-- contact_profile_pic_url is deliberately KEPT. It stays the fallback for rows
-- not yet mirrored, and it is what the mirror downloads from.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS contact_avatar_url        TEXT,
  ADD COLUMN IF NOT EXISTS contact_avatar_mirrored_at TIMESTAMPTZ,
  -- Counts consecutive failures so a permanently-broken contact (deleted
  -- account, blocked media) stops being retried on every single run.
  ADD COLUMN IF NOT EXISTS contact_avatar_failures    INTEGER NOT NULL DEFAULT 0;

-- The mirror's work queue: instagram rows that have no permanent avatar yet and
-- have not already failed repeatedly. Partial index so it stays tiny and goes
-- effectively empty once the backfill completes — which is the point.
CREATE INDEX IF NOT EXISTS conversations_avatar_mirror_pending_idx
  ON conversations (updated_at)
  WHERE platform = 'instagram'
    AND contact_avatar_url IS NULL
    AND contact_avatar_failures < 3;
