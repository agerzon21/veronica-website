# Handoff, 2026-10-01 into 10-02

Replaces the 2026-09-30 handoff, most of which is now done or out of date.
Memory notes under `~/.claude/projects/.../memory/` carry the long-lived rules;
this is the state of the work.

---

## 1. WHAT IS LIVE, AND WHAT SHIPS NEXT

**Live:** `d365cf4`. PA sales tax on new bookings, lead follow-ups, stars and
closed leads in Messages, the assistant saving a draft when none is pending,
and the Instagram copy flow. Migrations 049 and 050 are applied to production
(19 bookings grandfathered as `absorbed`, 3 out-of-state ones `exempt`, new
bookings default to `added`).

**The next batch**, built and tested locally, in the commit after `d365cf4`:

| Change | Where | Database |
|---|---|---|
| Drone licence page, both admin levels | `src/components/AdminDroneLicense.tsx`, `api/admin/_drone-license.ts`, content in `src/data/drone-license-content.ts` | `system_state.drone_license_path` |
| Taxes page, super only: 30 deadlines to Jan 2028 (sales, Scranton, federal, PA), reminder emails, "Doesn't apply to her" per conditional tax, sales tax cards (moved from Integrations), 2026 return guide | `src/components/AdminTax.tsx`, `src/data/tax-calendar.ts`, `src/data/tax-guide.ts`, `api/cron/_tax-reminders.ts` | `system_state.tax_deadlines_done`, `tax_reminders_sent` |
| Licence card fixes: "Last return filed" on the form, an edit keeps it (it used to wipe it, so filed quarters nagged again), an empty number keeps the saved one, a running quarter can't be marked filed | `api/admin/_license-status.ts`, `src/components/AdminTaxCards.tsx` | none |
| Signing race (audit M10) | `_portal-update.ts` guarded transaction, `api/_contract-fingerprint.ts`, `_sign-contract.ts` | none |
| Money history (audit M11) | `api/_money-history.ts`, every money writer, "Show change history" on the client screen | **migration 052** |
| Portal login hardening | constant-work `checkPortalPassword`, `api/portal/_throttle.ts`, paced reset requests | **migration 051** |
| Stripe API version shown in Integrations, pin ready | `STRIPE_API_VERSION` in `api/_stripe.ts`, still `null` | none |
| Lead rules on Scranton's date, not UTC | `api/admin/_messages-list.ts` | none |
| Long-dash sweep | 2,191 lines in 310 files | none |

**Deploy order:** `node scripts/migrate.mjs up --yes` (applies 051 and 052;
both only add tables, and the code treats a missing table as "no limit" and
"no history"), then push. Then pin Stripe: read the version Integrations now
shows, set `STRIPE_API_VERSION` to it, ship that with the next batch.

---

## 2. TAXES

- **Q2 2026** filed and paid 2026-10-01: gross $1,350, taxable $750, tax
  **$45.00**. It was late (due Jul 20); a small penalty and interest notice
  may arrive by mail.
- **Q3 2026** filed and paid 2026-10-01: gross $3,855, taxable $2,755, tax
  $165.30 less the 1% vendor discount, **$163.65** paid.
- **Next sales return: Q4 2026, due 2027-01-20.** The Taxes page lists every
  deadline, and the `tax-reminders` job emails Alex 14 and 3 days before each
  one, and once if one passes, until it is marked done (sales tax: "Mark
  filed" on the licence card). The first email after the deploy will be the
  **Oct 15 local earned income tax estimate** (Berkheimer DQ-1).
- **Production has no licence saved yet** (read 2026-10-01). After the deploy:
  Menu, Taxes, Save licence, with the number (the last 4 digits are enough),
  the issue date, and **Last return filed: 2026-Q3**. Until then the Q3
  return reads as open and its reminder fires on Oct 6.
- **Local taxes nobody has filed yet.** Scranton's earned income tax wants
  quarterly estimates from the self-employed; the Local Services Tax and the
  Payroll Preparation Tax may apply too. All hinge on facts only Vero has:
  does she live inside Scranton city limits, is she married and filing
  jointly, and did she pay anyone $2,000 or more this year by Zelle, cash or
  check. Switch off what doesn't apply on the Taxes page.
- **The ledger is a floor**, not a record of income (memory note "sales tax
  ledger gaps"). Check Vero's own records before any figure is filed.
- The paper licence arrives by mail around Oct 8 to 13. If its issue date
  differs from the one entered, Edit and fix the date; leave the number empty
  and it stays.

---

## 3. VERO

- **Drone licence:** FAA Part 107 test at PSI Scranton (Clarks Summit), $175,
  ideally by Oct 9 and before **Oct 26**, when chart-image questions are added.
  She leaves for the Dominican Republic for November to March. The drone page
  walks every step and keeps her numbers.
- **Insurance:** deliberately deferred to March, per event rather than annual.
  Drone cover needs the Part 107 certificate.

---

## 4. OPEN, AND WAITING ON SOMEONE

- **Knowledge base contradictions** for Vero to settle: `npm run check:kb`.
- **Footer on small phones:** reworked in `d92f4a1` and `14e4253`. Nobody has
  confirmed it on a real small phone since; ask for a screenshot before
  touching it.
- **Gallery-only bookings stay ungated** by Alex's decision (memory note).

---

## 5. TRAPS THAT COST TIME

- **`failProd()` in `scripts/prerender-photos.mjs` only exits on Vercel.** A
  local build prints the warning and exits 0. Read the prerender section of
  the build output itself.
- **Anything in the sitemap must be reachable by walking the prerendered
  HTML.** A React Router link does not count.
- **`check-schedule-sync.mjs` copies a fixed list of files** to load
  `_portal-update.ts` on its own. A new import there breaks the build until it
  is added to the list (sales tax and money history both hit this).
- **Applied migrations are checksummed by the ledger.** Never edit one; add a
  new file.
- **Neon runs on UTC.** `CURRENT_DATE` is tomorrow from 8 PM Eastern. Business
  dates use `(NOW() AT TIME ZONE 'America/New_York')::date`.
- **`.env.local` has `POSTGRES_URL`; `DATABASE_URL` is empty.**
- **No OpenAI key locally.** Script the model instead: the handler tests swap
  the `openai` package for a fake that replays scripted turns.
- **Guard scripts encode past decisions.** When one fails, decide whether the
  decision changed before touching the assertion.

---

## 6. VERIFICATION COMMANDS

```bash
npm run build                                        # every guard, and the prerender
node scripts/migrate.mjs status                      # read only
node scripts/smoke-routes.mjs https://vero.photography
npm run check:kb                                     # needs the database
node scripts/check-api-imports.mjs
```

Each Vercel build counts against storage for about a month, so batch pushes
rather than deploying per commit.
