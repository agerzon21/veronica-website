# Quick Tasks

The 5 things you actually do day-to-day. Bookmark this file.

---

## Add a new client gallery (most common — every delivery)

### 1. In Google Drive

- Open the **Vero Photography Website** folder
- Create a new subfolder (e.g. `Smith Wedding June 2026`)
- Upload all the client's photos into it
- Open that subfolder
- **Copy its URL** from the browser address bar — looks like:
  ```
  https://drive.google.com/drive/folders/1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT
  ```

### 2. In Neon

- Go to https://console.neon.tech and open **vero-photography-db**
- Click **SQL Editor** in the left sidebar
- Paste this, replacing the four bracketed values:

```sql
insert into client_galleries (label, password, drive_url, client_name)
values (
  '[short-internal-name]',
  '[PASSWORD-FOR-CLIENT]',
  '[paste Drive folder URL here]',
  '[Client Name shown on the welcome screen]'
);
```

**Concrete example:**

```sql
insert into client_galleries (label, password, drive_url, client_name)
values (
  'smith-wedding-jun-2026',
  'SUNFLOWER-9421',
  'https://drive.google.com/drive/folders/1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT',
  'Smith Wedding'
);
```

- Hit **Run** (or Cmd+Enter)
- Confirm: "Query executed successfully, 1 row affected"

### 3. Send the password to the client

Text/email them:

> Your photos are ready! Go to **vero.photography/portal** and enter password **SUNFLOWER-9421**.

Done.

---

## Change a client's password

If a password leaks or they need a new one:

```sql
update client_galleries
set password = 'NEW-PASSWORD-HERE'
where label = 'smith-wedding-jun-2026';
```

---

## Remove a client gallery

After a client's downloaded everything and you want to revoke access:

```sql
delete from client_galleries where label = 'smith-wedding-jun-2026';
```

The Drive folder is untouched — only the portal access is revoked. Veronika still has the photos in Drive.

---

## Look up a discount code

Someone says "I got 10% off from the website, my code is VERO-XXXXXXXX" and you want to verify it's real + check who they are:

```sql
select email, discount_code, created_at
from subscribers
where discount_code = 'VERO-XXXXXXXX';
```

If it exists, the code is legit. If no rows, they're either lying or typed it wrong.

---

## See recent contact form submissions

```sql
select created_at, name, email, shoot_type, preferred_date, location, message
from contact_submissions
order by created_at desc
limit 20;
```

This is everything submitted via the Contact form — useful for following up on inquiries Veronika might've missed in her email.

---

## Need more detail?

- Full architecture + setup: [CLIENT_PORTAL.md](CLIENT_PORTAL.md)
- Database schema reference: [DATABASE.md](DATABASE.md)
