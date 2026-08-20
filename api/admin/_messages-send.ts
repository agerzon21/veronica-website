/**
 * Admin: send a manual reply from Vero to a specific conversation.
 *
 * Handles both Instagram DM and email conversations. The two paths
 * share the same request shape (POST { password, conversationId,
 * text }) but dispatch to different senders based on the target
 * conversation's `platform` column.
 *
 * POST { password, conversationId, text }
 *   → 200 { success, message: { id, sent_at, external_message_id } }
 *   → 400 missing fields / empty text / oversize (IG-only cap)
 *   → 401 wrong password
 *   → 404 no such conversation
 *   → 502 upstream (IG API / Resend) rejected the send
 *
 * The message is persisted with sender='human' regardless of
 * platform so future queries + UI can distinguish "Vero herself"
 * replies from AI replies (sender='ai') or echoes (sender='human'
 * from an IG-app-sent message that came back via webhook echo).
 *
 * Platform-specific behaviors:
 *   Instagram:
 *     - Uses api/_ig-send.ts. IG's 24-hour rule (only reply to
 *       users who messaged us in the last 24h) is enforced by
 *       Meta, not us — we relay their 4xx if it fires.
 *     - Body cap: 1000 chars (Meta rejects longer).
 *   Email:
 *     - Uses api/_email-send.ts. Generates a SMTP Message-ID, sets
 *       In-Reply-To + References headers derived from the
 *       conversation's message history so mail-client threading
 *       works. From and Reply-To are both vero@vero.photography —
 *       ImprovMX fans mail for that address out to Veronika's Gmail
 *       AND to our inbound webhook, so replies loop back into the
 *       thread with no subdomain and no extra DNS. Subject is derived
 *       from the newest EMAIL-channel message in the thread.
 *     - Vero's signature (system_state, editable in the admin panel)
 *       is appended, and the signed text is what gets persisted.
 *     - No hard length cap; email supports long bodies.
 *
 * Sending a manual reply does NOT automatically toggle ai_enabled on
 * this conversation. Vero controls the AI on/off explicitly via the
 * per-convo toggle so the intent is unambiguous. (For email
 * conversations, ai_enabled has no wired path today — the AI reply
 * pipeline is IG-only for now.)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { sendIgTextMessage } from '../_ig-send.js';
import { sendEmailReply, deriveReplySubject } from '../_email-send.js';
import { loadSignature, appendSignatureText, buildReplyHtml } from '../_email-signature.js';

const MAX_IG_MESSAGE_LEN = 1000; // sensible for IG DMs; Meta rejects >1000 anyway
const MAX_EMAIL_MESSAGE_LEN = 100_000; // 100KB body cap — huge but sane bound

// Configuration for outbound email. All controllable via env so this
// works for other tenants later without code changes.
const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'vero@vero.photography';
const EMAIL_FROM_DISPLAY = process.env.EMAIL_FROM_DISPLAY || 'Vero Photography';
// Where customer replies land. This is deliberately the SAME address we
// send from: mail to vero@vero.photography hits ImprovMX, which fans it
// out to both Veronika's Gmail and our inbound webhook (see
// _email-webhook.ts). No subdomain, no extra DNS, and the customer sees
// one consistent address on every message.
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || EMAIL_FROM_ADDRESS;

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
    const sql = getDb();

    // Look up the conversation. Need external_user_id (recipient) and
    // platform (dispatch key).
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

    // Length cap depends on platform — IG has a Meta-enforced 1000
    // char limit; email supports long bodies. Check after we know
    // the platform.
    const maxLen = convo.platform === 'email' ? MAX_EMAIL_MESSAGE_LEN : MAX_IG_MESSAGE_LEN;
    if (text.length > maxLen) {
      return res.status(400).json({
        success: false,
        error: `Message too long (max ${maxLen} chars for ${convo.platform})`,
      });
    }

    // ── Dispatch by platform ────────────────────────────────────
    if (convo.platform === 'instagram') {
      return await sendInstagram(res, sql, conversationId, convo.external_user_id, text);
    }

    if (convo.platform === 'email') {
      return await sendEmail(res, sql, conversationId, convo.external_user_id, text);
    }

    // WhatsApp / SMS / etc. handlers go here later.
    return res.status(400).json({
      success: false,
      error: `Manual send not implemented for platform '${convo.platform}' yet`,
    });
  } catch (err) {
    console.error('[admin/messages-send] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * Instagram send path. Unchanged from the original single-platform
 * implementation — just extracted into a helper so the top-level
 * handler stays clean.
 */
