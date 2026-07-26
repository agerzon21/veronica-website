# Meta Business Verification — reference notes

Alex owns this end-to-end (Vero doesn't touch it). This doc is a
compact reference: what we decided, what to submit, gotchas we
anticipated, and what verification unlocks downstream.

## Setup decisions (2026-07-26)

| Field | Value | Notes |
|---|---|---|
| Business type | Sole proprietor | No LLC/DBA registered. Meta accepts individual verification with photo ID + utility bill showing name + address. |
| Legal name | Veronika Gerzon | Whatever the ID says — no marketing name. |
| Facebook Page | ✓ Already exists, linked to vero.art.photo | Required by Meta's plumbing regardless of whether we ever post to it. |
| Business email | `vero@vero.photography` | **Test first** — mailbox must actually *receive* mail (Resend is send-only). If it doesn't, use personal Gmail. |
| Business address | Vero's home address | Must match the utility bill. |
| Business phone | Vero's mobile | Meta calls/SMSes to verify. |
| Website | https://vero.photography | |

## Documents needed

For sole proprietor verification, Meta wants **both**:

- Government photo ID (driver's license or passport) — clear scan/photo
- Utility bill OR bank statement, ≤90 days old, showing name + address that match the ID

**Use a scanner app (iOS Notes has one built in).** Photos with corners cut off / glare / obvious phone-shake get bounced. PDFs from a scanner rarely do.

## Where to submit

1. https://business.facebook.com → Business Settings → **Security Center** → **Business Verification** → Start Verification
2. Fill the form (see the table above for the values)
3. Upload the two documents
4. Complete phone verification (SMS or voice call)
5. Submit

## Timeline

- Typical: 3–7 business days
- Occasionally: 2–3 weeks if Meta requests additional docs
- Rare worst case: up to 6 weeks

Meta emails the decision to the business email above. If declined, they explain why and you can re-submit with corrected docs — usually straightforward.

## What this unlocks

Only once verification is approved:

- **Instagram App Review** can be submitted for our vero-photography-feed app with a screencast of the messaging assistant
- App Review takes another 1–2 weeks of Meta review
- Once approved, the app flips from "development" (testers only) to "Live" and real customer Instagram DMs can flow through the messaging system

Without verification the messaging assistant works only for Instagram accounts we add as "testers" — fine for our own end-to-end testing, but not for real customers.

## Gotchas to avoid

- **Name match matters.** If the utility bill says "V. Gerzon" and the ID says "Veronika Gerzon", Meta may flag it. Use documents where the name is spelled out consistently.
- **Documents must be current.** Anything >90 days old gets bounced.
- **Photos of documents work but scans are stronger.** iOS Notes → camera icon → Scan Documents produces PDF-quality scans Meta rarely rejects.
- **Don't crop.** Meta wants to see the full document, edge to edge, including any borders or letterheads.

## Confirm the email actually receives (before starting)

Quick check that `vero@vero.photography` is a real inbox, not just a Resend send-from alias:

- From Gmail (or any other account), send a plain "hi" to `vero@vero.photography`
- If Vero gets it, use that address on the form
- If she doesn't, use `agerzon21@gmail.com` or her personal Gmail instead — Meta accepts personal addresses, just looks a touch less on-brand to the reviewer

## Ping me when the status changes

Just "Meta approved" or "Meta bounced, said X" — so I can either proceed with App Review or help fix documentation issues.
