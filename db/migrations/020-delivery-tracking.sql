-- Lets Vero confirm an email she sent from the panel actually went out.
--
-- ─── The gap ────────────────────────────────────────────────────
--
-- On Instagram she can open the app and see the message sitting in the
-- thread. Email has no equivalent — she clicks Send, the composer
-- clears, and she has to take our word for it.
--
-- Today the only signal is indirect: a send that Resend rejects deletes
-- its own row and surfaces an error, so a message VISIBLE in the thread
-- was at least accepted by Resend. That's real, but it answers the wrong
-- question. "Resend accepted it" is not "the client received it" — the
-- address can bounce, or the mail can be rejected downstream, and today
-- both look identical to a success.
--
-- There is also a false-negative: if the send succeeds but the response
-- never makes it back to her browser (bad wifi, backgrounded phone), the
-- panel shows a failure for a message that actually went. She re-sends,
-- and the client gets it twice.
--
-- ─── What this adds ─────────────────────────────────────────────
--
--   delivery_id     — Resend's own tracking id, returned by their send
--                     API. Distinct from external_message_id, which is
--                     the SMTP Message-ID we generate for RFC 5322
--                     threading. We were throwing this away (only
--                     logging it), which meant there was no way to ask
--                     Resend what happened to a given message.
--   delivery_state  — cached last_event from Resend: 'sent',
--                     'delivered', 'bounced', 'complained', etc. Cached
--                     because polling on every thread render would be a
--                     Resend API call per message, forever, for messages
--                     whose outcome stopped changing days ago.
--
-- Terminal states ('delivered', 'bounced', 'complained') are never
-- re-polled. Everything else is, until it settles.
--
-- NOTE for whoever wires this up: reading delivery status requires a
-- FULL-ACCESS Resend API key. A sending-access key can send but cannot
-- call emails.get, and the lookup will fail closed to 'unknown' — which
-- is handled, but means the feature silently does nothing. See
-- TRANSITIONS.md on the Resend key swap.
--
-- Run once against production Neon. Safe to re-run.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivery_id TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivery_state TEXT;

-- Finding "outbound emails whose delivery outcome isn't settled yet" is
-- the only query this supports, and it's a small slice of the table.
CREATE INDEX IF NOT EXISTS messages_delivery_pending_idx
  ON messages (conversation_id)
  WHERE delivery_id IS NOT NULL
    AND (delivery_state IS NULL
         OR delivery_state NOT IN ('delivered', 'bounced', 'complained'));
