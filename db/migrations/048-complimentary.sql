-- A booking shot for free, for family or close friends.
--
-- WHY THIS EXISTS
-- Four real bookings were shot at no charge: Alex's sister's courthouse
-- wedding and her wedding, his stepdad's birthday, and a close friend's
-- destination wedding where the only money that moved covered travel. In the
-- admin they read as "$0 of $0", or as nothing at all, which says neither
-- "free" nor "unpaid", and the difference matters twice: to Vero, who should
-- never chase them, and at tax time, where a free shoot is no income and no
-- sales tax, while an unpaid one is money still owed.
--
-- WHAT IT DOES. A free booking owes nothing, whatever total it carries. The
-- admin shows "Free, friends & family" in place of the money figures and keeps
-- it out of the owes and overpaid filters; the client's portal shows no
-- balance and no Pay button; checkout takes a tip and nothing else; and the
-- photo release does not wait for a payment. Every free booking on file today
-- has no total (or a total of 0), so for those the tag is the only change.
--
-- Adding a column with a constant default is a catalog change in Postgres 11
-- and later: no table rewrite, no lock worth the name, safe to run while the
-- site is live and before any code that reads it is deployed.

BEGIN;

ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS complimentary BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN client_portals.complimentary IS
  'Shot for free for family or friends. Nothing is owed whatever the total:
   no balance, checkout takes only a tip, delivery is not held for payment.
   For tax: no income and no sales tax are expected.';

COMMIT;

-- Undo:
--   ALTER TABLE client_portals DROP COLUMN IF EXISTS complimentary;
