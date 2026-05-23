# Database (Vercel Postgres / Neon)

Backend storage for client galleries, newsletter subscribers, and a log of every
contact-form submission. Postgres via Neon, integrated through Vercel's
Marketplace. All access is server-side only (Vercel API routes) — never from
the browser.

## Why this and not Supabase / KV

- Real SQL — easy to filter, list, search from the dashboard
- Neon's SQL editor lets a non-dev poke at the data ("show me this month's
  inquiries" is one query)
- No "project paused after 7 days" issue that Supabase free tier has
- Same vendor as the rest of the deploy — one less account to manage

## Setup (one-time — already done? skip to Schema)

1. Vercel dashboard → this project → **Storage** tab → **Create Database**.
2. Pick **Neon** (Postgres). Free plan covers our scale by a wide margin.
3. Name: `vero-photography-db`. Region: closest to you (most likely
   `us-east-1`). Save.
4. Vercel auto-injects these env vars into the project — no manual config:
   - `POSTGRES_URL` — pooled connection (use this in serverless functions)
   - `POSTGRES_URL_NON_POOLING` — direct connection (avoid in serverless;
     use only for migrations / one-off scripts)
   - `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`,
     `POSTGRES_DATABASE` — broken-out variants
   - `DATABASE_URL` — alias of `POSTGRES_URL`
5. From the Storage tab, click the new DB → **Open in Neon** to reach the SQL
   editor + table browser. Bookmark this URL for ongoing use.

## Schema

Paste this into Neon's SQL Editor once, then **Run**:

```sql
-- Galleries: password-gated Drive links Veronika delivers to clients.
create table client_galleries (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,                  -- "smith-wedding-jun24" — Veronika's reference
  password      text not null unique,           -- what the client types
  drive_url     text not null,                  -- Google Drive folder URL
  client_name   text,                           -- "Smith Family" — shown briefly on redirect
  created_at    timestamptz not null default now()
);
create index client_galleries_password_idx on client_galleries(password);

-- Subscribers: emails captured by the exit-intent popup.
create table subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  source          text not null default 'exit_intent_popup',
  discount_code   text,
  subscribed      boolean not null default true,  -- future: unsubscribe flips to false
  created_at      timestamptz not null default now()
);

-- Contact submissions: every form submission logged for Veronika's records.
-- Mirrors what already gets emailed via Web3Forms; the table gives us
-- searchable history + a foundation for future CRM/calendar work.
create table contact_submissions (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  email           text not null,
  shoot_type      text,
  preferred_date  text,
  location        text,
  message         text,
  status          text default 'new',           -- new | replied | booked | ghosted (future)
  created_at      timestamptz not null default now()
);
```

## Common tasks

### Add a new client gallery (most common — every job Veronika delivers)

Veronika texts you the password + Drive link. You run this in Neon's SQL
Editor:

```sql
insert into client_galleries (label, password, drive_url, client_name)
values (
  'smith-wedding-jun24',                              -- internal label
  'SUNFLOWER-2024',                                   -- this is what the client types
  'https://drive.google.com/drive/folders/abc123',    -- Drive link (set to "anyone with link can view")
  'Smith Family'                                      -- name shown briefly on redirect; optional
);
```

Or use Neon's **Tables** view → click `client_galleries` → "Insert row"
(point-and-click).

Veronika then tells the client: "Go to vero.photography/clients, password
SUNFLOWER-2024."

### View subscribers (when ready to send a newsletter)

```sql
select email, discount_code, created_at
from subscribers
where subscribed = true
order by created_at desc;
```

### Browse contact submissions

```sql
select created_at, name, email, shoot_type, preferred_date, location
from contact_submissions
order by created_at desc
limit 50;
```

### Mark a submission as replied / booked / ghosted

```sql
update contact_submissions
set status = 'replied'
where id = '<uuid from a previous query>';
```

### Export to CSV

Neon's table view has an Export button per table. Useful for accounting or
giving Veronika a quarterly summary.

### Add a new column later

Example — add a `notes` column to `contact_submissions`:

```sql
alter table contact_submissions add column notes text;
```

Adjust the API route's insert payload to match. No migration framework yet —
just keep schema changes in this doc as we make them.

## Security model

- DB connection string lives in Vercel env vars. Never imported into
  client-side code. All queries happen in `/api/*` serverless functions.
- `client_galleries.password` is plaintext. That's intentional and fine for
  this threat model — the password only protects a Drive URL that is itself
  "anyone with link can view," and clients are explicitly allowed to re-share.
- Rate-limit the subscribe + client-gallery endpoints (e.g. 5 attempts /
  minute / IP) to prevent brute-force or signup spam. Implementation in the
  endpoints themselves, not the DB.

## Cost

Neon free tier:
- 3 GB storage (we'll use < 10 MB)
- 100 compute hours/month (we'll use minutes)
- 7-day point-in-time restore
- 1 project

Comfortably within free for ~10x our current scale. Paid tier ($19/mo) is
only worth it if we start storing serious data volume or hitting heavy read
traffic — neither applies to this site.

## Troubleshooting

**"connection refused" / timeouts from the app**
- Check Neon dashboard — is the DB provisioned + active?
- Verify `POSTGRES_URL` is set in Vercel → Project → Settings → Environment
  Variables (it should auto-inject; if missing, re-link the storage in the
  Storage tab).

**"relation does not exist"**
- Schema wasn't applied. Re-run the SQL in the Schema section above.

**"too many connections"**
- Use `POSTGRES_URL` (pooled), not `POSTGRES_URL_NON_POOLING`, in serverless
  functions. Serverless cold-starts create many connections; pooling keeps
  this under control.

**"permission denied for table X"**
- The default Neon role has full DDL/DML on tables in the public schema.
  If you ever introduce restricted roles, this needs revisiting.

## Future doors this opens (just noting, not building)

- **Admin UI** — a `/admin` page (password-protected) for Veronika to add
  galleries / view subscribers / search submissions without touching Neon
  directly. ~2 hours of work, worth doing only once she's doing this often.
- **Calendar sync** — if a `contact_submissions.preferred_date` is set, push
  a tentative event to Veronika's Google Calendar via the Calendar API.
- **Backups** — Neon free includes 7-day point-in-time restore. For longer
  retention, schedule a monthly CSV export.
- **Migration framework** — when ALTER TABLE happens often, adopt something
  like Drizzle or Kysely. Not needed at our pace.
