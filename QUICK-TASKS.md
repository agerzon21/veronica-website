# Quick Tasks

**Ask the Assistant tab in the admin panel.** It knows how the panel works and
answers in Russian or English: *"I finished a gallery, how do I give the client
access?"*, *"how do I add a photo to the site?"*, *"a client can't log in."*

That knowledge lives in the database (`ai_context`, `source='system'`), seeded
from `scripts/data/system-knowledge.json`. Re-seed after changing the panel:

```bash
node --env-file=.env.local scripts/seed-system-knowledge.mjs
```

---

## Why this file no longer contains the instructions

It used to walk through creating a client gallery by pasting `INSERT`
statements into the Neon SQL editor. Every part of that is now wrong:

- The `client_galleries` table **no longer exists**. Galleries live in
  `client_portals`.
- The real flow is **Clients → + New → Gallery Only** (or **Full Portal** for
  contract bookings). No SQL.
- It told Vero to send clients to `/portal` with only a password — but
  `/portal` needs an email *and* a password. Gallery-only clients use
  `/portal/pass`, and the admin panel generates that link for her.
- Rotating a password was an `UPDATE`; it's now an inline field on the client's
  record. Removing access was a `DELETE`; it's now a toggle.

An audit of the codebase found **42** statements across the docs contradicted by
the code. Instructions that drift are worse than no instructions — Vero follows
them, they fail, and she stops trusting the docs *and* the panel.

Hence the change of approach: the how-to knowledge now lives next to the code
it describes, is verified against it, and is re-seeded when the panel changes.
A markdown file nobody re-reads after shipping a feature will always rot.

**Developer-facing docs are still files** and still accurate — see
[DATABASE.md](DATABASE.md), [CLIENT_PORTAL.md](CLIENT_PORTAL.md),
[CLAUDE.md](CLAUDE.md), and [TRANSITIONS.md](TRANSITIONS.md).
