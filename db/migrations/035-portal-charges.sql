-- Charges added to a booking after the fact: extra time, and costs paid on the day.
--
-- The contract's ADDITIONAL TIME AND EXPENSES clause gives Veronika the right
-- to bill for a session that ran long at the client's request, and for money
-- she laid out on the day (parking, an entry fee). Until now there was nowhere
-- to put either: the only lever was editing contract_total_amount, which
-- rewrites history, loses the reason, and shows the client a number that
-- silently changed with no explanation.
--
-- This is the mirror image of payment_entries. That table logs money coming
-- in and sums into client_portals.paid_to_date; this one logs money owed and
-- sums into client_portals.charges_total, by the same app-layer bookkeeping in
-- api/admin/_payment-log.ts rather than by a trigger, so the two behave the
-- same way and can be reasoned about together.
--
--   amount still owed = contract_total_amount + charges_total - paid_to_date
--
-- Every charge carries its reason, because the whole point is that the client
-- can see exactly what was added and why. A line reading "Parking at the
-- venue, $10" is a receipt; a total that grew by $10 is an argument.
--
-- Charges are deliberately additive and never negative. To undo one, delete
-- it: a $10 charge and a -$10 correction sitting next to each other in a
-- client's portal reads as a mistake being covered up.

CREATE TABLE IF NOT EXISTS portal_charges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_portal_id  UUID NOT NULL
                      REFERENCES client_portals(id) ON DELETE CASCADE,
  amount            NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  -- Which clause justifies this. Checked here, unlike payment_entries.method,
  -- because this string is shown to the client and drives the label they read.
  reason            TEXT NOT NULL
                      CHECK (reason IN ('overtime', 'expense', 'other')),
  -- The specifics the client sees: "Parking at the venue", "45 minutes over".
  note              TEXT,
  charged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portal_charges_portal_idx
  ON portal_charges (client_portal_id);

-- Denormalised sum, maintained app-side exactly like paid_to_date. Existing
-- portals get 0, so nothing about any current booking changes.
ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS charges_total NUMERIC(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN client_portals.charges_total IS
  'Sum of portal_charges.amount for this portal, maintained in app code (see api/admin/_payment-log.ts). Amount owed = contract_total_amount + charges_total - paid_to_date.';
