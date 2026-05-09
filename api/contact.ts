import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

const FROM_DISPLAY = 'Vero Photography';
const FROM_ADDRESS = 'vero@vero.photography';
const INSTAGRAM_URL = 'https://www.instagram.com/vero.art.photo';
const WHATSAPP_PHONE = '+1 (570) 909-5707';
const WHATSAPP_URL = 'https://wa.me/15709095707';

interface ContactPayload {
  name: string;
  email: string;
  shoot_type?: string;
  message?: string;
  botcheck?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAutoReplyHtml(data: ContactPayload): string {
  const firstName = (data.name || '').trim().split(/\s+/)[0] || 'there';
  const safeFirst = escapeHtml(firstName);
  const shootBlurb = data.shoot_type
    ? ` about a ${escapeHtml(data.shoot_type.toLowerCase())}`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thanks for reaching out</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #2d2d2d;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; max-width: 600px; width: 100%;">
          <tr>
            <td style="padding: 40px 36px;">
              <p style="font-size: 11px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #c9a96e; margin: 0 0 24px;">Vero Photography</p>

              <p style="font-size: 17px; line-height: 1.6; margin: 0 0 16px;">Hi ${safeFirst},</p>

              <p style="font-size: 16px; color: #4a4a4a; line-height: 1.7; margin: 0 0 20px;">
                Thank you for reaching out${shootBlurb}. I just received your message and I'll personally get back to you within 24 hours.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
                <tr>
                  <td style="background-color: #fef9e6; border-left: 3px solid #c9a96e; padding: 18px 22px;">
                    <p style="font-size: 15px; color: #4a4a4a; line-height: 1.6; margin: 0;">
                      <strong style="color: #2d2d2d;">Don't see my reply by tomorrow?</strong><br>
                      Please check your <strong>Spam</strong> or <strong>Promotions</strong> folder and mark this email as <strong>Not Spam</strong> — it helps make sure my next reply lands in your inbox.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="font-size: 16px; color: #4a4a4a; line-height: 1.7; margin: 0 0 12px;">
                Need a faster reply? You can also reach me on:
              </p>

              <p style="font-size: 16px; color: #4a4a4a; line-height: 1.9; margin: 0 0 28px;">
                Instagram:&nbsp;<a href="${INSTAGRAM_URL}" style="color: #c9a96e; text-decoration: none;">@vero.art.photo</a><br>
                WhatsApp:&nbsp;<a href="${WHATSAPP_URL}" style="color: #c9a96e; text-decoration: none;">${escapeHtml(WHATSAPP_PHONE)}</a>
              </p>

              <p style="font-size: 16px; color: #4a4a4a; line-height: 1.7; margin: 0 0 4px;">Talk soon,</p>
              <p style="font-size: 16px; color: #2d2d2d; margin: 0; font-style: italic;">Veronika</p>

              <hr style="border: none; border-top: 1px solid #ececec; margin: 36px 0 24px;">

              <p style="font-size: 12px; color: #888; line-height: 1.6; margin: 0 0 8px;">
                You're receiving this because you submitted the contact form at vero.photography. If this wasn't you, just ignore this message.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildAutoReplyText(data: ContactPayload): string {
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

async function sendAutoReply(data: ContactPayload): Promise<void> {
  const host = process.env.IMPROVMX_SMTP_HOST;
  const port = Number(process.env.IMPROVMX_SMTP_PORT || 587);
  const user = process.env.IMPROVMX_SMTP_USER;
  const pass = process.env.IMPROVMX_SMTP_PASS;

  console.log('[contact] SMTP config:', {
    host: host || '(missing)',
    port,
    user: user || '(missing)',
    passLength: pass?.length ?? 0,
  });

  if (!host || !user || !pass) {
    throw new Error('Missing SMTP env vars');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,         // STARTTLS upgrade on port 587
    requireTLS: true,      // fail if server doesn't support STARTTLS
    auth: { user, pass },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
    logger: true,          // pipes nodemailer's internal events to console
    debug: true,
  });

  console.log('[contact] verifying SMTP connection…');
  await transporter.verify();
  console.log('[contact] verify ok, sending mail…');

  const info = await transporter.sendMail({
    from: `"${FROM_DISPLAY}" <${FROM_ADDRESS}>`,
    to: data.email,
    replyTo: FROM_ADDRESS,
    subject: `Re: Your ${data.shoot_type || 'Photography'} Inquiry`,
    text: buildAutoReplyText(data),
    html: buildAutoReplyHtml(data),
  });
  console.log('[contact] sent:', { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected });
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

  try {
    await sendAutoReply(data);
  } catch (err) {
    console.error('[contact] Auto-reply failed:', err);
    return res.status(500).json({ success: false, error: 'Auto-reply failed' });
  }

  return res.status(200).json({ success: true });
}
