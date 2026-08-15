# Vero Photography — Active Transitions & Phase Tracker

Ongoing infrastructure + feature work with concrete checklists. Update this file whenever a phase moves, a step is done, or a new dependency is added.

## Website work phases

### Phase 1: Reviews tab + sign-in autofill (IN PROGRESS)
- [x] DB migration 012-reviews.sql applied to prod
- [x] 9 hardcoded testimonials seeded from GoogleReviewsSection.tsx
- [ ] Admin CRUD endpoints (reviews-list, reviews-upsert, reviews-delete)
- [ ] Public /api/reviews read endpoint
- [ ] AdminReviews.tsx admin panel UI
- [ ] Wired into Studio nav group
- [ ] i18n strings for reviews
- [ ] GoogleReviewsSection refactored to read from API
- [ ] Sign-in autofill quick win

### Phase 2: Own contact form (replaces Web3Forms) — planned
- [ ] contact_submissions DB table
- [ ] /api/contact endpoint (validates, stores, sends Resend notification)
- [ ] Admin Leads section (list of form submissions)
- [ ] Update src/pages/Contact.tsx to POST to our endpoint
- [ ] Remove WEB3FORMS_KEY

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

---
Last updated by an agent on 2026-08-14. Kept up to date as work progresses.
