import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendAutoReply, type ContactPayload } from './_auto-reply.js';
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

  // Log to Neon (best-effort) and send auto-reply in parallel. Promise.all
  // would fail-fast if either rejects; allSettled lets each finish even if
  // the other errors. Auto-reply is the critical path for the user response.
  const [_, autoReplyResult] = await Promise.allSettled([
    logSubmission(data),
    sendAutoReply(data),
  ]);

  if (autoReplyResult.status === 'rejected') {
    console.error('[contact] sendAutoReply failed:', autoReplyResult.reason);
    return res.status(500).json({ success: false, error: 'Auto-reply failed' });
  }

  const info = autoReplyResult.value;
  console.log('[contact] sent:', {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
  });
  return res.status(200).json({ success: true });
}
