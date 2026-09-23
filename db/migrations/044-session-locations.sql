-- 044-session-locations.sql
--
-- A booking happens in more than one place, more often than not.
--
-- A proposal at a winery at 3:00 and the engagement portraits at a state park
-- at sunset. A ceremony at a church and the reception at a venue across town.
-- Getting ready at a hotel, then both. Until now the system could hold exactly
-- ONE address and ONE time string per booking, so the second place could only
-- be typed into a free-text coverage box, where it is prose on a contract and
-- invisible to everything else: the Directions button cannot drive to it, the
-- client's own portal never mentions it, and on the morning of the shoot the
-- client record shows one of the two places she has to be.
--
-- ───────────────────────────────────────────────────────────────────────
-- WHY A JSONB COLUMN AND NOT A CHILD TABLE
--
-- portal_charges (035) is a child table because charges are summed, queried
-- and reasoned about individually. A booking's locations are the opposite:
-- an ordered list of at most a few entries, always read whole, always with
-- the booking, never aggregated. A join would buy nothing and cost every
-- reader.
--
-- ───────────────────────────────────────────────────────────────────────
-- WHY session_location SURVIVES
--
-- Eight places read the single address today, including the row the paying
-- CLIENT sees in their own portal and the tap-to-navigate button Veronika
-- uses on the day. Migration 039 drew the line this builds on:
--
--   session_location                      where she drives to. Operational,
--                                         editable at any time, on every
--                                         booking whether or not it has a
--                                         contract.
--   contract_variables->>'event_location' what the CLIENT AGREED TO. Frozen
--                                         once the contract is signed.
--
-- session_locations is the ordered list, and session_location keeps holding
-- the FIRST entry's address. Every existing reader goes on working untouched
-- and unaware; only the screens that want the whole list ask for it. The
-- write path in api/admin/_portal-update.ts is what keeps the two in
-- agreement, deliberately in ONE place, so they cannot drift.
--
-- An earlier design for this was rejected in review for putting a SENTENCE
-- ("Two locations, listed under Session Schedule below") into the single
-- address field. That sentence would have reached the client's portal as
-- their location and the Directions button as a destination for Google Maps.
-- Nothing here ever writes prose into an address field.
--
-- ───────────────────────────────────────────────────────────────────────
-- SHAPE
--
--   [{ "label": "Proposal",
--      "address": "Mountain View Vineyard, 1310 Mountain Rd, ...",
--      "starts_at": "3:00 PM",
--      "ends_at":   "3:30 PM" }, ...]
--
-- label is what it IS, so the day-of list reads "Proposal" and "Sunset
-- portraits" rather than two addresses. Times are free text in the same
-- register as contract_variables->>'event_time', which is already prose
-- ("Half-day coverage, approximately 4 hours"): a TIME column would refuse
-- the half of real bookings whose schedule is not yet exact.
--
-- ADDITIVE AND INERT. One nullable column and a backfill that only ever
-- writes where a single address already exists, so every current booking ends
-- up with a one-entry list saying exactly what it says today.

BEGIN;

ALTER TABLE client_portals
  ADD COLUMN IF NOT EXISTS session_locations JSONB;

COMMENT ON COLUMN client_portals.session_locations IS
  'Ordered list of places this booking happens, [{label, address, starts_at,
   ends_at}]. The FIRST entry''s address is mirrored into session_location by
   api/admin/_portal-update.ts so the eight readers of the single address keep
   working. Free text throughout: an address that has not been pinned down yet
   is still worth recording, and the times share the prose register of
   contract_variables->>''event_time''. Never holds a sentence in place of an
   address; the single-address readers include the client''s own portal row
   and the Maps destination.';

-- Backfill: every booking that already knows where it is gets a one-entry
-- list saying the same thing. Guarded so a re-run is a no-op.
UPDATE client_portals
   SET session_locations = jsonb_build_array(
         jsonb_build_object(
           'label', '',
           'address', COALESCE(NULLIF(TRIM(session_location), ''),
                               NULLIF(TRIM(contract_variables->>'event_location'), '')),
           'starts_at', '',
           'ends_at', ''))
 WHERE session_locations IS NULL
   AND COALESCE(NULLIF(TRIM(session_location), ''),
                NULLIF(TRIM(contract_variables->>'event_location'), '')) IS NOT NULL;

COMMIT;

-- Undo:
--   ALTER TABLE client_portals DROP COLUMN IF EXISTS session_locations;
-- session_location is untouched by this migration and still holds the primary
-- address, so dropping the column loses only the second and later entries.
