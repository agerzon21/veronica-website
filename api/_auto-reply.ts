/**
 * Shared transactional email helpers used by /api/contact and /api/subscribe.
 *
 * Filename starts with `_` so Vercel does not expose it as an HTTP endpoint
 * (only files with a default-exported handler become routes).
 *
 * Sends via Resend (Amazon SES backend) from the verified vero.photography
 * domain. Auto-replies and the welcome email share one sender identity so all
 * their engagement reputation compounds onto the same address Veronika uses to
 * email clients personally.
 */

import { Resend } from 'resend';

export interface ContactPayload {
  name: string;
  email: string;
  shoot_type?: string;
  date?: string;
  location?: string;
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

/** Produces a natural English phrase from the dropdown's shoot_type value. */
function getShootBlurb(shootType: string | undefined): string {
  if (!shootType || shootType === 'Other') return '';
  // Special case: "Wedding Photography" doesn't pair with "a" + "session"
  if (shootType === 'Wedding Photography') return ' about your wedding';
  // The rest are "X Session" — read naturally with "your"
  return ` about your ${shootType.toLowerCase()}`;
}

export function buildAutoReplyHtml(data: ContactPayload): string {
  const firstName = (data.name || '').trim().split(/\s+/)[0] || 'there';
  const safeFirst = escapeHtml(firstName);
  const shootBlurb = escapeHtml(getShootBlurb(data.shoot_type));

  const trimmedDate = (data.date || '').trim();
  const trimmedLocation = (data.location || '').trim();
  const detailsBlock =
    trimmedDate || trimmedLocation
      ? `<p style="margin:8px 0 0;font-size:13px;color:#888;">Your inquiry:</p>
<p style="margin:6px 0 16px;padding:8px 14px;background:#f7f5f1;border-radius:4px;color:#5a5a5a;font-size:14px;line-height:1.7;">${
          trimmedDate ? `<strong style="color:#2d2d2d;">Preferred date:</strong> ${escapeHtml(trimmedDate)}<br>` : ''
        }${
          trimmedLocation ? `<strong style="color:#2d2d2d;">Location:</strong> ${escapeHtml(trimmedLocation)}` : ''
        }</p>`
      : '';

  const trimmedMessage = (data.message || '').trim();
  const messageBlock = trimmedMessage
    ? `<p style="margin:8px 0 0;font-size:13px;color:#888;">Your message:</p>
<p style="border-left:3px solid #d8d8d8;margin:6px 0 20px;padding:6px 0 6px 14px;color:#5a5a5a;font-style:italic;font-size:14px;">${escapeHtml(trimmedMessage).replace(/\n/g, '<br>')}</p>`
    : '';

  // Slim layout: no nested tables, minimal inline styles, few links. Keeps the
  // body lightweight and avoids the link-heavy, spam-trigger patterns that hurt
  // inbox placement from a young sending domain.
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${safeFirst},</p>
<p>Thank you for reaching out${shootBlurb}. I just received your message and I'll personally get back to you within 24 hours.</p>
${detailsBlock}${messageBlock}
<p>Need a faster reply? You can also reach me on:</p>
<p>Instagram: <a href="${INSTAGRAM_URL}" style="color:#c9a96e">@vero.art.photo</a><br>WhatsApp: <a href="${WHATSAPP_URL}" style="color:#c9a96e">${escapeHtml(WHATSAPP_PHONE)}</a></p>
<p>Warmly,<br><em>Veronika</em></p>
<hr style="border:none;border-top:1px solid #ececec;margin:28px 0 12px;">
<p style="font-size:12px;color:#888;">You're receiving this because you submitted the contact form at vero.photography. If this wasn't you, just ignore this message.</p>
</body></html>`;
}

export function buildAutoReplyText(data: ContactPayload): string {
  const firstName = (data.name || '').trim().split(/\s+/)[0] || 'there';
  const shootBlurb = getShootBlurb(data.shoot_type);
  const trimmedDate = (data.date || '').trim();
  const trimmedLocation = (data.location || '').trim();
  const detailsLines: string[] = [];
  if (trimmedDate) detailsLines.push(`  Preferred date: ${trimmedDate}`);
  if (trimmedLocation) detailsLines.push(`  Location: ${trimmedLocation}`);
  const detailsBlock = detailsLines.length
    ? `\n\nYour inquiry:\n${detailsLines.join('\n')}`
    : '';
  const trimmedMessage = (data.message || '').trim();
  const messageBlock = trimmedMessage
    ? `\n\nYour message:\n${trimmedMessage.split('\n').map((l) => `> ${l}`).join('\n')}`
    : '';
  return `Hi ${firstName},

Thank you for reaching out${shootBlurb}. I just received your message and I'll personally get back to you within 24 hours.${detailsBlock}${messageBlock}

Need a faster reply? You can also reach me on:
  Instagram: ${INSTAGRAM_URL}
  WhatsApp: ${WHATSAPP_PHONE} (${WHATSAPP_URL})

Warmly,
Veronika
Vero Photography
`;
}

// One shared Resend client, constructed lazily. A missing API key surfaces as a
// thrown error at send time (caught by callers → 500) rather than crashing the
// function at import.
let resendClient: Resend | null = null;
function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY env var');
  }
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

interface EmailMessage {
  to: string | string[];                     // Resend accepts an array for multi-recipient
  cc?: string | string[];
  subject: string;
  html: string;
  text: string;
  // Optional Reply-To override. Default (undefined) keeps replies coming
  // back to FROM_ADDRESS (Veronika herself) — correct for auto-replies to
  // clients. Used by sendLeadNotification below to route Vero's Reply
  // straight to the lead's own inbox: she reads the notification, hits
  // Reply, Gmail addresses it to the lead. Set to a string address to
  // override; multiple reply-to addresses aren't supported by Resend.
  replyTo?: string;
  // Optional file attachments. Each entry is sent inline via Resend's
  // attachments API — used by the contract-signing flow to deliver the
  // signed PDF to both the client and Veronika in one email.
  attachments?: Array<{
    filename: string;
    content: Buffer | string;  // Buffer or base64-encoded string
  }>;
}

/**
 * Sends one email via Resend from the studio identity.
 *
 * Resend resolves with { data, error } instead of throwing on a failed send.
 * We translate a present `error` into a thrown exception so callers
 * (api/contact, api/subscribe) can treat a rejected promise as "the email did
 * not go out" and return a 500.
 */
export async function sendEmail(message: EmailMessage): Promise<{ id: string }> {
  const { data, error } = await getResend().emails.send({
    from: `${FROM_DISPLAY} <${FROM_ADDRESS}>`,
    to: message.to,
    cc: message.cc,
    // Default reply-to is Vero herself (FROM_ADDRESS). Any caller that
    // wants replies routed elsewhere (e.g. lead notifications → the
    // lead's inbox) passes an explicit `replyTo`.
    replyTo: message.replyTo ?? FROM_ADDRESS,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
  if (!data) {
    throw new Error('Resend send returned no data');
  }
  return data;
}

/** Send the auto-reply for a contact form submission. */
export async function sendAutoReply(data: ContactPayload): Promise<{ id: string }> {
  return sendEmail({
    to: data.email,
    subject: `Re: Your ${data.shoot_type || 'Photography'} Inquiry`,
    text: buildAutoReplyText(data),
    html: buildAutoReplyHtml(data),
  });
}

/**
 * Builds the Vero-facing "new lead came in" notification body.
 *
 * Deliberately unadorned — internal notification, not customer-facing.
 * Vero reads it in Gmail, sees who/what/when at a glance, and hits Reply
 * to land in the lead's own inbox (replyTo below is the lead's address,
 * not FROM_ADDRESS).
 */
function buildLeadNotificationHtml(data: ContactPayload): string {
  const safeName = escapeHtml(data.name || 'Unknown');
  const safeEmail = escapeHtml(data.email || '');
  const safeShoot = escapeHtml(data.shoot_type || 'Not specified');
  const trimmedDate = (data.date || '').trim();
  const trimmedLocation = (data.location || '').trim();
  const trimmedMessage = (data.message || '').trim();
  const rows: string[] = [
    `<tr><td style="padding:6px 12px 6px 0;color:#888;font-size:13px;white-space:nowrap;">Name</td><td style="padding:6px 0;color:#2d2d2d;">${safeName}</td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0;color:#888;font-size:13px;white-space:nowrap;">Email</td><td style="padding:6px 0;"><a href="mailto:${safeEmail}" style="color:#c9a96e;">${safeEmail}</a></td></tr>`,
    `<tr><td style="padding:6px 12px 6px 0;color:#888;font-size:13px;white-space:nowrap;">Type</td><td style="padding:6px 0;color:#2d2d2d;">${safeShoot}</td></tr>`,
  ];
  if (trimmedDate) {
    rows.push(
      `<tr><td style="padding:6px 12px 6px 0;color:#888;font-size:13px;white-space:nowrap;">Preferred date</td><td style="padding:6px 0;color:#2d2d2d;">${escapeHtml(trimmedDate)}</td></tr>`,
    );
  }
  if (trimmedLocation) {
    rows.push(
      `<tr><td style="padding:6px 12px 6px 0;color:#888;font-size:13px;white-space:nowrap;">Location</td><td style="padding:6px 0;color:#2d2d2d;">${escapeHtml(trimmedLocation)}</td></tr>`,
    );
  }

