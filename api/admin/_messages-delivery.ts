/**
 * Admin: "did that email actually arrive?"
 *
 * POST { password, conversationId }
 *   → 200 { success, states: { [messageId]: state } }
 *   → 400 missing conversationId
 *   → 401 wrong password
 *
 * Instagram gives Vero this for free — she opens the app and the message
 * is either in the thread or it isn't. Email gives her nothing: the
 * composer clears and she has to trust us.
 *
 * A message being VISIBLE in the thread already means Resend accepted it
 * (a rejected send deletes its own row). But accepted is not delivered —
 * the address can be wrong, the mailbox full, the domain can reject us.
 * Those all look identical to success without this.
 *
 * Only polls messages whose outcome isn't settled. 'delivered',
 * 'bounced' and 'complained' are terminal and cached forever; anything
 * else gets re-checked when Vero next opens the thread. Without that
 * this would be one Resend API call per message per render, permanently,
 * for outcomes that stopped changing days ago.
 *
 * Fails soft, deliberately. If the lookup breaks — most likely because
 * RESEND_API_KEY is sending-access rather than full-access, which can
 * send but cannot call emails.get — we return whatever we last knew
 * rather than an error. A missing delivery badge is a small loss; a
 * thread that won't load because a status lookup failed is a large one.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { getDeliveryStatus, getResendMessageId } from '../_auto-reply.js';

/** Outcomes that can't change, so they're never re-polled. */
const TERMINAL_STATES = ['delivered', 'bounced', 'complained'];

/** Bound the work per request — a long thread shouldn't fan out forever. */
const MAX_LOOKUPS_PER_REQUEST = 10;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const conversationId =
    typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
  if (!conversationId) {
    return res.status(400).json({ success: false, error: 'conversationId is required' });
  }

  try {
    const sql = getDb();

    const rows = (await sql`
      SELECT id, delivery_id, delivery_state, external_message_id
      FROM messages
      WHERE conversation_id = ${conversationId}
        AND delivery_id IS NOT NULL
      ORDER BY sent_at DESC
    `) as Array<{
      id: string;
      delivery_id: string;
      delivery_state: string | null;
      external_message_id: string | null;
    }>;

    // Backfill any Message-ID that wasn't populated yet at send time.
    //
    // Resend assigns the real SMTP Message-ID and doesn't document how
    // soon it appears on the retrieve endpoint, so a send can legitimately
    // finish before it exists. A row left holding a 'pending:' placeholder
    // can't be referenced by the next reply and can't be matched against
    // the customer's In-Reply-To — i.e. the thread silently breaks. This
    // poller already talks to Resend per message, so it repairs them.
    for (const r of rows) {
      if (!r.external_message_id?.startsWith('pending:')) continue;
      try {
        const real = await getResendMessageId(r.delivery_id);
        if (!real) continue;
        await sql`
          UPDATE messages SET external_message_id = ${real} WHERE id = ${r.id}
        `;
        console.log(`[admin/messages-delivery] backfilled message-id for ${r.id}`);
      } catch {
        // Try again next poll; a placeholder is not worth failing over.
      }
    }

    const states: Record<string, string> = {};
    const pending: typeof rows = [];
    for (const r of rows) {
      if (r.delivery_state) states[r.id] = r.delivery_state;
      if (!r.delivery_state || !TERMINAL_STATES.includes(r.delivery_state)) {
        pending.push(r);
      }
    }

    // Newest first — if we hit the cap, the message she just sent is the
    // one she's actually looking at.
    for (const r of pending.slice(0, MAX_LOOKUPS_PER_REQUEST)) {
      try {
        const state = await getDeliveryStatus(r.delivery_id);
        if (!state || state === r.delivery_state) continue;
        states[r.id] = state;
        await sql`
          UPDATE messages SET delivery_state = ${state} WHERE id = ${r.id}
        `;
      } catch (err) {
        // Most likely a sending-access API key. Keep the cached value and
        // move on; do not fail the request over a status badge.
        console.warn(
          `[admin/messages-delivery] lookup failed for ${r.delivery_id}: ${(err as Error).message}`,
        );
      }
    }

    return res.status(200).json({ success: true, states });
  } catch (err) {
    console.error('[admin/messages-delivery] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
