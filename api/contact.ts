import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  sendAutoReply,
  sendLeadNotification,
  buildAutoReplyText,
  type ContactPayload,
} from './_auto-reply.js';
import { recordContactSubmission } from './_inbox-record.js';
import { getDb } from './_db.js';

/**
 * Best-effort log to contact_submissions.
 *
 * Returns the new row's id so the inbox mirror can key its message on it
 * (and link the lead row back to the conversation). Returns null on
 * failure — non-fatal: Web3Forms still delivered the inquiry email and
 * the auto-reply still sends. We just lose the database row.
 */
async function logSubmission(data: ContactPayload): Promise<string | null> {
  try {
    const sql = getDb();
    const rows = (await sql`
      insert into contact_submissions
        (name, email, shoot_type, preferred_date, location, message)
      values (
        ${data.name},
        ${data.email},
        ${data.shoot_type ?? null},
        ${data.date ?? null},
        ${data.location ?? null},
        ${data.message ?? null}
      )
      returning id
    `) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error('[contact] logSubmission failed (non-fatal):', err);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const data = (req.body || {}) as ContactPayload;

  // Honeypot — bots fill this; humans never see it
  if (data.botcheck && data.botcheck.length > 0) {
    return res.status(200).json({ success: true });
  }

  if (!data.name || !data.email) {
    return res.status(400).json({ success: false, error: 'Name and email are required' });
  }

  // Three parallel best-effort operations. allSettled (not all) so one
  // rejection doesn't cancel the others.
  //
  // 1. logSubmission     — DB row for the admin Leads view. Non-fatal;
  //                         a lost row doesn't break the customer flow.
  // 2. sendAutoReply     — CRITICAL PATH. Customer expects a confirmation
  //                         email. A rejection here is the only condition
  //                         that returns 500.
  // 3. sendLeadNotification — pings Vero ("new lead came in") so she
  //                         actually knows to look at the Admin panel.
  //                         Replaces the Web3Forms notification we're
  //                         cutting in PR 2. Non-fatal — if her ping
  //                         fails, the customer STILL got their reply.
  const [logResult, autoReplyResult, notifyResult] = await Promise.allSettled([
    logSubmission(data),
    sendAutoReply(data),
    sendLeadNotification(data),
  ]);

  if (autoReplyResult.status === 'rejected') {
    console.error('[contact] sendAutoReply failed:', autoReplyResult.reason);
    return res.status(500).json({ success: false, error: 'Auto-reply failed' });
  }

  if (notifyResult.status === 'rejected') {
    // Log-only. The lead is in the DB and the customer got their reply;
    // Vero just won't get pinged for THIS specific submission. She'll
    // still see it in the Admin Leads panel on her next check-in.
    console.error('[contact] sendLeadNotification failed (non-fatal):', notifyResult.reason);
  } else {
    console.log('[contact] lead notification sent:', { id: notifyResult.value.id });
  }

  console.log('[contact] auto-reply sent:', { id: autoReplyResult.value.id });

  // 4. Mirror the submission into the unified inbox as a conversation, so
  //    Vero can reply from the Messages panel and any later email from
  //    this person threads into the same history.
  //
  //    Runs AFTER the batch above rather than inside it because it needs
  //    both the submission id (to key the message) and the auto-reply's
  //    id + body (to record it as the first outbound in the thread).
  //    Storing that outbound is also what keeps the AI assistant from
  //    immediately sending a second message on top of the auto-reply —
  //    _ai-reply.ts skips any conversation whose newest inbound is
  //    already followed by an outbound.
  //
  //    Swallows its own errors; never affects the response.
  await recordContactSubmission({
    submissionId: logResult.status === 'fulfilled' ? logResult.value : null,
    data,
    autoReplyMessageId: autoReplyResult.value.messageId,
    autoReplyText: buildAutoReplyText(data),
  });

  return res.status(200).json({ success: true, emailId: autoReplyResult.value.id });
}
