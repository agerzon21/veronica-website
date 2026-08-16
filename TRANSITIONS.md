# Vero Photography — Active Transitions & Phase Tracker

Ongoing infrastructure + feature work with concrete checklists. Update this file whenever a phase moves, a step is done, or a new dependency is added.

## Website work phases

### Phase 1: Reviews tab + sign-in autofill — DONE
- [x] DB migration 012-reviews.sql applied to prod
- [x] 9 hardcoded testimonials seeded from GoogleReviewsSection.tsx
- [x] Admin CRUD endpoints (reviews-list, reviews-upsert, reviews-delete)
- [x] Public /api/reviews read endpoint (with edge cache)
- [x] AdminReviews.tsx admin panel UI (+ Google Aggregate card)
- [x] Wired into Studio nav group
- [x] i18n strings for reviews
- [x] GoogleReviewsSection refactored to read from API (with fallback constants)
- [x] Sign-in autofill quick win (localStorage last-email)

### Phase 2: Own contact form (replaces Web3Forms) — IN PROGRESS, two-step rollout
Original scope note was wrong — `contact_submissions` table and `/api/contact` endpoint already exist in prod. Actual work broken into two PRs:

**PR 1 — dual-run (this commit):**
- [x] 014-contact-submissions.sql — retro-baseline of the existing prod table + `notes`, `contacted_at`, `updated_at`+trigger, indexes
- [x] `sendLeadNotification()` in api/_auto-reply.ts + `replyTo` support in `EmailMessage` interface + forward in `sendEmail`
- [x] api/contact.ts — add `sendLeadNotification` as a third Promise.allSettled (non-fatal, log-only failure)
- [x] api/admin/_leads-list.ts + _leads-update.ts + _leads-delete.ts (list/update = admin, delete = super)
- [x] Register 3 leads-* actions in api/admin.ts dispatcher
- [x] AdminLeads.tsx + i18n (t.leads.* + t.leadsEditor.* + t.nav.leads)
- [x] Wired into Admin.tsx → inbox group alongside Messages + Assistant

**PR 2 — cut Web3Forms cord (after dual-run verification):**
- [ ] Verify Vero receives BOTH Web3Forms email AND the new Resend notification for ~1 week of real submissions
- [ ] src/pages/Contact.tsx — POST directly to /api/contact, drop the Web3Forms fetch + hardcoded WEB3FORMS_KEY + "Cloudflare bot challenge" comment
- [ ] Update DATABASE.md line 58-60 and this file (line 37) to drop Web3Forms references
- [ ] Delete ThankYou.tsx's duplicate /api/contact fetch (now triggered from Contact.tsx directly)

**Migration to apply before deploying PR 1:** paste `db/migrations/014-contact-submissions.sql` into Neon SQL editor. Safe idempotent — `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` + `DROP TRIGGER IF EXISTS` + `SET NOT NULL`. On prod (where the base table already exists) it's effectively an ALTER TABLE + CREATE INDEX + CREATE TRIGGER + status → NOT NULL alignment.

**Known dual-run limitation (self-heals in PR 2):** during PR 1 the DB insert + Vero notification + auto-reply all fire from ThankYou.tsx's useEffect AFTER the client navigates from /contact to /contact/thank-you (Web3Forms POST happens first, from Contact.tsx). If the user closes the tab, backgrounds it on mobile, or has flaky network during that navigation window, the /api/contact fetch can abort — meaning Web3Forms delivered the email to Vero but the contact_submissions row was never created and the Vero notification never fired. Result: Vero's Web3Forms inbox is authoritative during dual-run; the Admin Leads panel is best-effort. Do NOT tell Vero to treat the Leads panel as the source of truth yet — treat it as an audit trail that may under-report. PR 2 fixes this by moving the /api/contact fetch into Contact.tsx's handleSubmit (before navigate), running in parallel with the direct email send.

### Phase 3: Session cookies (auto sign-in) — planned
- [ ] Admin HttpOnly session cookie (JWT signed with env-var secret)
- [ ] /api/admin/session endpoint (validates cookie, returns level)
- [ ] Auto sign-in flow on /admin page load
- [ ] Extend same pattern to client portal auth

### Phase 4: Email inbox (Gmail / Resend Inbound) — planned
- [ ] Upgrade Resend to Pro ($20/mo)
- [ ] Add Resend Inbound MX records for vero.photography at Namecheap
- [ ] /api/inbox/email webhook endpoint (Resend POSTs inbound emails here)
- [ ] Email conversation storage in DB
- [ ] Unified inbox in admin panel (email + IG DMs)
- [ ] Reply flow via Resend (from vero@ with signature auto-appended)
- [ ] Strip web3forms metadata from quoted history

### Phase 5: AI on emails — planned
- [ ] Reuse messages-summary pattern for email threads
- [ ] Higher scrutiny threshold — always draft, never auto-send
- [ ] Spam classification

