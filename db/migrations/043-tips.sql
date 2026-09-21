-- 043-tips.sql
--
-- A tip is money in that is NOT money owed.
--
-- Every other row in payment_entries answers the question "how much of the
-- contract has been settled". A tip answers a different question entirely, and
-- putting it in the same sum breaks three things at once:
--
--   1. owed = contract_total_amount + charges_total - paid_to_date goes
--      NEGATIVE, so the portal and the admin screen both start reporting the
--      booking as overpaid for as long as it exists.
--   2. api/admin/_portal-deliver.ts refuses to release photos over an unpaid
--      balance. A tip large enough to cover the remainder would open that gate
--      on work that has not been paid for.
--   3. The settle-discount callout in AdminClientDetail fires when the
--      remainder is small enough to be the card fee. A tip moves that number,
--      so the callout would appear and disappear for reasons unrelated to the
--      fee.
--
-- So tips live in this table, next to the payments, and are excluded from
-- exactly one sum: the subquery in recomputePaidToDate (api/_payments.ts).
-- That function is the ONLY writer of paid_to_date, which is why this can be a
-- single column rather than a parallel table. Eight places read the balance
-- and none of them change.
--
-- Why not a separate tips table. A tip arrives down the same road as a card
-- payment: one Stripe session, one webhook, one processor_payment_id that must
-- be unique so a retried webhook cannot record it twice. A second table would
-- need its own copy of that idempotency, its own refund handling, and its own
-- dispute handling, and the three would drift. One table, one column.
--
-- ADDITIVE and backfill-free. Every existing row is a payment, which is what
-- the default says, so paid_to_date is unchanged by this migration. That is
-- asserted below rather than assumed.

BEGIN;

ALTER TABLE payment_entries
  -- What this money WAS, as opposed to how it arrived (source) or whether it
  -- cleared (status). Those three are independent: a tip can be manual or
  -- stripe, pending or succeeded, exactly like a payment.
  --
  -- Checked rather than free text, because unlike `method` this string decides
  -- whether the row counts toward what the client owes. A typo in `method`
  -- is cosmetic. A typo here is somebody's balance.
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'payment'
    CHECK (kind IN ('payment', 'tip'));

-- The balance sum filters on (status, kind) together now. Without this it is a
-- sequential scan of every row for a booking on the delivery path, which is
-- the one place latency is user-visible.
CREATE INDEX IF NOT EXISTS payment_entries_portal_kind_idx
  ON payment_entries (client_portal_id, kind, status);

-- Assert the claim this migration is built on: no existing row changed
-- meaning, so no booking's paid_to_date can have moved. If any row somehow
-- came in as something other than 'payment', the whole thing rolls back and
-- the balance arithmetic is never quietly wrong.
DO $$
DECLARE
  stragglers INTEGER;
BEGIN
  SELECT count(*) INTO stragglers FROM payment_entries WHERE kind <> 'payment';
  IF stragglers > 0 THEN
    RAISE EXCEPTION
      'migration 043: % payment_entries rows are not kind=payment after an additive migration that should have made every row a payment',
      stragglers;
  END IF;
END $$;

COMMIT;
