-- 038-delivery-email-evidence.sql
--
-- Keep evidence that the photos-are-ready email was actually sent.
--
-- The one email that matters most on this whole system had none. The invite
-- email stores invite_email_id and the client record does a live Resend
-- lookup against it, so its delivery is visible. The delivery email caught its
-- own send failure, wrote it to console.error, and fell through to a 200. The
-- button that sends it then hides itself, because it is gated on the gallery
-- not yet being delivered.
--
-- So the whole failure mode was: the gallery is released, the client is never
-- told, Vero sees a success, and there is no id to look up, no status to read
-- and no way to send it again. The client eventually asks where their photos
-- are.
--
-- Mirrors the invite columns deliberately, so the detail endpoint and the UI
-- can treat both emails the same way.
--
-- ADDITIVE AND INERT. Two nullable columns. Every existing row reads NULL,
-- which renders as "no delivery evidence", which is the honest description of
-- every gallery delivered before today.

BEGIN;

ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS delivery_email_id TEXT;

ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS delivery_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN client_portals.delivery_email_id IS
  'Resend message id for the photos-are-ready email, or NULL if it was never
   sent or failed. Looked up live by the admin client record the same way
   invite_email_id is. NULL on rows delivered before this column existed, which
   is why the UI says "not recorded" rather than "not sent".';

COMMENT ON COLUMN client_portals.delivery_email_sent_at IS
  'When the photos-are-ready email was last successfully handed to Resend.
   Updated on a resend, so it reflects the most recent attempt that worked.';

COMMIT;

-- Undo:
--   ALTER TABLE client_portals DROP COLUMN IF EXISTS delivery_email_id;
--   ALTER TABLE client_portals DROP COLUMN IF EXISTS delivery_email_sent_at;
