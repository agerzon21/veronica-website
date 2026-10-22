-- One client account, any number of sessions, from 2026-10-22.
--
-- client_portals_email_unique allowed one booking per email (case-
-- insensitive), so a couple booking a wedding and an engagement, or a client
-- coming back for another shoot, could not have the second booking on the
-- same email. The account is now every full booking that shares an email,
-- with one password across them (api/portal/_account.ts keeps it that way).
--
-- The uniqueness goes; the lookup stays fast with a plain index on the same
-- expression, which every portal sign-in uses.
--
-- Safe on live data: every email is on exactly one booking today, and a
-- non-unique index accepts everything the unique one did.

drop index if exists client_portals_email_unique;
create index if not exists client_portals_email_lookup on client_portals (lower(client_email)) where client_email is not null;
