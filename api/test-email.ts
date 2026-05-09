/**
 * TEMPORARY DIAGNOSTIC ENDPOINT — delete before merging to main.
 *
 * Hit it directly in your browser to test the ImprovMX SMTP path
 * without going through the form (so we don't burn Web3Forms quota):
 *
 *   /api/test-email?to=youremail@example.com
 *
 * Returns a JSON log of every step + status, plus pipes nodemailer's
 * internal SMTP transcript into Vercel function logs.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

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

  const host = process.env.IMPROVMX_SMTP_HOST;
  const port = Number(process.env.IMPROVMX_SMTP_PORT || 587);
  const user = process.env.IMPROVMX_SMTP_USER;
  const pass = process.env.IMPROVMX_SMTP_PASS;

  const config = {
    host: host || '(missing)',
    port,
    user: user || '(missing)',
    passLength: pass?.length ?? 0,
  };
  note('env-vars', Boolean(host && user && pass), config);

  if (!host || !user || !pass) {
    return res.status(500).json({ ok: false, log, config });
  }

  let transporter: nodemailer.Transporter;
  try {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      logger: true,
      debug: true,
    });
    note('createTransport', true);
  } catch (err) {
    note('createTransport', false, String(err));
    return res.status(500).json({ ok: false, log, config });
  }

  try {
    await transporter.verify();
    note('verify', true);
  } catch (err) {
    note('verify', false, String(err));
    return res.status(500).json({ ok: false, log, config });
  }

  try {
    const info = await transporter.sendMail({
      from: '"Vero Photography" <vero@vero.photography>',
      to,
      subject: 'SMTP test from /api/test-email',
      text:
        'If you got this, the ImprovMX SMTP path from the Vercel serverless function works end-to-end.\n\n' +
        'You can now delete this test endpoint.\n',
    });
    note('sendMail', true, {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });
    return res.status(200).json({ ok: true, log, config });
  } catch (err) {
    note('sendMail', false, String(err));
    return res.status(500).json({ ok: false, log, config });
  }
}
