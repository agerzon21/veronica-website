import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendAutoReply, sendLeadNotification, type ContactPayload } from './_auto-reply.js';
import { getDb } from './_db.js';

async function logSubmission(data: ContactPayload): Promise<void> {
  // Best-effort log to contact_submissions. Failure here is non-fatal —
  // Web3Forms still delivered the inquiry email + the auto-reply will still
  // send. We just lose the database row for that one submission.
  try {
    const sql = getDb();
    await sql`
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
    `;
  } catch (err) {
    console.error('[contact] logSubmission failed (non-fatal):', err);
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
  const [_logResult, autoReplyResult, notifyResult] = await Promise.allSettled([
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
  return res.status(200).json({ success: true, emailId: autoReplyResult.value.id });
}
