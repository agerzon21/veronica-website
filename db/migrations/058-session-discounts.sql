-- A discount on a single session, from 2026-10-23.
--
-- Packages (057) showed the client what booking together saved them. Vero
-- also gives discounts on one session: the website's 10% offer, a thank-you,
-- an apology. Alex's rule is that a client must SEE every discount, so the
-- session keeps what it is and what it took off.
--
--   regular_amount   (from 057) now means the session's price before ANY
--                    discount, before tax. Package rows already hold exactly
--                    that, because they had no other discount.
--   discount_amount  dollars this session's own discount took off, before any
--                    package discount. Null when there is none.
--   discount_label   what Vero called it ("Website 10% off"). Null shows as
--                    "Discount".
--
-- contract_total_amount stays the price the contract states and every
-- balance uses. A package session's package saving is
-- regular_amount - discount_amount - contract_total_amount.
--
-- Nullable with no default: nothing that exists changes.

alter table client_portals add column if not exists discount_amount numeric(10, 2);
alter table client_portals add column if not exists discount_label text;
