/**
 * TEMPORARY DIAGNOSTIC ENDPOINT — delete before merging to main.
 *
 * Sends the REAL auto-reply email (same template as /api/contact) so we can
 * verify the full production flow without burning Web3Forms quota.
 *
 *   /api/test-email?to=youremail@example.com
 *   /api/test-email?to=youremail@example.com&name=Alex&shoot_type=Wedding%20Photography
 *
 * Returns a JSON log of every step + status; pipes nodemailer's full SMTP
 * transcript to Vercel function logs.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendAutoReply, type ContactPayload } from './_auto-reply.js';

interface Step {
  step: string;
  ms: number;
  ok: boolean;
  detail?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now();
  const log: Step[] = [];
  const note = (step: string, ok: boolean, detail?: unknown) => {
    const entry: Step = { step, ms: Date.now() - t0, ok, detail };
    log.push(entry);
    console.log(`[test-email] ${step} (${entry.ms}ms): ${ok ? 'ok' : 'FAIL'}`, detail ?? '');
  };

  const to = (req.query.to as string) || '';
  if (!to || !to.includes('@')) {
    return res.status(400).json({
      ok: false,
      error: 'Pass ?to=youremail@example.com',
    });
  }

  const data: ContactPayload = {
    name: (req.query.name as string) || 'Test User',
    email: to,
    shoot_type: (req.query.shoot_type as string) || 'Photography',
    message: (req.query.message as string) || '(test message)',
  };
  note('payload', true, data);

  try {
    const info = await sendAutoReply(data, { debug: true });
    note('sendAutoReply', true, {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });
    return res.status(200).json({ ok: true, log });
  } catch (err) {
    note('sendAutoReply', false, String(err));
    return res.status(500).json({ ok: false, log });
  }
}
