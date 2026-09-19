-- 037-client-phone.sql
--
-- Give a client record a phone number.
--
-- There is no phone number anywhere in this system today. Not on
-- client_portals, not on contact_submissions, not in the contact form payload.
-- A booking carries an email and nothing else, so the screen that describes a
-- shoot offers no way to reach the person whose shoot it is. On a wedding
-- morning that is the wrong answer: email is useless when she is fifteen
-- minutes out, cannot find the right entrance, or missed a call from the venue.
--
-- Scored against every other capability on that screen it lands in the top
-- tier, and it is the only one up there that cannot be fixed by moving
-- something, because the data does not exist.
--
-- It is also the join key for the WhatsApp and SMS work: a verified E.164 on
-- one channel matching a verified E.164 on the other is the single identity
-- signal safe enough to link automatically, since both sides were proven by
-- possession rather than inferred.
--
-- ADDITIVE AND INERT. One nullable column. Every existing row reads NULL and
-- renders as "not on file", which is exactly how the screen behaves today.
-- No existing row is rewritten. No current client is affected.

BEGIN;

ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS client_phone TEXT;

COMMENT ON COLUMN client_portals.client_phone IS
  'Optional. E.164 with a leading plus when it parses, otherwise whatever she
   typed. Deliberately NOT unique and NOT constrained: a couple share one
   number, and a CHECK that rejects a number typed in a hurry turns a
   nice-to-have into a reason a booking cannot be saved. Normalization happens
   in application code so it can be matched against a WhatsApp wa_id and an SMS
   sender without a second parse. Unverified by nature: it drives suggestions,
   never an automatic identity merge.';

COMMIT;

-- Undo:
--   ALTER TABLE client_portals DROP COLUMN IF EXISTS client_phone;
-- Nothing references it until the UI ships, so dropping it is free.
