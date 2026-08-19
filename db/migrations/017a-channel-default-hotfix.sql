-- HOTFIX for migration 017.
--
-- 017 added messages.channel as NOT NULL with no default. Three INSERT
-- sites that predate it do not supply the column:
--
--   api/inbox/_ig-webhook.ts:500   every inbound Instagram DM + echo
--   api/_ai-reply.ts:508           AI reply persistence
--   api/_ai-reply.ts:591           bridge / escalation messages
--
-- Between applying 017 and deploying the code that sets `channel`
-- explicitly, any of those would raise a NOT NULL violation — meaning
-- inbound Instagram DMs would be received by Meta's webhook and then
-- silently fail to store.
--
-- Apply this IMMEDIATELY after 017 if the fixed code is not yet
-- deployed. It is safe to apply even if the deploy already landed.
--
-- Why 'instagram' is the right default: every writer that omits the
-- column is an Instagram path (the IG webhook, and the AI reply engine,
-- which only sends over Instagram today). Rows written by the new email
-- paths always set it explicitly, so the default is never consulted for
-- them.
--
-- ⚠️  This default is a BRIDGE, not a permanent design. Once the fixed
-- code is deployed and verified, remove it — see 017b below. Leaving it
-- in place means a future channel that forgets to set the column gets
-- silently mislabelled as Instagram instead of failing loudly.

ALTER TABLE messages
  ALTER COLUMN channel SET DEFAULT 'instagram';
