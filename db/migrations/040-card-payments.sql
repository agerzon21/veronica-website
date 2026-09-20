-- 040-card-payments.sql
--
-- Let a card payment land in the ledger that already exists.
--
-- payment_entries is today a record of money that ALREADY arrived, typed in by
-- Vero after a Zelle or a handful of cash. A card payment is the same fact
-- arriving by a different road, so it belongs in the same table rather than in
-- a parallel money system. That is not tidiness: eight places derive
-- total + charges - paid, including the 409 in _portal-deliver.ts that refuses
-- to release photos over an unpaid balance. Feeding this table means the
-- delivery gate opens correctly for free, and none of those eight change.
--
-- ADDITIVE. Every existing row keeps its meaning: source 'manual', status
-- 'succeeded', and NULL for everything a processor would have filled in.
-- paid_to_date is unchanged, which is asserted after this runs rather than
-- assumed.

BEGIN;

ALTER TABLE payment_entries
  -- How this row got here. NOT derived from `method`, which is free text Vero
  -- types ("Zelle", "zelle", "venmo - late"), so `method` can never be the
  -- field that decides whether a row may be deleted. A manual row is a note
  -- about money and deleting it is a correction. A processor row is a receipt
  -- for money that really moved, and deleting it desynchronises this ledger
  -- from Stripe with nothing to notice the drift.
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'stripe')),

  -- Whether the money is actually CLEARED.
  --
  -- Every row today is succeeded, so nothing changes now. It exists now
  -- because the balance sum is being taught to count only cleared money in
  -- this same change, and retrofitting that later is the kind of edit that
  -- silently opens the delivery gate on money that has not landed.
  --
  -- This is what ACH needs: bank debits settle in about four business days and
  -- can fail after the fact, so an ACH row starts pending and the photos stay
  -- gated until it clears. A card is authorised and captured in one step, so
  -- it is succeeded immediately.
  --
  -- No 'refunded' value on purpose. A refund is its own row with a NEGATIVE
  -- amount, which keeps the ledger a history rather than a mutable current
  -- state, and keeps the balance a plain sum. amount has no CHECK, so
  -- negatives are already legal.
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'succeeded'
    CHECK (status IN ('succeeded', 'pending', 'failed')),

  -- The processor's id for the payment. For Stripe this is the PaymentIntent
  -- (pi_...), deliberately NOT the event id: Stripe emits several distinct
  -- events for one payment, each with its own event id, so keying on the event
  -- would let one 400 dollar payment insert three rows while every delivery
  -- was genuinely unique.
  ADD COLUMN IF NOT EXISTS processor_payment_id TEXT,

  -- The connected account the money went to. NULL for every row today, because
  -- there is one merchant. This is the entire multi-tenant seam: the day other
  -- photographers are paid into their own accounts, this column says whose
  -- money a row was. Adding it now costs nothing and means the ledger does not
  -- need rewriting then.
  ADD COLUMN IF NOT EXISTS processor_account_id TEXT,

  -- What the processor kept. `amount` is always the GROSS, what the client
  -- paid, because that is what settles their balance. Recording the net would
  -- mean a 900 dollar balance paid in full still reads as 26 dollars
  -- outstanding, the delivery gate never opens, and nothing says why.
  ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(10, 2),

  -- Not PCI scoped and safe to store: these are what let Vero recognise a
  -- payment when a client says "I paid with the Visa". The card number, the
  -- CVV and anything else never touch this server, this database or a log.
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS card_last4 TEXT;

-- The idempotency guarantee, and the reason a webhook can be delivered twice
-- without charging anyone twice in the ledger.
--
-- PARTIAL on purpose. Every existing cash and Zelle row has a NULL
-- processor_payment_id, and a plain UNIQUE would permit exactly one of them,
-- so this migration would fail on the second row and take the table with it.
CREATE UNIQUE INDEX IF NOT EXISTS payment_entries_processor_payment_id_key
  ON payment_entries (processor_payment_id)
  WHERE processor_payment_id IS NOT NULL;

-- Reading the ledger back from a processor id, which is what a refund webhook
-- and any manual reconciliation both start from.
CREATE INDEX IF NOT EXISTS payment_entries_source_idx
  ON payment_entries (client_portal_id, source);

COMMENT ON COLUMN payment_entries.amount IS
  'GROSS, what the client paid. Never the net. The balance is settled by what
   they handed over, not by what survived the processor fee, which lives in
   fee_amount.';

COMMIT;

-- Undo:
--   DROP INDEX IF EXISTS payment_entries_source_idx;
--   DROP INDEX IF EXISTS payment_entries_processor_payment_id_key;
--   ALTER TABLE payment_entries
--     DROP COLUMN IF EXISTS card_last4,
--     DROP COLUMN IF EXISTS card_brand,
--     DROP COLUMN IF EXISTS fee_amount,
--     DROP COLUMN IF EXISTS processor_account_id,
--     DROP COLUMN IF EXISTS processor_payment_id,
--     DROP COLUMN IF EXISTS status,
--     DROP COLUMN IF EXISTS source;
-- Every remaining row is byte-identical to before this ran.
