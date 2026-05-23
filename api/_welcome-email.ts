/**
 * Welcome email — fired after an exit-intent popup signup.
 * Warm, short, includes a unique 10%-off code the recipient mentions at booking.
 *
 * Reuses the existing SMTP transport from _auto-reply.ts so we don't duplicate
 * the connection retry / ImprovMX-quirks logic.
 */

import type nodemailer from 'nodemailer';
import {
  buildTransporter,
  escapeHtml,
  FROM_DISPLAY,
  FROM_ADDRESS,
  INSTAGRAM_URL,
  WHATSAPP_URL,
  WHATSAPP_PHONE,
} from './_auto-reply.js';

export interface WelcomePayload {
  email: string;
  discountCode: string;
}

export function buildWelcomeHtml(data: WelcomePayload): string {
  const safeCode = escapeHtml(data.discountCode);
  // Inline styles only — no <style> blocks — because email clients strip
  // almost everything. Keep visual hierarchy with structure not CSS rules.
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:32px 16px;line-height:1.6;font-size:16px;background:#ffffff;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 24px;">Vero Photography</p>

<p style="margin:0 0 16px;">Hi there,</p>

<p style="margin:0 0 16px;">Thanks for stopping by — that genuinely means a lot. I'm Veronika, the photographer behind everything you've been browsing.</p>

<p style="margin:0 0 24px;">Here's a small thank-you to keep me in mind for whenever you're ready:</p>

<div style="background:linear-gradient(135deg, #f7f1e6 0%, #f0e6d2 100%);border:1px solid #e3d4b4;border-radius:6px;padding:28px 24px;text-align:center;margin:0 0 24px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.25em;text-transform:uppercase;color:#a08456;">Your Welcome Gift</p>
  <p style="margin:0 0 16px;font-size:32px;font-weight:300;color:#2d2d2d;letter-spacing:0.05em;">10% off your next session</p>
  <p style="margin:0 0 6px;font-size:10px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#a08456;">Use Code</p>
  <p style="margin:0;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:18px;font-weight:500;color:#2d2d2d;letter-spacing:0.1em;background:#ffffff;padding:10px 16px;border-radius:4px;display:inline-block;border:1px solid #e3d4b4;">${safeCode}</p>
</div>

<p style="margin:0 0 16px;">Just mention this code when you book — wedding, portrait, family, maternity, anything. I'll take care of the rest.</p>

<p style="margin:0 0 28px;text-align:center;">
  <a href="https://vero.photography/contact" style="display:inline-block;background:#c9a96e;color:#ffffff;text-decoration:none;padding:12px 28px;font-size:12px;font-weight:400;letter-spacing:0.25em;text-transform:uppercase;border-radius:2px;">Book a Session</a>
</p>

<p style="margin:0 0 8px;">Talk soon,<br><em style="color:#5a5a5a;">Veronika</em></p>

<hr style="border:none;border-top:1px solid #ececec;margin:28px 0 16px;">

<p style="font-size:12px;color:#888;margin:0 0 8px;">Want to reach me directly?</p>
<p style="font-size:13px;color:#5a5a5a;margin:0 0 12px;">Instagram: <a href="${INSTAGRAM_URL}" style="color:#c9a96e;text-decoration:none;">@vero.art.photo</a><br>WhatsApp: <a href="${WHATSAPP_URL}" style="color:#c9a96e;text-decoration:none;">${escapeHtml(WHATSAPP_PHONE)}</a></p>

<p style="font-size:11px;color:#aaa;margin:16px 0 0;">You received this because you signed up at vero.photography. This is a one-time welcome — I don't run a regular newsletter. If you didn't sign up, just delete and ignore.</p>
</body></html>`;
}

export function buildWelcomeText(data: WelcomePayload): string {
  return `Hi there,

Thanks for stopping by — that genuinely means a lot. I'm Veronika, the photographer behind everything you've been browsing.

Here's a small thank-you to keep me in mind for whenever you're ready:

  10% OFF YOUR NEXT SESSION
  Code: ${data.discountCode}

Just mention this code when you book — wedding, portrait, family, maternity, anything. I'll take care of the rest.

Book a session: https://vero.photography/contact

Talk soon,
Veronika

---
Vero Photography

Want to reach me directly?
  Instagram: ${INSTAGRAM_URL}
  WhatsApp: ${WHATSAPP_PHONE} (${WHATSAPP_URL})

You received this because you signed up at vero.photography. This is a one-time welcome — no regular newsletter. If you didn't sign up, just delete and ignore.
`;
}

export async function sendWelcomeEmail(
  data: WelcomePayload,
): Promise<nodemailer.SentMessageInfo> {
  const message = {
    from: `"${FROM_DISPLAY}" <${FROM_ADDRESS}>`,
    to: data.email,
    replyTo: FROM_ADDRESS,
    subject: `Your 10% off — a little welcome from Vero Photography`,
    text: buildWelcomeText(data),
    html: buildWelcomeHtml(data),
  };
  const transporter = buildTransporter();
  return transporter.sendMail(message);
}
