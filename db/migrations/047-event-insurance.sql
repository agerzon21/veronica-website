-- Per-event insurance, tracked on the booking it belongs to.
--
-- WHY THIS EXISTS
-- Veronika carries no annual liability policy. The economics say she may never
-- want one: Full Frame charges $59 per event for $1M/$2M with three days of
-- cover and $5 more for unlimited additional insureds, so $64 a wedding beats
-- a ~$530 annual policy until she is insuring about eight events a year. What
-- an event policy cannot do is cover her gear, which is annual-only, so the
-- two are not interchangeable and this table records what was actually bought
-- rather than assuming a standing policy exists.
--
-- Two things trigger a purchase, and they behave differently:
--
--   * THE VENUE REQUIRES IT. Usually discovered after the contract is signed,
--     when the venue finally sends their vendor packet. The client caused the
--     cost, so the contract's insurance clause lets it be passed on.
--   * A DRONE IS FLYING. Any shoot type, not just weddings. General liability
--     carries a standard aircraft exclusion, so a drone at a portrait session
--     is uninsured unless drone liability is bought for it specifically. When
--     the client asks for aerial footage after signing, that is a change they
--     requested and it is billable on the same clause.
--
-- And one that is NOT billable: Vero deciding she wants cover for her own
-- comfort on a big guest list nobody asked her to insure. That is her cost.
-- `billable` is what separates them, and it is deliberately not derived from
-- `trigger`, because the same trigger can go either way and only she knows.
--
-- Money flows through portal_charges, not through a column here. Eight places
-- in this codebase derive a client's balance and every one of them already
-- reads that table; a parallel money path would mean getting all eight right
-- again. `charge_id` points at the row so the amount is never written twice.

BEGIN;

ALTER TABLE client_portals
  -- 'none'      — nobody has said this event needs cover (the default).
  -- 'needed'    — flagged, not yet bought. The client may be seeing an estimate.
  -- 'purchased' — bought, with a real cost and ideally the document attached.
  -- 'declined'  — considered and deliberately not bought. Kept distinct from
  --               'none' so a decision is visible as a decision later.
  ADD COLUMN IF NOT EXISTS insurance_status TEXT NOT NULL DEFAULT 'none',

  -- What made this necessary. Structured so the admin list can filter, with
  -- `insurance_note` carrying the specifics a human needs to read.
  ADD COLUMN IF NOT EXISTS insurance_trigger TEXT,

  -- The reason in Vero's own words: which venue, what they asked for, who
  -- told us and when. This is what she reads in six months when a client
  -- queries the line on their invoice, and what the client is shown.
  ADD COLUMN IF NOT EXISTS insurance_note TEXT,

  -- Whether the cost is passed to the client. FALSE when Vero bought cover
  -- nobody asked for. The contract clause only permits billing a client for
  -- insurance the venue required or their own later request caused.
  ADD COLUMN IF NOT EXISTS insurance_billable BOOLEAN NOT NULL DEFAULT TRUE,

  -- What the client is told to expect before anything is bought. Kept apart
  -- from the actual so the two can be compared, and so a client who saw an
  -- estimate is never quietly charged a different number without it showing.
  ADD COLUMN IF NOT EXISTS insurance_estimate NUMERIC(10, 2),

  -- What was actually paid. Set at purchase time, and the amount that becomes
  -- the charge.
  ADD COLUMN IF NOT EXISTS insurance_actual NUMERIC(10, 2),

  ADD COLUMN IF NOT EXISTS insurance_provider TEXT,
  ADD COLUMN IF NOT EXISTS insurance_policy_ref TEXT,

  -- The policy document itself. A number in a field tells nobody what is
  -- actually covered; the PDF does, and a venue asking questions wants the
  -- certificate rather than a reference. Same shape as contract_signed_pdf_url.
  ADD COLUMN IF NOT EXISTS insurance_document_url TEXT,

  -- Who the certificate names besides Vero, normally the venue's legal entity.
  -- Stored because the exact registered name is what a venue rejects a COI
  -- over, and it is worth not having to ask twice.
  ADD COLUMN IF NOT EXISTS insurance_additional_insured TEXT,

  ADD COLUMN IF NOT EXISTS insurance_purchased_at TIMESTAMPTZ,

  -- The portal_charges row this created, so the client is billed exactly once
  -- however many times the record is edited afterwards.
  ADD COLUMN IF NOT EXISTS insurance_charge_id UUID;

-- Constraints added separately and dropped first, so re-running this file on a
-- database that already has them does not error.
ALTER TABLE client_portals
  DROP CONSTRAINT IF EXISTS client_portals_insurance_status_check;
ALTER TABLE client_portals
  ADD CONSTRAINT client_portals_insurance_status_check
  CHECK (insurance_status IN ('none', 'needed', 'purchased', 'declined'));

ALTER TABLE client_portals
  DROP CONSTRAINT IF EXISTS client_portals_insurance_trigger_check;
ALTER TABLE client_portals
  ADD CONSTRAINT client_portals_insurance_trigger_check
  CHECK (
    insurance_trigger IS NULL
    OR insurance_trigger IN ('venue_required', 'drone', 'client_request', 'own_choice')
  );

-- The admin list wants "which bookings still need a policy buying", which is
-- a small slice of a growing table.
CREATE INDEX IF NOT EXISTS client_portals_insurance_pending_idx
  ON client_portals (insurance_status, event_date)
  WHERE insurance_status = 'needed';

-- portal_charges.reason is constrained, and an insurance charge is not an
-- overtime charge. Widening it keeps the client-facing label honest: the
-- reason string drives what they read on their own invoice.
ALTER TABLE portal_charges
  DROP CONSTRAINT IF EXISTS portal_charges_reason_check;
ALTER TABLE portal_charges
  ADD CONSTRAINT portal_charges_reason_check
  CHECK (reason IN ('overtime', 'expense', 'insurance', 'other'));

COMMIT;

-- Undo:
--   ALTER TABLE client_portals
--     DROP CONSTRAINT IF EXISTS client_portals_insurance_status_check,
--     DROP CONSTRAINT IF EXISTS client_portals_insurance_trigger_check,
--     DROP COLUMN IF EXISTS insurance_status,
--     DROP COLUMN IF EXISTS insurance_trigger,
--     DROP COLUMN IF EXISTS insurance_note,
--     DROP COLUMN IF EXISTS insurance_billable,
--     DROP COLUMN IF EXISTS insurance_estimate,
--     DROP COLUMN IF EXISTS insurance_actual,
--     DROP COLUMN IF EXISTS insurance_provider,
--     DROP COLUMN IF EXISTS insurance_policy_ref,
--     DROP COLUMN IF EXISTS insurance_document_url,
--     DROP COLUMN IF EXISTS insurance_additional_insured,
--     DROP COLUMN IF EXISTS insurance_purchased_at,
--     DROP COLUMN IF EXISTS insurance_charge_id;
--   DROP INDEX IF EXISTS client_portals_insurance_pending_idx;
--   -- portal_charges.reason: revert only once no 'insurance' rows remain.
--   ALTER TABLE portal_charges DROP CONSTRAINT IF EXISTS portal_charges_reason_check;
--   ALTER TABLE portal_charges ADD CONSTRAINT portal_charges_reason_check
--     CHECK (reason IN ('overtime', 'expense', 'other'));