async function sendInstagram(
  res: VercelResponse,
  sql: ReturnType<typeof getDb>,
  conversationId: string,
  recipientIgsid: string,
  text: string,
) {
  const sendResult = await sendIgTextMessage({ recipientIgsid, text });
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

  const inserted = (await sql`
    INSERT INTO messages (
      conversation_id, direction, sender, channel, body,
      external_message_id, sent_at
    )
    VALUES (
      ${conversationId}, 'outbound', 'human', 'instagram', ${text},
      ${sendResult.externalMessageId ?? null}, NOW()
    )
    ON CONFLICT (external_message_id) DO NOTHING
    RETURNING id, sent_at, external_message_id
  `) as Array<{ id: string; sent_at: string; external_message_id: string | null }>;

  return res.status(200).json({ success: true, message: inserted[0] ?? null });
}

/**
 * Email send path. Derives the subject line and In-Reply-To /
 * References threading headers from the conversation's existing
 * message history so mail clients render the outbound as part of
 * the ongoing thread instead of a stray "new" email.
 *
 * Subject rule: reuse the most recent message's subject verbatim
 * if it already starts with "Re:", else prefix "Re: ".
 *
 * In-Reply-To: the most recent message's external_message_id
 * (regardless of direction — we're replying to whatever came last).
 *
 * References: full chain of external_message_ids from oldest to
 * newest, so mail clients (Gmail, Apple Mail, Outlook) reconstruct
 * the full thread even for participants who join mid-way.
 */
