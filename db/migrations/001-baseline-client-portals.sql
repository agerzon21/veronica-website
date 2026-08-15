-- Baseline migration for the three "god" tables that were created
-- by hand in Neon's SQL editor before we had a migrations folder:
--   - client_portals        (contract + client + gallery + signature
--                            + invoice — all bundled)
--   - payment_entries       (ad-hoc payment log)
--   - payment_installments  (structured payment plan)
--
-- Retroactively captured on 2026-08-14 via schema introspection
-- against production Neon. Everything here matches the live state
-- byte-for-byte — verify with `\d+ <tablename>` after applying to
-- a fresh DB.
--
-- Every statement uses IF NOT EXISTS / IF NOT EXISTS-equivalent
-- patterns so this migration is a no-op against a DB where the
-- tables already exist (i.e. production Neon). Safe to run
-- against a fresh DB (spins them up) or against prod (does nothing).
--
-- Run once against a fresh Neon branch or DB. Not needed on prod
-- since the tables are already there — but this file is the source
-- of truth going forward, so any schema change should extend it
-- (via a new numbered migration file) instead of a direct SQL
-- edit in the Neon console.
--
-- Migrations 002-011 exist in this folder and add the ai_context,
-- messaging, journal, gallery_photos, assistant_chats, etc. tables
-- on top of this baseline.

-- ────────────────────────────────────────────────────────────────
-- client_portals — the god table.
--
-- Represents simultaneously: a client identity, a booking, a
-- contract, a signature record, a gallery, and an invoice. The
-- auditor was right that this is technical debt — but factoring it
-- out into normalized tables (clients / bookings / contracts /
-- galleries / invoices) is a large refactor that we've deferred
-- (see the contract audit review discussion). New schema should
-- avoid extending this table further.
--
-- The `mode` field distinguishes two flows:
--   - 'simple'  → gallery-only portal (no contract, no invoice
--                 tracking; just a password-protected photo view)
--   - 'full'    → full paid-booking portal (contract signing,
--                 payment tracking, then gallery delivery)
--
-- The `contract_*` fields hold the signed contract state per the
-- ESIGN Act / UETA requirements: signature image data, IP, user
-- agent, timestamp, and an HMAC of the whole payload for tamper
-- detection. See api/portal/_sign-contract.ts for the signing
-- flow and audit_hmac generation.
--
-- The `gallery_password` is currently stored PLAINTEXT — this is a
-- known security bug flagged for the near-term fix list. Migration
-- to bcrypt will be a transitional column addition rather than an
-- in-place mutation; see the plan.
CREATE TABLE IF NOT EXISTS client_portals (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Which flow this portal serves.
  mode                            TEXT NOT NULL DEFAULT 'simple'
                                    CHECK (mode IN ('simple', 'full')),

  -- Booking / client identity
  session_type                    TEXT,
  partner_1_first_name            TEXT,
  partner_2_first_name            TEXT,
  partner_1_full_name             TEXT,
  partner_2_full_name             TEXT,
  client_display_name             TEXT NOT NULL,
  client_email                    TEXT,
  client_password                 TEXT,  -- SECURITY: plaintext today, planned bcrypt migration
  event_date                      DATE,

  -- Contract state (only relevant when mode = 'full')
  contract_template_key           TEXT NOT NULL DEFAULT 'wedding',
  contract_status                 TEXT NOT NULL DEFAULT 'none'
                                    CHECK (contract_status IN ('none','pending','signed','void')),
  contract_body                   TEXT,
  contract_variables              JSONB,
  contract_total_amount           NUMERIC(10, 2),
  contract_retainer_amount        NUMERIC(10, 2),
  paid_to_date                    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  payment_plan_enabled            BOOLEAN NOT NULL DEFAULT FALSE,

  -- Signature evidence (populated at signing)
  contract_signed_at              TIMESTAMPTZ,
  contract_signer_name            TEXT,
  contract_signer_email           TEXT,
  contract_signer_signature_data  TEXT,
  contract_signer_ip              TEXT,
  contract_signer_user_agent      TEXT,
  contract_audit_hmac             TEXT,
  contract_signed_pdf_url         TEXT,

  -- Onboarding token — 32 random bytes, 14-day expiry, atomically
  -- consumed by the client on first setup (see /api/portal/_setup.ts)
  setup_token                     TEXT UNIQUE,
  setup_token_expires_at          TIMESTAMPTZ,

  -- Gallery
  gallery_password                TEXT NOT NULL UNIQUE,
  gallery_enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
  drive_url                       TEXT,
  gallery_delivered_at            TIMESTAMPTZ,
  gallery_expires_at              DATE,
  -- Which photo IDs the client has favorited (in-portal action).
  favorite_photo_ids              TEXT[]
);

-- Case-insensitive email uniqueness. Partial index so multiple
-- portals with NULL email are still allowed (early-stage bookings
-- often don't have the client's email yet).
CREATE UNIQUE INDEX IF NOT EXISTS client_portals_email_unique
  ON client_portals (LOWER(client_email))
  WHERE client_email IS NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- payment_entries — ad-hoc log of payments received for a portal.
--
-- Used when payment_plan_enabled = FALSE, or as a supplement to
-- installments when payments come in outside the plan (a deposit
-- separately from the scheduled first installment, for instance).
-- Sums into client_portals.paid_to_date via app-layer bookkeeping
-- rather than a database trigger — see api/admin/_payment-log.ts.
CREATE TABLE IF NOT EXISTS payment_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_portal_id  UUID NOT NULL
                      REFERENCES client_portals(id) ON DELETE CASCADE,
  amount            NUMERIC(10, 2) NOT NULL,
  method            TEXT,     -- 'cash' | 'venmo' | 'cashapp' | 'zelle' | 'stripe' | 'other' — validated app-side, no CHECK constraint here (unlike payment_installments — an inconsistency to reconcile later)
  note              TEXT,
  paid_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_entries_portal_idx
  ON payment_entries (client_portal_id);

-- ────────────────────────────────────────────────────────────────
-- payment_installments — structured payment plan for a portal.
--
-- Used when payment_plan_enabled = TRUE. Each row is one scheduled
-- installment with a due_date and expected amount; paid_at + paid_amount
-- get filled in when the installment is received. Multiple installments
-- link to the same portal via client_portal_id (CASCADE delete).
--
-- Note the CHECK on payment_method exists here but NOT on
-- payment_entries.method — the two tables should probably share a
-- domain enum. Cleanup deferred.
CREATE TABLE IF NOT EXISTS payment_installments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_portal_id    UUID NOT NULL
                        REFERENCES client_portals(id) ON DELETE CASCADE,
  installment_number  INTEGER NOT NULL,
  amount              NUMERIC(10, 2) NOT NULL,
  due_date            DATE NOT NULL,
  paid_at             TIMESTAMPTZ,
  paid_amount         NUMERIC(10, 2),
  payment_method      TEXT
                        CHECK (payment_method IN ('cash','venmo','cashapp','zelle','stripe','other')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_installments_portal_idx
  ON payment_installments (client_portal_id);
