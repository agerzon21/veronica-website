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

  // Slim layout: no nested tables, minimal inline styles. Targets ~1.5KB so
  // ImprovMX's body-side scanning (DKIM, spam, link reputation) is fast.
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${safeFirst},</p>
<p>Thank you for reaching out${shootBlurb}. I just received your message and I'll personally get back to you within 24 hours.</p>
${detailsBlock}${messageBlock}
<p style="background:#fef9e6;border-left:3px solid #c9a96e;padding:12px 16px;font-size:14px;">If this email landed in your <strong>Spam</strong> or <strong>Promotions</strong> folder, please mark it as <strong>Not Spam</strong> — it'll help my future replies reach your inbox.</p>
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

If this email landed in your Spam or Promotions folder, please mark it as Not Spam — it'll help my future replies reach your inbox.

Need a faster reply? You can also reach me on:
  Instagram: ${INSTAGRAM_URL}
  WhatsApp: ${WHATSAPP_PHONE} (${WHATSAPP_URL})

Warmly,
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

  // Port 465 = implicit TLS (no STARTTLS upgrade — saves ~2 SMTP roundtrips).
  // Port 587 = plain connect then STARTTLS upgrade.
  // Autodetect from the port number so this works either way.
  const useImplicitTls = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure: useImplicitTls,
    requireTLS: !useImplicitTls,
    auth: { user, pass },
    // Fail fast on connection-level issues (broken backend = retry helps)
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    // Be patient on socket activity. ImprovMX can take 10-20s to respond
    // at any SMTP step under load (DKIM signing, spam scoring, etc.).
    // Pushed close to Vercel's 30s function budget so we wait out slow
    // backends instead of false-failing emails that actually shipped.
    socketTimeout: 25000,
    logger: opts.debug ?? false,
    debug: opts.debug ?? false,
  });
}

/**
 * True for connection-level errors that are likely to succeed on retry —
 * typically caused by ImprovMX's DNS round-robin pointing us at an unhealthy
 * backend server. Each retry creates a new transporter (fresh DNS lookup), so
 * we usually land on a different (healthy) IP.
 *
 * Auth failures and recipient/sender rejections are NOT retried — they'll fail
 * the same way next time and waste our budget.
 */
function isRetryable(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string; responseCode?: number };
  if (e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' || e.code === 'EDNS') {
    return true;
  }
  if (e.responseCode && e.responseCode >= 400 && e.responseCode < 500) {
    return false; // client errors (auth, etc.) won't fix themselves
  }
  if (e.responseCode && e.responseCode >= 500) {
    return false; // server-side rejections (recipient unknown, etc.)
  }
  const msg = String(err);
  if (msg.includes('Greeting never received')) return true;
  if (msg.includes('Connection closed unexpectedly')) return true;
  return false;
}

/** Send the auto-reply for a contact form submission. */
export async function sendAutoReply(
  data: ContactPayload,
  opts: { debug?: boolean; maxAttempts?: number } = {}
): Promise<nodemailer.SentMessageInfo> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const message = {
    from: `"${FROM_DISPLAY}" <${FROM_ADDRESS}>`,
    to: data.email,
    replyTo: FROM_ADDRESS,
    subject: `Re: Your ${data.shoot_type || 'Photography'} Inquiry`,
    text: buildAutoReplyText(data),
    html: buildAutoReplyHtml(data),
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const transporter = buildTransporter({ debug: opts.debug });
      const info = await transporter.sendMail(message);
      if (attempt > 1) {
        console.log(`[auto-reply] succeeded on attempt ${attempt}/${maxAttempts}`);
      }
      return info;
    } catch (err) {
      lastError = err;
      const retryable = isRetryable(err);
      console.warn(
        `[auto-reply] attempt ${attempt}/${maxAttempts} failed (retryable=${retryable}): ${err}`
      );
      if (!retryable || attempt === maxAttempts) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
