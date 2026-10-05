-- Who pays Stripe's fee: the client who pays by card, from 2026-10-05.
--
-- WHY THIS EXISTS
-- Until now the price on a booking was the CARD price, and a client paying by
-- Zelle, Venmo, Cash App or cash was offered the card fee off. That made the
-- number Vero quoted the number a card payer paid, so every card payment left
-- her about 3% short of her own price: the first weekly payout showed $18.30
-- gone from $600. Alex: "for 100$ payment the stripe payment should be 103.20
-- and vero keeps 100, the Zelle payment would be 100."
--
-- So a booking's amounts are now what Vero KEEPS, and paying by card costs
-- more, by exactly what Stripe takes ($103.30 for $100, because the fee is
-- also charged on the extra). Both prices are stated, card first, which keeps
-- it a lower price for paying another way rather than a fee added for using a
-- card: Visa and Mastercard forbid surcharging debit cards, and Stripe Checkout
-- cannot tell debit from credit before the card is entered.
--
-- client_portals.card_pricing, two values:
--   single  One price whatever the method; Vero absorbs the card fee. Every
--           booking that exists today, because a signed contract states one
--           total and a card payer cannot be asked for more than it. The old
--           discount for paying directly is dropped too: no contract ever
--           promised it, and no client ever took it (no waiver row exists).
--   dual    The stated amounts are the direct price; a card payment is grossed
--           up so Stripe's fee comes out of the card payer. Written explicitly
--           by the create handler for every full booking from now on.
--
-- THE DEFAULT STAYS 'single', on purpose. This runs BEFORE the code that
-- writes the PRICES BY CARD section is deployed; a 'dual' default would mark a
-- booking created in that gap as dual while its contract, rendered by the old
-- code, states one price, and checkout would then charge more than the signed
-- contract says. Only the code that writes the card prices may write 'dual'.
--
-- payment_entries.credited_amount: how much of a payment counts toward the
-- balance. NULL means all of it, which is every payment that is not a card
-- payment on a dual booking. A $103.30 card retainer on a dual booking is
-- credited $100.00; the $3.30 is what Stripe takes. The amount column stays
-- GROSS, what the client actually paid, because revenue and the sales tax
-- return read it (a card sale's price is the card price). Refunds and
-- chargebacks reverse their share in proportion, from the original row.
--
-- payment_entries.reverses_payment_id: on a refund, chargeback, or the undoing
-- of one, the processor id of the PAYMENT it reverses. Without it the share of
-- several partial refunds was rounded one refund at a time, and two halves of a
-- $49.99 credit came to $50.00, leaving a booking a cent short forever. With it
-- each reversal takes what the running total says is due, so they sum exactly.
--
-- paid_to_date is re-summed from COALESCE(credited_amount, amount) in
-- api/_payments.ts, the only writer of that column, so all eight balance
-- readers follow without being touched.
--
-- Constant defaults: catalog changes only, no table rewrite, safe while live.
-- ORDER: this must be applied BEFORE the code is deployed, which reads and
-- writes these columns unconditionally. Until then a NULL credit and a
-- 'single' booking behave exactly as today. Rolling the code back after a dual
-- card payment exists is NOT safe: the old re-sum would count the gross amount
-- and credit the client with Stripe's share.

BEGIN;

ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS card_pricing TEXT NOT NULL DEFAULT 'single';

-- Explicit, so a re-run on a database that once had another default ends at
-- 'single' too.
ALTER TABLE client_portals
  ALTER COLUMN card_pricing SET DEFAULT 'single';

ALTER TABLE client_portals
  DROP CONSTRAINT IF EXISTS client_portals_card_pricing_check;
ALTER TABLE client_portals
  ADD CONSTRAINT client_portals_card_pricing_check
  CHECK (card_pricing IN ('single', 'dual'));

COMMENT ON COLUMN client_portals.card_pricing IS
  'single: one price for every method, Vero absorbs the card fee (bookings before 2026-10-05). dual: amounts are what Vero keeps, card payers pay Stripe''s fee on top. Migration 054.';

ALTER TABLE payment_entries
  ADD COLUMN IF NOT EXISTS credited_amount NUMERIC(10, 2);

COMMENT ON COLUMN payment_entries.credited_amount IS
  'The part of this payment that counts toward the balance. NULL means all of it. Set on card payments to dual-priced bookings. Migration 054.';

ALTER TABLE payment_entries
  ADD COLUMN IF NOT EXISTS reverses_payment_id TEXT;

COMMENT ON COLUMN payment_entries.reverses_payment_id IS
  'On a refund, chargeback or the undoing of one: the processor id of the payment it reverses, so partial reversals share its credit exactly. Migration 054.';

CREATE INDEX IF NOT EXISTS payment_entries_reverses_idx
  ON payment_entries (reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;

COMMIT;

-- Undo (only before any dual booking has taken a card payment, or the
-- balances of those bookings will read short by the card price difference):
--   DROP INDEX IF EXISTS payment_entries_reverses_idx;
--   ALTER TABLE payment_entries DROP COLUMN IF EXISTS reverses_payment_id;
--   ALTER TABLE payment_entries DROP COLUMN IF EXISTS credited_amount;
--   ALTER TABLE client_portals DROP CONSTRAINT IF EXISTS client_portals_card_pricing_check;
--   ALTER TABLE client_portals DROP COLUMN IF EXISTS card_pricing;
