-- Pennsylvania sales tax, decided per booking.
--
-- WHY THIS EXISTS
-- Veronika registered as a Pennsylvania sales tax vendor on 2026-09-29.
-- Photography delivered in Pennsylvania is taxable at 6% however the photos
-- are handed over, and from 2026-10-01 new bookings add it on top of the
-- price. Alex's decision: every booking that existed before then keeps the
-- price it was agreed at, and work delivered outside Pennsylvania is not a PA
-- sale at all.
--
-- THREE VALUES, because a yes/no loses one of them:
--   added     6% on top of the price. Stated on the contract, the client's
--             portal and the card checkout.
--   absorbed  The agreed price stands and no tax is added, but the sale is
--             still taxable, so Vero remits 6% of what she receives out of it.
--   exempt    Delivered outside Pennsylvania. Not a PA sale.
--
-- Every existing row becomes 'absorbed', the grandfathered case. The default
-- afterwards is 'added', so a new booking is taxed unless somebody says
-- otherwise. The existing out-of-state bookings are set to 'exempt' by name
-- after this runs, because which ones they are is a fact about the world, not
-- about the schema.
--
-- Adding a column with a constant default is a catalog change in Postgres 11
-- and later: no table rewrite, safe while the site is live and before any
-- code that reads it is deployed.

BEGIN;

ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS sales_tax TEXT NOT NULL DEFAULT 'absorbed';

ALTER TABLE client_portals
  ALTER COLUMN sales_tax SET DEFAULT 'added';

ALTER TABLE client_portals
  DROP CONSTRAINT IF EXISTS client_portals_sales_tax_check;
ALTER TABLE client_portals
  ADD CONSTRAINT client_portals_sales_tax_check
  CHECK (sales_tax IN ('added', 'absorbed', 'exempt'));

COMMENT ON COLUMN client_portals.sales_tax IS
  'Pennsylvania sales tax for this booking. added: 6% on top of the price.
   absorbed: grandfathered, the agreed price stands and Vero remits 6% of what
   she receives. exempt: delivered outside Pennsylvania, not a PA sale.';

COMMIT;

-- Undo:
--   ALTER TABLE client_portals DROP CONSTRAINT IF EXISTS client_portals_sales_tax_check;
--   ALTER TABLE client_portals DROP COLUMN IF EXISTS sales_tax;