### Phase 6: Reviews auto-ingest — planned (depends on Phase 4)
- [ ] Detect Yelp + Google review notification emails in inbox
- [ ] Parse review content from email body
- [ ] Auto-create draft entries in Reviews tab for Vero to approve

## Near-term security/quality fixes (parallel to phases above)

- [ ] **Hash client_password with bcrypt** — transitional migration; test on Neon branch first
- [x] **001-baseline.sql** — retroactive DDL for the three god tables
- [ ] **Reconcile contract-body freeze** — frozen at creation, docs said "at signing" (comments wrong); pick a rule, enforce, update docs
- [ ] **Session cookies for client portal** — bundle with Phase 3

## IG webhook follow-ups (identified by 2026-08-16 diagnostic + refactor)

The ack-first + waitUntil refactor (commit forthcoming) closed the
within-invocation double-reply race and moved AI work off Meta's ACK
path. Remaining gaps identified by the adversarial review, ordered by
priority:

- [ ] **Cross-invocation race — sentinel INSERT with UNIQUE constraint**. When Meta sends two POSTs milliseconds apart (routine, not just retries), each lands on its own Vercel lambda. Both run dedup + rate-limit SELECTs concurrently before either persists an outbound — both pass, both send, customer gets two AI replies. The within-invocation fix (single waitUntil + sequential for-await) doesn't help here since the two lambdas share no state. Fix: add a `messages.in_reply_to_message_id` column with UNIQUE constraint (migration 015), have `processInboundMessage` INSERT a "pending" outbound row keyed on the inbound mid at the very start of the pipeline — losing the race → ON CONFLICT → skip. Only the winner proceeds to OpenAI/send/finalize. Adds one DB roundtrip per reply and requires the messages queries elsewhere in the app to tolerate a brief `body=NULL, status='pending'` state (or use `direction='outbound_pending'` and filter in list queries). Real work but the cleanest concurrency primitive available on neon-serverless HTTP (advisory locks require a persistent session which the HTTP driver doesn't have).
- [ ] **Surface AI failures in the admin panel**. Today when the AI silently fails (generation error, IG send error, spam-filter skip, rate-limit skip), it's logged but not visible to Vero — she can't distinguish "AI decided not to reply" from "AI tried and errored." Add `conversations.ai_last_error` (text) + `ai_last_error_at` (timestamptz) columns, populate from processInboundMessage's error branches, render as a small red banner on the conversation card in AdminMessages. Migration 016.
- [ ] **Fold echo-webhook self-healing into the ack path**. If the primary send-and-INSERT flow ever fails at the INSERT step (e.g. Vercel kills mid-flight past maxDuration), Meta will echo the message back via `is_echo=true` on the webhook, and our persist loop stores it correctly. But there's a window between "customer received reply" and "admin thread shows the reply" where Vero could reply manually → double-send. Consider persisting a `sending` sentinel BEFORE calling sendIgTextMessage, then UPDATE-to-`sent` after — the admin panel would render `sending` as a spinner so Vero waits.

## Infrastructure transitions

### ImprovMX → Resend Inbound (Path A, planned for Phase 4)
- [ ] Upgrade Resend to Pro ($20/mo)
- [ ] Add vero.photography's Resend Inbound MX records at Namecheap
- [ ] Verify Resend receives a test email
- [ ] Add gerz.dev to Resend, verify DKIM/SPF
- [ ] Add spysocial.app to Resend, verify DKIM/SPF
- [ ] Migrate any current ImprovMX-only alias
- [ ] Run both in parallel 48h to verify
- [ ] Cancel ImprovMX subscription ($9/mo saved)

## Completed auxiliary steps

- [x] vero@vero.photography registered as Google account (Aug 2026)
- [x] vero@ added as GBP Manager
- [x] Customer review notifications toggled ON in GBP
- [x] neondb_owner password rotated after chat leak
- [x] Vercel redeployed with new Neon password
- [x] .env.local POSTGRES_URL updated

## Pending human tasks

- [ ] Add passkey/authenticator app to vero@vero.photography Google account (Google pushing away from SMS-only auth in 2026)
- [ ] Upgrade Resend to Pro ($20/mo) — needed before Phase 4
- [ ] Decide which other domains to add to Resend (gerz.dev? spysocial.app?)

## Decisions logged

- **Google Places API for the "5.0 · 15 reviews" badge → SKIPPED for now.** Verified free tier works (Enterprise SKU, 1K/mo free, ~30 calls/mo for daily poll), but requires Google Cloud project + billing card + per-SKU quota policing + separate Place ID lookup + env var wiring. Cost/benefit doesn't pencil for two numbers that change ~monthly. Manual editor in the Reviews admin tab instead. Reconsider if either (a) reviews change often enough that manual becomes annoying, or (b) we build Google Cloud setup for something else anyway (Business Profile API for auto-review-ingest, calendar API for something, etc.) and Places is basically free-additional.

---
Last updated by an agent on 2026-08-14. Kept up to date as work progresses.
