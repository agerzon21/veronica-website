-- 039-session-location.sql
--
-- Where the shoot is, as an operational fact rather than a contract term.
--
-- The address only ever existed as contract_variables->>'event_location', so
-- only bookings with a contract had one. Ten of the eighteen real bookings are
-- gallery-only, and NONE of them has an address anywhere, which means the
-- tap-to-navigate row on the client record is dead for the majority of the
-- records it was built for.
--
-- Why not just write the address into contract_variables for gallery-only
-- rows: every one of them carries contract_template_key = 'wedding' as a
-- default with contract_variables IS NULL, and api/admin/_portal-update.ts
-- re-renders the contract body whenever variables are patched on an unfrozen
-- contract. Patching a gallery-only row would therefore render a WEDDING
-- CONTRACT onto a booking that has no contract. Quietly, and for ten rows.
--
-- So the two are deliberately separate concerns:
--   session_location                     where she drives to. Operational,
--                                        editable at any time, on every
--                                        booking whether or not it has a
--                                        contract.
--   contract_variables->>'event_location' what the CLIENT AGREED TO. Frozen
--                                        once the contract is signed, exactly
--                                        like every other contract term.
--
-- Readers prefer session_location and fall back to the contract variable, so
-- nothing breaks for the eight bookings that already have one.
--
-- NOT inert: it backfills. That is one UPDATE, it only ever writes where the
-- column is NULL, it copies a value the row already holds, and it is therefore
-- safe to re-run. Nothing is overwritten and no other column is touched.

BEGIN;

ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS session_location TEXT;

COMMENT ON COLUMN client_portals.session_location IS
  'Street address of the shoot, for navigation. Free text on purpose: she
   types what a map can find, which is sometimes a venue name and not a postal
   address. Falls back to contract_variables->>''event_location'' when NULL, so
   bookings created before this column keep working. Editing this does NOT
   change a signed contract, which is the point of keeping them apart.';

-- Backfill from the contract so the eight bookings that already have an
-- address do not appear to lose it. WHERE session_location IS NULL makes this
-- idempotent: re-running cannot clobber an address typed after the fact.
UPDATE client_portals
   SET session_location = NULLIF(TRIM(contract_variables->>'event_location'), '')
 WHERE session_location IS NULL
   AND contract_variables IS NOT NULL
   AND NULLIF(TRIM(contract_variables->>'event_location'), '') IS NOT NULL;

COMMIT;

-- Undo:
--   ALTER TABLE client_portals DROP COLUMN IF EXISTS session_location;
-- The contract variable is untouched by this migration, so dropping the column
-- loses only addresses typed into the new field.
