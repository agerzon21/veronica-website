-- Sessions booked together as a package, from 2026-10-22.
--
-- Vero offers a discount when a client books several sessions at once (a
-- wedding and its engagement session, most often). Each session keeps its
-- own contract, priced at its share of the package; these two columns keep
-- what the client is shown on "Your sessions": the price each session would
-- have cost on its own, and which sessions were booked together.
--
--   package_id      sessions created together share one id. Null for every
--                   booking made on its own, which is all of them today.
--   regular_amount  the session's price before the package discount, before
--                   tax. contract_total_amount stays the price the contract
--                   states and every balance and report already uses.
--
-- Both nullable with no default: nothing that exists changes.

alter table client_portals add column if not exists package_id uuid;
alter table client_portals add column if not exists regular_amount numeric(10, 2);
create index if not exists client_portals_package on client_portals (package_id) where package_id is not null;
