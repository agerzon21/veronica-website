-- An optional title for a client's gallery page, from 2026-10-19.
--
-- The gallery opens with "Welcome, {first name}". For a party or event
-- gallery that is shared with the guests ("Megan's 30th Birthday"), that
-- greets one person on a page everybody opens. When this is set, the gallery
-- page shows it instead of the greeting; empty keeps the greeting. It changes
-- nothing else: emails still greet the client by first name, and the full
-- portal's own header still says "Welcome, {names}".
--
-- Nullable with no default, so every existing gallery is unchanged.

alter table client_portals add column if not exists gallery_title text;
