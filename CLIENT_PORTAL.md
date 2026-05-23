# Client Portal + Newsletter

This doc covers the password-gated client gallery feature (`/portal`) and the
exit-intent newsletter popup. Both use the Postgres database documented in
[DATABASE.md](DATABASE.md).

## Architecture at a glance

```
[Client]
   │
   │ enters password at /portal
   ▼
[/api/clients]  ──── 750ms delay on wrong password
   │  validates password against `client_galleries` table in Neon
   │
   ├── extracts folder_id from stored drive_url
   ▼
[Google Drive API]  ←── auth: service account JSON in env
   │  lists images + videos in the folder
   ▼
[/portal page renders the gallery]
   │  thumbnails via drive.google.com/thumbnail (Drive CDN)
   │  download buttons via drive.google.com/uc?export=download (full quality)
   │  "Download All" button → opens the shared Drive folder
   ▼
[Client downloads photos directly from Drive]
```

```
[Visitor]
   │
   │ exit-intent (mouse leaves top) OR 45s timer + 50% scroll (mobile)
   ▼
[ExitIntentPopup component]
   │  shows once per visitor per 30 days (localStorage)
   │  collects email
   ▼
[/api/subscribe]
   │  inserts into `subscribers` table (unique on email)
   │  generates per-email discount code: VERO-XXXXXXXX
   │  fires welcome email via existing nodemailer/ImprovMX setup
   ▼
[Subscriber gets email with their unique 10% off code]
```

## Setup (one-time)

### Google Cloud project + service account

You only do this once per environment. Walkthrough:

1. **Create project** at https://console.cloud.google.com — name: `vero-photography`
2. **Enable Drive API**: APIs & Services → Library → search "Google Drive
   API" → Enable
3. **Create service account**: APIs & Services → Credentials →
   + Create Credentials → Service account → name `vero-portal-reader`. Skip
   the "grant access" steps.
4. **Generate JSON key**: click the service account → Keys tab → Add Key →
   Create new key → JSON → Create. A file downloads — treat like a password.
5. **Veronika shares her parent client folder** in Drive with the service
   account email (`vero-portal-reader@...iam.gserviceaccount.com`) as
   **Viewer**. The "Google account not found" warning is expected for
   service accounts — share anyway.
6. **Add JSON to Vercel** as env var `GOOGLE_SERVICE_ACCOUNT_JSON`.
   Marked Sensitive. Production + Preview only.

### Database setup

Already covered in [DATABASE.md](DATABASE.md) — `client_galleries`,
`subscribers`, `contact_submissions` tables.

## Adding a new client gallery

Every time Veronika delivers a job:

1. **She** creates a subfolder inside her shared "Vero Photography Website"
   parent folder (e.g. `Smith_Wedding_June2026`) and uploads the photos.
2. **She** texts you the folder URL or ID + a password she'd like the client
   to use.
3. **You** add a row to `client_galleries`. In Neon's SQL Editor:

   ```sql
   insert into client_galleries (label, password, drive_url, client_name)
   values (
     'smith-wedding-jun-2026',
     'SUNFLOWER-7421',
     'https://drive.google.com/drive/folders/1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT',
     'Smith Family'
   );
   ```

   `drive_url` can be the full URL OR just the folder ID — `_drive.ts`
   handles both.

4. Veronika tells the client: "Go to vero.photography/portal, password
   `SUNFLOWER-7421`."

## Password guidelines

- Random + 8+ characters minimum. The 750ms delay on wrong passwords means
  brute-forcing 8-char alphanumerics would take centuries — but only if
  passwords are unguessable. Don't use names or birthdays.
- Easy patterns: a memorable word + 4 digits (`SUNFLOWER-7421`, `BRIDE-9385`).
- Each client gets a unique password. Don't reuse across galleries.
- If a password leaks or gets shared, rotate it: `update client_galleries
  set password = 'NEW-CODE' where label = '...'`.

## Subscribers & the welcome email

- Every signup gets a unique discount code (`VERO-XXXXXXXX`, 8 hex chars).
- One welcome email per email address. Duplicate signups silently return
  success without re-sending (anti-abuse).
- When a client mentions their code at booking, Veronika verifies by
  searching: `select email, discount_code, created_at from subscribers where
  discount_code = 'VERO-XXXXXXXX';`
- The code is one-use by trust — we don't enforce single use. If we ever
  need to, add a `redeemed_at timestamptz` column and check it.

## Newsletter cadence (future)

This site collects subscribers but doesn't actively send newsletters yet —
just the one welcome email. If/when Veronika wants to start sending:

- Build a `/api/admin/broadcast` endpoint that loops `subscribers where
  subscribed = true` and sends via the existing SMTP transport.
- Consider moving to ConvertKit / Beehiiv if the list grows beyond ~200
  subscribers — better deliverability, real unsubscribe handling, analytics.
- Add an `/api/unsubscribe?token=X` endpoint and an unsubscribe link in every
  email (CAN-SPAM requirement). Single-token-per-subscriber, stored in a new
  `unsubscribe_token` column.

## Files in this feature

| Path | Purpose |
|------|---------|
| `api/_db.ts` | Shared Neon connection |
| `api/_drive.ts` | Drive API client + folder listing |
| `api/_welcome-email.ts` | Welcome email template + send function |
| `api/clients.ts` | POST `/api/clients` — password gate |
| `api/subscribe.ts` | POST `/api/subscribe` — email capture |
| `api/contact.ts` | Updated to also log to Neon |
| `src/pages/Portal.tsx` | `/portal` route — password page + gallery wrapper |
| `src/components/ClientGallery.tsx` | Grid + lightbox + downloads |
| `src/components/ExitIntentPopup.tsx` | Exit-intent detection + signup form |

## Testing locally

Before deploy, test with `vercel dev`:

```bash
# Pull env vars from Preview to .env.local
vercel env pull --environment=preview .env.local

# Run the dev server with API routes
vercel dev
```

Hit:
- `http://localhost:3000/portal` — try a wrong password (expect ~750ms delay
  + "didn't match"), then add a test row to `client_galleries` and try the
  real password.
- Visit any page, leave mouse out the top of viewport → popup should appear.
  Sign up with a test email → check the inbox for the welcome email.
- Submit `/contact` form → verify the row lands in `contact_submissions`
  AND the auto-reply still sends.

## Operational tasks (Veronika might ask)

### "Can you change a client's password?"

```sql
update client_galleries
set password = 'NEW-CODE'
where label = 'smith-wedding-jun-2026';
```

### "How do I find a subscriber's discount code?"

```sql
select email, discount_code, created_at
from subscribers
where email = 'jane@example.com';
```

### "Has anyone used my code WELCOME-XYZ?"

We don't track redemption (yet). Veronika verifies manually: client mentions
code at booking, she searches the table to confirm it exists and belongs to
the email she'd expect.

### "I want to remove a client gallery"

```sql
delete from client_galleries where label = 'smith-wedding-jun-2026';
```

The Drive folder is untouched — only the portal access is revoked. To also
revoke Drive access, Veronika removes the service account from that folder's
sharing (or deletes the folder entirely).

## Cost / limits to know

- **Drive API quotas**: 1,000 queries / 100s / user, 10,000 queries / 100s /
  project. We use ~1 query per portal login. We'd need ~5,000 portal logins
  per minute to hit this. Not a concern.
- **Drive image CDN**: free, no quota concerns at our scale.
- **Welcome email sends**: via existing SMTP (ImprovMX). Same deliverability
  as the contact auto-reply.
- **Neon DB**: covered in [DATABASE.md](DATABASE.md). Plenty of headroom.