async function sendEmail(
  res: VercelResponse,
  sql: ReturnType<typeof getDb>,
  conversationId: string,
  recipientEmail: string,
  text: string,
) {
  // Pull the conversation's history for RFC 5322 threading, oldest
  // first so References is built in the correct order.
  //
  // CRITICAL FILTER: only REAL SMTP Message-IDs may enter References or
  // In-Reply-To. Not every row in `messages` has one — we mint synthetic
  // external_message_ids for things that never traversed SMTP, using a
  // `<scheme>:` prefix:
  //
  //   form:<submission uuid>    contact-form submission
  //   autoreply:<resend id>     the templated auto-reply (Resend's own
  //                             tracking id, NOT the SMTP Message-ID)
  //   improvmx:… / resend:…     webhook fallbacks when the provider
  //                             gave us no Message-ID header
  //
  // Emitting `References: <form:9a3f-…>` would put a malformed msg-id on
  // the wire; strict receivers may reject it, and lenient ones will fail
  // to thread. Real Message-IDs always contain '@' and never carry one
  // of our scheme prefixes.
  const historyRows = (await sql`
    SELECT subject, external_message_id, channel
    FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY sent_at ASC
  `) as Array<{
    subject: string | null;
    external_message_id: string | null;
    channel: string;
  }>;

  const references = historyRows
    .map((m) => m.external_message_id)
    .filter((id): id is string => isRealMessageId(id));
  const inReplyTo = references.length > 0 ? references[references.length - 1] : null;

  // Subject: prefer the newest subject that actually went over email.
  // A form submission's subject is internal phrasing ("Contact form
  // inquiry — Portrait Session"); replying "Re: Contact form inquiry"
  // to a client reads like leaked back-office jargon. The auto-reply
  // normally supplies a client-facing subject; the generic fallback
  // covers threads imported by migration 017, which have no auto-reply
  // row.
  const parentSubject =
    [...historyRows]
      .reverse()
      .find((m) => m.channel === 'email' && m.subject?.trim())?.subject ?? null;
  const subject = parentSubject ? deriveReplySubject(parentSubject) : 'Re: Your inquiry';

  // Idempotency: pre-generate the Message-ID and INSERT the outbound
  // row BEFORE calling Resend. Then hand the pre-generated ID to
  // sendEmailReply so it uses that instead of generating its own.
  //
  // Why: if we sent first + persisted second, a Neon connection blip
  // between the send and the INSERT would leave the customer having
  // received the email while our DB has no record. Vero would see
  // "send failed" in the UI, re-click, sendEmailReply would generate
  // a FRESH Message-ID, Resend would deliver a SECOND copy. Double-
  // send with no admin-side visibility.
  //
  // With this ordering:
  //   1. Pre-generate Message-ID (crypto.randomUUID inside the helper)
  //   2. INSERT pending row (external_message_id = messageId,
  //      status implicit via the presence of a real sent_at NULL
  //      later? no — we use a simpler pattern: insert body-first,
  //      then send; if send fails after INSERT, we DELETE the row so
  //      it doesn't linger as a ghost "sent" message the customer
  //      never got).
  //   3. sendEmailReply with the pre-generated messageId
  //   4. On success: leave the row in place, return it
  //   5. On failure: DELETE the row, return 502
  //
  // Retry safety: if the request re-fires with the exact same
  // conversation_id + text within a short window, the client
  // shouldn't be retrying — they should be composing a new message.
  // Vero manually re-clicking Send after a failure is intentional
  // and gets a fresh Message-ID + fresh row. That's correct: the
  // failure MEANS the previous send didn't reach the customer, so
  // a retry SHOULD send.
  //
  // The one remaining hazard: if the pre-INSERT succeeds but then
  // the process crashes before we call Resend, we have an orphan
  // row (external_message_id present, but no actual email sent).
  // The customer will never trigger an in_reply_to match against
  // it, so it's dead weight but doesn't cause a wrong reply. Vero
  // sees a "sent" message that never actually went out. Acceptable
  // for MVP; a background sweep of orphans could clean up later.

  // Pre-generate the ID. Import randomUUID directly to avoid coupling
  // the caller to _email-send.ts internals.
  const { randomUUID } = await import('node:crypto');
  const fromDomain = EMAIL_FROM_ADDRESS.split('@')[1] || 'localhost';
  const preMessageId = `${randomUUID()}@${fromDomain}`;

  // Append Vero's signature (editable from the Messages tab, stored in
  // system_state). We persist the SIGNED text, not the raw composer
  // input, so the thread is a faithful record of what the client
  // actually received.
  const signature = await loadSignature();
  const signedText = appendSignatureText(text, signature.text);
  const html = buildReplyHtml(text, signature.html);

  // Insert the outbound row FIRST. On UNIQUE conflict (near-impossible
  // with a fresh UUID but defensive) we know something's already
  // reserved this ID — bail without sending.
  const inserted = (await sql`
    INSERT INTO messages (
      conversation_id, direction, sender, channel, body,
      external_message_id, from_address, sent_at, subject, in_reply_to
    )
    VALUES (
      ${conversationId}, 'outbound', 'human', 'email', ${signedText},
      ${preMessageId}, ${EMAIL_FROM_ADDRESS}, NOW(), ${subject}, ${inReplyTo}
    )
    ON CONFLICT (external_message_id) DO NOTHING
    RETURNING id, sent_at, external_message_id
  `) as Array<{ id: string; sent_at: string; external_message_id: string | null }>;

  if (inserted.length === 0) {
    // UUID collision — astronomically unlikely but handle cleanly.
    console.error(
      `[admin/messages-send] UUID collision on pre-INSERT for convo=${conversationId}`,
    );
    return res.status(500).json({
      success: false,
      error: 'Message ID collision — please retry',
    });
  }

  // Now send. Pass the pre-generated ID so the outbound Message-ID
  // header matches what's stored in the DB, guaranteeing that the
  // customer's future In-Reply-To will hit this row.
  const sendResult = await sendEmailReply({
    to: recipientEmail,
    from: EMAIL_FROM_ADDRESS,
    fromDisplayName: EMAIL_FROM_DISPLAY,
    replyTo: EMAIL_REPLY_TO,
    subject,
    body: signedText,
    html,
    inReplyTo,
    references,
    messageId: preMessageId,
  });

  if (!sendResult.ok) {
    console.error(
      `[admin/messages-send] email send failed for convo=${conversationId}: ${sendResult.error}`,
    );
    // Delete the row we pre-inserted so it doesn't linger as a
    // phantom "sent" message the customer never received. Retries
    // (Vero re-clicks) will create a fresh row with a fresh ID.
    try {
      await sql`DELETE FROM messages WHERE id = ${inserted[0].id}`;
    } catch (cleanupErr) {
      console.error(
        `[admin/messages-send] cleanup DELETE failed for row=${inserted[0].id}:`,
        cleanupErr,
      );
    }
    return res.status(502).json({
      success: false,
      error: sendResult.error || 'Email send failed',
      statusCode: sendResult.statusCode,
    });
  }

  // Log Resend's own tracking id alongside our SMTP Message-ID.
  //
  // These are different identifiers and only the Message-ID is stored
  // (it's what threading needs). But when someone reports "I sent a
  // reply and the client never got it", the only question that matters
  // is what Resend did with it — and without the tracking id there is no
  // way to look that up in their dashboard. Delivery can lag several
  // minutes, so "hasn't arrived" and "failed" look identical from the
  // panel; this line is what tells them apart.
  console.log(
    `[admin/messages-send] email accepted by Resend — to=${recipientEmail} ` +
      `resend_id=${sendResult.resendId ?? 'unknown'} message_id=${preMessageId}`,
  );

  return res.status(200).json({ success: true, message: inserted[0] });
}

/**
 * True only for values that are genuine SMTP Message-IDs and therefore
 * safe to emit in `References` / `In-Reply-To`.
 *
 * See the filter comment in sendEmail(): rows that never traversed SMTP
 * carry a synthetic `<scheme>:` id. Those must never reach the wire.
 */
const SYNTHETIC_ID_PREFIXES = ['form:', 'autoreply:', 'improvmx:', 'resend:', 'recovered:'];

function isRealMessageId(id: string | null): boolean {
  if (!id) return false;
  const v = id.trim();
  if (!v || !v.includes('@')) return false;
  return !SYNTHETIC_ID_PREFIXES.some((p) => v.startsWith(p));
}
