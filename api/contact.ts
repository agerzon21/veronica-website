import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendAutoReply, type ContactPayload } from './_auto-reply';

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

  try {
    const info = await sendAutoReply(data, { debug: true });
    console.log('[contact] sent:', {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[contact] sendAutoReply failed:', err);
    return res.status(500).json({ success: false, error: 'Auto-reply failed' });
  }
}
