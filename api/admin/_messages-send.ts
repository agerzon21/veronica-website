/**
 * Admin: send a manual reply from Vero to a specific conversation.
 *
 * POST { password, conversationId, text }
 *   → 200 { success, message: { id, sent_at, external_message_id } }
 *   → 400 missing fields / empty text
 *   → 401 wrong password
 *   → 404 no such conversation
 *   → 502 IG API rejected the send
 *
 * The message is sent via the same IG Graph API helper the AI uses
 * (api/_ig-send.ts), then persisted with sender='human' so future
 * queries can distinguish "Vero herself" replies from AI replies.
 *
 * Instagram's 24-hour rule: we can only send to a user who's messaged
 * us within the last 24h. If they're outside that window, Meta
 * rejects the send with a specific error we surface in the response.
 * (Not enforced in our code — Meta returns 4xx and we relay it.)
 *
 * Sending a manual reply does NOT automatically toggle ai_enabled on
 * this conversation. Vero controls the AI on/off explicitly via the
 * per-convo toggle so the intent is unambiguous.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { sendIgTextMessage } from '../_ig-send.js';

const MAX_MESSAGE_LEN = 1000; // sensible for IG DMs; Meta rejects >1000 anyway

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
  if (text.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({
      success: false,
      error: `Message too long (max ${MAX_MESSAGE_LEN} chars)`,
    });
  }

  try {
    const sql = getDb();

    // Look up the conversation to get the recipient IGSID. We only
    // need this one field, but check existence at the same time.
    const convoRows = (await sql`
      SELECT external_user_id, platform
      FROM conversations
      WHERE id = ${conversationId}
      LIMIT 1
    `) as Array<{ external_user_id: string; platform: string }>;

    if (convoRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const convo = convoRows[0];
    if (convo.platform !== 'instagram') {
      // WhatsApp / SMS / etc. handlers go here in future sessions.
      return res.status(400).json({
        success: false,
        error: `Manual send not implemented for platform '${convo.platform}' yet`,
      });
    }

    // Fire the actual send. sendIgTextMessage swallows errors and
    // returns a structured result; we translate to HTTP status
    // depending on what happened.
    const sendResult = await sendIgTextMessage({
      recipientIgsid: convo.external_user_id,
      text,
    });
    if (!sendResult.ok) {
      // Common failures: outside 24-hour window (Meta returns 400 with
      // a specific error subcode), account restricted, malformed
      // recipient. Surface Meta's raw error to the client so the UI
      // can show something useful.
      return res.status(502).json({
        success: false,
        error: sendResult.error || 'IG send failed',
        statusCode: sendResult.statusCode,
      });
    }

    // Persist the outbound row with sender='human' — this is the
    // key distinction from AI replies (sender='ai'). Later analytics
    // + UI can differentiate ("Vero replied" vs "AI replied") based
    // on this field.
    const inserted = (await sql`
      INSERT INTO messages (
        conversation_id, direction, sender, body,
        external_message_id, sent_at
      )
      VALUES (
        ${conversationId}, 'outbound', 'human', ${text},
        ${sendResult.externalMessageId ?? null}, NOW()
      )
      ON CONFLICT (external_message_id) DO NOTHING
      RETURNING id, sent_at, external_message_id
    `) as Array<{ id: string; sent_at: string; external_message_id: string | null }>;

    return res.status(200).json({
      success: true,
      message: inserted[0] ?? null,
    });
  } catch (err) {
    console.error('[admin/messages-send] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
