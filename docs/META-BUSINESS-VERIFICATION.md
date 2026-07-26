# Meta Business Verification — a walkthrough for Vero

This document exists so Vero can start the Meta Business Verification
process in parallel while Alex builds the new messaging assistant
feature. **Verification is the long pole** — it can take 2–6 weeks for
Meta to review — so it needs to start ASAP, independent of any code
work.

Once verified, our custom Instagram integration can be submitted for
"App Review" which unlocks the ability to receive + reply to DMs
automatically (currently the app is limited to testers only). That's
the whole point of the messaging assistant we're building.

## What Vero needs to do

### 1. Sign in to Meta Business Suite

Go to **https://business.facebook.com** and sign in with the Facebook
account that manages the vero.art.photo Instagram (the same account
Alex logs in with to generate Instagram tokens).

### 2. Find or create the Business Portfolio

Sidebar → **Settings** (gear icon at the bottom-left) → **Business
Settings**.

- If a business portfolio already exists (probably called something
  like "Vero Photography"), open that.
- If not, create one: click **Create a business**, name it "Vero
  Photography", add Vero's email as the primary contact.

### 3. Start Business Verification

Inside Business Settings:

**Security Center** → **Business Verification** → **Start
Verification**.

Meta will ask for:

1. **Legal business name** — this must EXACTLY match the name on the
   documents in step 2. If Vero has a registered LLC/DBA, use that
   name. If she operates as a sole proprietor, use her legal name
   (e.g., "Veronika Gerzon Photography").
2. **Business address** — the address on the tax documents / business
   registration.
3. **Business phone number** — Meta will call or text this to verify.
   Use one Vero can answer.
4. **Business website** — https://vero.photography
5. **Business email** — an email address at the vero.photography
   domain if available (e.g., vero@vero.photography), OR a personal
   email that Vero regularly checks.

### 4. Upload verification documents

Meta accepts one or more of these to prove the business exists. The
easier route is usually **utility bill + business license**, but any
combo below works:

**Option A — Registered business (LLC, corporation, DBA):**
- Business registration certificate (from state or county)
- Recent utility bill or bank statement showing the business address
  (must be within the last 90 days)

**Option B — Sole proprietor / individual:**
- Government-issued photo ID (driver's license, passport)
- Utility bill or bank statement showing name + address (within 90
  days)
- Any professional license or certification if she has one

Upload as PDF or clear photos. Meta rejects blurry / cropped
documents, so use a scanner app (iOS Notes has a built-in scanner:
open a new note → tap the camera icon → Scan Documents).

### 5. Verify the phone number

Meta will call or text the number from step 3. Enter the code.

### 6. Submit + wait

After submission, Meta shows a **"Verification in progress"** status.
Timeline:

- Typical: 3–7 business days
- Occasionally: 2–3 weeks if they request additional documentation
- Rare / worst case: up to 6 weeks

**Meta will email Vero directly** when the decision comes in. If
approved, the Business Portfolio gets a green "Verified" badge and we
can move forward with App Review. If declined, Meta explains why and
Vero can re-submit with corrected documents — usually addressing the
issue is straightforward.

### 7. Notify Alex when the status changes

Just a text is fine — "Meta approved" or "Meta rejected, said X" —
so he can either proceed with App Review or help fix the
documentation issue.

## What this unlocks

Once Business Verification is approved, Alex can submit our Instagram
app for **App Review** with a screencast demonstrating the messaging
assistant. That takes another 1–2 weeks of Meta review, but at the end
of it the app is "Live" and customers' Instagram DMs can flow through
our system in real time (currently, only testers can interact with
the app).

## Common gotchas

- **Match names exactly.** If the business is registered as "Vero
  Photography LLC" but Vero writes "Vero Photography" in the form,
  Meta may reject. Copy the name character-for-character from the
  registration document.
- **Documents must be current.** "Utility bill from 6 months ago" will
  usually be rejected. Grab a fresh one before starting.
- **Facebook Page must exist and be linked.** The Instagram account
  vero.art.photo needs a corresponding Facebook Page connected to the
  same business. If there isn't one, create a basic Facebook Page for
  "Vero Photography" and link it via Instagram's settings → Account →
  Business tools → Facebook Page.
- **Photos of documents work but scans are better.** iOS Notes' Scan
  Documents feature produces PDF-quality scans that Meta rarely
  rejects.

## Answers to the "before we start" checklist (2026-07-26)

- **Registered business name?** No — she's operating as a sole
  proprietor. Meta accepts individual/sole-proprietor verification
  with a government photo ID + a utility bill (both showing name
  + address). Use her legal name ("Veronika Gerzon") on the form.
  → Register as an LLC is a separate decision (real value for
  liability + taxes) but NOT required for Meta.

- **Facebook Page linked?** Yes, already exists. ✓ Nothing to do.

- **Email?** `vero@vero.photography` if that mailbox actually
  receives email — Meta will send a verification email there. **Test
  first**: from any other account, send a plain "hi" to
  vero@vero.photography and confirm Vero gets it. If she doesn't,
  use her personal Gmail — Meta accepts personal emails, it just
  looks a hair less business-like to the reviewer.

Once the email is confirmed working, Vero can start at Step 1 above
and complete the submission in one sitting (~30 min of active work +
wait time for Meta).
