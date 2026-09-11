-- Remember which email carried the portal invite.
--
-- The id Resend returns was handed to the browser and then thrown away, so
-- the only window in which anyone could see whether the invite actually
-- landed was the few seconds the creation screen spent polling. Close the
-- tab, or have it crash, and the answer was gone: the client detail screen
-- could say "invite pending" but could not distinguish "it bounced" from
-- "it arrived and they have not opened it yet". On Resend's free tier, where
-- a shared sending IP can be blocklisted, that is the difference between a
-- client who is slow and a client who never heard from us.
--
-- Persisting the id makes the delivery state queryable at any point after
-- the fact, via the existing /api/email-status lookup.
ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS invite_email_id TEXT,
  ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;
