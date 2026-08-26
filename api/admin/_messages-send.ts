/**
 * Admin: send a manual reply from Vero to a specific conversation.
 *
 * Thin HTTP wrapper. All of the actual work — channel dispatch, RFC 5322
 * threading headers, the synthetic-message-id filter, signature append,
 * and the persist-before-send idempotency ordering — lives in
 * api/_reply-delivery.ts, so the in-panel AI assistant's send_reply tool
 * goes through the identical path rather than a parallel implementation
 * that would slowly drift from this one.
 *
 * POST { password, conversationId, text }
 *   → 200 { success, message: { id, sent_at, external_message_id } }
 *   → 400 missing fields / empty text / oversize for the channel
 *   → 401 wrong password
 *   → 404 no such conversation
 *   → 409 an identical message was just sent (retry with allowDuplicate)
 *   → 502 upstream (IG API / Resend) rejected the send
 *
 * The message is persisted with sender='human' regardless of channel so
 * queries and UI can distinguish "Vero herself" replies from AI replies
 * (sender='ai') or echoes.
 *
 * Sending a manual reply does NOT toggle ai_enabled on the conversation.
 * Vero controls that explicitly so the intent is unambiguous.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { deliverReply } from '../_reply-delivery.js';

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

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    return res.status(400).json({ success: false, error: 'text is required' });
  }

  try {
    // allowDuplicate is set by the client only after Vero has confirmed
    // she means to repeat herself, and by the bounce-retry path where the
    // repeat is the entire point.
    const result = await deliverReply(getDb(), conversationId, text, {
      allowDuplicate: req.body?.allowDuplicate === true,
    });
    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.error });
    }
    return res.status(200).json({ success: true, message: result.message ?? null });
  } catch (err) {
    console.error('[admin/messages-send] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