  const messageBlock = trimmedMessage
    ? `<p style="margin:20px 0 8px;font-size:13px;color:#888;">Message</p>
<p style="border-left:3px solid #d8d8d8;margin:0 0 20px;padding:6px 0 6px 14px;color:#2d2d2d;font-style:italic;font-size:14px;white-space:pre-wrap;">${escapeHtml(trimmedMessage)}</p>`
    : '';

  // Hit Reply in Gmail — replyTo below is set to the lead's email, so
  // this button is really just belt-and-suspenders for clients that
  // don't honor Reply-To (rare, but iOS Mail occasionally).
  const replyButton = `<p style="margin:12px 0 0;"><a href="mailto:${safeEmail}" style="display:inline-block;padding:10px 20px;background:#c9a96e;color:#fff;text-decoration:none;border-radius:4px;font-size:14px;">Reply to ${safeName}</a></p>`;

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography · New Lead</p>
<table style="border-collapse:collapse;width:100%;">
${rows.join('\n')}
</table>
${messageBlock}
${replyButton}
<hr style="border:none;border-top:1px solid #ececec;margin:28px 0 12px;">
<p style="font-size:12px;color:#888;">Submitted via vero.photography contact form. Hit Reply in your mail client to respond directly to ${safeName} — reply-to is set to their address, not ours.</p>
</body></html>`;
}

function buildLeadNotificationText(data: ContactPayload): string {
  const lines: string[] = [
    `NEW LEAD — vero.photography`,
    ``,
    `Name:  ${data.name || 'Unknown'}`,
    `Email: ${data.email || ''}`,
    `Type:  ${data.shoot_type || 'Not specified'}`,
  ];
  if ((data.date || '').trim()) lines.push(`Preferred date: ${data.date}`);
  if ((data.location || '').trim()) lines.push(`Location: ${data.location}`);
  const trimmedMessage = (data.message || '').trim();
  if (trimmedMessage) {
    lines.push('');
    lines.push('Message:');
    lines.push(trimmedMessage.split('\n').map((l) => `  ${l}`).join('\n'));
  }
  lines.push('');
  lines.push('Hit Reply to respond directly — reply-to is set to the lead.');
  return lines.join('\n') + '\n';
}

/**
 * Sends Vero a "new lead came in" notification.
 *
 * Destination: LOGIN_ADMIN_EMAIL env var (already the address Vero uses
 * to sign into /admin, i.e. her canonical owner identity in the system)
 * with FROM_ADDRESS as a fallback so a missing env var never silently
 * swallows the notification — worst case, Vero gets it at
 * vero@vero.photography and forwards to herself.
 *
 * Reply-to is the LEAD'S email, not Vero's — so hitting Reply in Gmail
 * threads straight to the lead. This is the whole point of the sendEmail
 * `replyTo` override added alongside this function.
 *
 * Failure of this send is NON-FATAL for the /api/contact endpoint. The
 * primary work (customer auto-reply + DB log) already succeeded by the
 * time this fires; if the notification bounces we log and continue.
 * Callers should wrap in Promise.allSettled or a try/catch that swallows.
 */
export async function sendLeadNotification(data: ContactPayload): Promise<{ id: string }> {
  const notifyTo = process.env.LOGIN_ADMIN_EMAIL || FROM_ADDRESS;
  const shootLabel = data.shoot_type || 'inquiry';
  return sendEmail({
    to: notifyTo,
    replyTo: data.email,
    subject: `[New lead] ${data.name} — ${shootLabel}`,
    text: buildLeadNotificationText(data),
    html: buildLeadNotificationHtml(data),
  });
}

// The lifecycle states Resend reports for a sent email. We surface the raw
// value so the client can decide what counts as "done" vs "keep waiting".
export type DeliveryEvent =
  | 'queued'
  | 'scheduled'
  | 'sent'
  | 'delivery_delayed'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'canceled'
  | 'suppressed'
  | 'opened'
  | 'clicked';

/**
 * Looks up the current delivery status of a previously sent email. Used by the
 * Thank-You page to wait for the recipient's mail server to actually confirm
 * receipt (`delivered`) before telling the user the confirmation went through.
 */
export async function getDeliveryStatus(id: string): Promise<DeliveryEvent> {
  const { data, error } = await getResend().emails.get(id);
  if (error) {
    throw new Error(`Resend get failed: ${error.message}`);
  }
  if (!data) {
    throw new Error('Resend get returned no data');
  }
  return data.last_event;
}
