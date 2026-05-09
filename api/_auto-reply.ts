/**
 * Shared auto-reply email helpers used by /api/contact and /api/test-email.
 *
 * Filename starts with `_` so Vercel does not expose it as an HTTP endpoint
 * (only files with a default-exported handler become routes).
 */

import nodemailer from 'nodemailer';

export interface ContactPayload {
  name: string;
  email: string;
  shoot_type?: string;
  message?: string;
  botcheck?: string;
}

export const FROM_DISPLAY = 'Vero Photography';
export const FROM_ADDRESS = 'vero@vero.photography';
export const INSTAGRAM_URL = 'https://www.instagram.com/vero.art.photo';
export const WHATSAPP_PHONE = '+1 (570) 909-5707';
export const WHATSAPP_URL = 'https://wa.me/15709095707';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildAutoReplyHtml(data: ContactPayload): string {
  const firstName = (data.name || '').trim().split(/\s+/)[0] || 'there';
  const safeFirst = escapeHtml(firstName);
  const shootBlurb = data.shoot_type
    ? ` about a ${escapeHtml(data.shoot_type.toLowerCase())}`
    : '';

  // Slim layout: no nested tables, minimal inline styles. Same content as the
  // text version. Targets ~1.5KB instead of ~4.7KB so ImprovMX's body-side
  // scanning (DKIM, spam, link reputation) doesn't time us out.
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${safeFirst},</p>
<p>Thank you for reaching out${shootBlurb}. I just received your message and I'll personally get back to you within 24 hours.</p>
<p style="background:#fef9e6;border-left:3px solid #c9a96e;padding:12px 16px;font-size:14px;"><strong>Don't see my reply by tomorrow?</strong> Please check your <strong>Spam</strong> or <strong>Promotions</strong> folder and mark this email as <strong>Not Spam</strong> — it helps make sure my next reply lands in your inbox.</p>
<p>Need a faster reply? You can also reach me on:</p>
<p>Instagram: <a href="${INSTAGRAM_URL}" style="color:#c9a96e">@vero.art.photo</a><br>WhatsApp: <a href="${WHATSAPP_URL}" style="color:#c9a96e">${escapeHtml(WHATSAPP_PHONE)}</a></p>
<p>Talk soon,<br><em>Veronika</em></p>
<hr style="border:none;border-top:1px solid #ececec;margin:28px 0 12px;">
<p style="font-size:12px;color:#888;">You're receiving this because you submitted the contact form at vero.photography. If this wasn't you, just ignore this message.</p>
</body></html>`;
}

export function buildAutoReplyText(data: ContactPayload): string {
  const firstName = (data.name || '').trim().split(/\s+/)[0] || 'there';
  const shootBlurb = data.shoot_type ? ` about a ${data.shoot_type.toLowerCase()}` : '';
  return `Hi ${firstName},

Thank you for reaching out${shootBlurb}. I just received your message and I'll personally get back to you within 24 hours.

Don't see my reply by tomorrow? Please check your Spam or Promotions folder and mark this email as "Not Spam" — it helps make sure my next reply lands in your inbox.

Need a faster reply? You can also reach me on:
  Instagram: ${INSTAGRAM_URL}
  WhatsApp: ${WHATSAPP_PHONE} (${WHATSAPP_URL})

Talk soon,
Veronika
Vero Photography
`;
}

/**
 * Builds the SMTP transporter with hardened settings for serverless use:
 *  - Aggressive timeouts so we fail within Vercel's 10s function budget
 *  - requireTLS so we fail loudly if STARTTLS isn't available
 */
export function buildTransporter(opts: { debug?: boolean } = {}): nodemailer.Transporter {
  const host = process.env.IMPROVMX_SMTP_HOST;
  const port = Number(process.env.IMPROVMX_SMTP_PORT || 587);
  const user = process.env.IMPROVMX_SMTP_USER;
  const pass = process.env.IMPROVMX_SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('Missing SMTP env vars (IMPROVMX_SMTP_HOST/USER/PASS)');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
    logger: opts.debug ?? false,
    debug: opts.debug ?? false,
  });
}

/** Send the auto-reply for a contact form submission. */
export async function sendAutoReply(
  data: ContactPayload,
  opts: { debug?: boolean } = {}
): Promise<nodemailer.SentMessageInfo> {
  const transporter = buildTransporter({ debug: opts.debug });
  return transporter.sendMail({
    from: `"${FROM_DISPLAY}" <${FROM_ADDRESS}>`,
    to: data.email,
    replyTo: FROM_ADDRESS,
    subject: `Re: Your ${data.shoot_type || 'Photography'} Inquiry`,
    text: buildAutoReplyText(data),
    html: buildAutoReplyHtml(data),
  });
}
