/**
 * Email reply sender — outbound side of the email inbox feature.
 *
 * Companion to _email-webhook.ts (inbound). When Vero replies to an
 * email conversation from the admin panel, this helper generates a
 * proper SMTP Message-ID header, wires up In-Reply-To + References
 * so mail clients thread the conversation correctly, and sets a
 * Reply-To that routes future customer replies back to our webhook
 * (via the same inbox.<domain> subdomain the inbound webhook
 * consumes).
 *
 * Why we generate our own Message-ID:
 *   Threading in email works by matching the customer's next reply's
 *   `In-Reply-To` header value against a Message-ID we sent
 *   previously. If we let Resend auto-generate the Message-ID we
 *   don't know what it is until Resend responds, and even then
 *   Resend's outbound Message-IDs use their domain (something
 *   like <resend-generated@amazonses.com>). Some strict mail
 *   clients care that In-Reply-To domains match the From domain.
 *   Generating our own ID on OUR domain keeps everything aligned.
 *
 * Why we set a custom Reply-To:
 *   By default, hitting Reply in the customer's mail client would
 *   send to the From address (Vero's vero@vero.photography), which
 *   routes through ImprovMX to her Gmail — invisible to our system.
 *   We want the customer's reply to land in our webhook so we can
 *   store + display it in the conversation view. Setting Reply-To
 *   to an address on the inbound subdomain (e.g. reply@inbox.<domain>)
 *   makes that happen — customer's reply goes to Resend Inbound →
 *   our webhook → threaded via the In-Reply-To header they'll set
 *   to the Message-ID we generated here.
 *
 * The customer's mail client shows Vero's From address prominently
 * ("From: Vero Photography <vero@vero.photography>") and only reveals
 * Reply-To if they look at message details. Their experience: normal
 * Vero email, Reply just works.
 */

import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';

// Reuse the same client shape as api/_auto-reply.ts. Lazy singleton.
let cachedResend: Resend | null = null;
function getResend(): Resend {
  if (cachedResend) return cachedResend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY env var missing');
  cachedResend = new Resend(key);
  return cachedResend;
}

export interface EmailReplyArgs {
  to: string;                    // recipient email (customer)
  from: string;                  // sender email (e.g. vero@vero.photography)
  fromDisplayName?: string;      // display name shown by mail clients
  replyTo: string;               // where customer replies should land (our subdomain)
  subject: string;               // full subject including any Re: prefix
  body: string;                  // plaintext body
  html?: string;                 // optional rich body — falls back to text-in-<pre>
  inReplyTo?: string | null;     // normalized Message-ID we're replying to
  references?: string[];         // full thread chain, oldest to newest, normalized
  // Optional pre-generated Message-ID. Callers that want to persist
  // the outbound row BEFORE calling this helper (for idempotency —
  // send-then-persist can double-send on DB blips) should generate
  // their own UUID, insert the row, then pass the same ID here so
  // the SMTP Message-ID header matches what's in the DB. Omit to
  // have the helper generate one internally (older code path).
  messageId?: string;
}

export interface EmailReplyResult {
  ok: boolean;
  /**
   * The SMTP Message-ID we generated for this outbound, normalized
   * (no angle brackets). Store this as the message row's
   * external_message_id — the customer's next reply will carry it
   * in their In-Reply-To header, matched by the webhook.
   */
  messageId?: string;
  /** Resend's own tracking ID, separate from the SMTP Message-ID. */
  resendId?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Generate a normalized (no angle brackets) SMTP Message-ID value
 * scoped to the domain of the From address. Format matches the
 * normalizeMsgId() output in _email-webhook.ts so equality checks
 * work on both write and read.
 */
function generateMessageId(fromAddress: string): string {
  const atIdx = fromAddress.lastIndexOf('@');
  const domain =
    atIdx > 0 ? fromAddress.slice(atIdx + 1).toLowerCase().trim() : 'localhost';
  return `${randomUUID()}@${domain}`;
}

/**
 * Send an outbound email reply via Resend. Returns the SMTP
 * Message-ID we generated so the caller can store it on the
 * outbound row for future In-Reply-To matching.
 *
 * Failure modes:
 *   - RESEND_API_KEY missing → throws at client construction time.
 *     Caller's try/catch turns it into a 500.
 *   - Resend rejects the send (unverified domain, bad address, rate
 *     limit) → returns { ok: false, error, statusCode }. Caller can
 *     surface to the admin UI.
 *   - Network / timeout — caught here, returned as { ok: false }.
 *     Note: we do NOT set an AbortSignal timeout like _ig-send.ts
 *     does, because email sends can legitimately take a few seconds
 *     during warm-up, and unlike IG webhook we're inside an admin
 *     interaction (Vero is waiting on a UI Send button) rather than
 *     inside a webhook with a 20s SLA cap. Vercel's function
 *     maxDuration is the outer bound.
 */
export async function sendEmailReply(
  args: EmailReplyArgs,
): Promise<EmailReplyResult> {
  // Use caller-provided ID if given (idempotency pattern), else
  // generate our own. Either way, this is what we set in the
  // outbound SMTP Message-ID header and hand back to the caller
  // for DB persistence.
  const messageId = args.messageId || generateMessageId(args.from);

  // Build headers explicitly. Resend's SDK accepts a `headers`
  // parameter that maps directly onto the outbound SMTP headers.
  // Values here are wrapped in angle brackets per RFC 5322; we
  // strip them again on the webhook side via normalizeMsgId().
  const headers: Record<string, string> = {
    'Message-ID': `<${messageId}>`,
  };
  if (args.inReplyTo) {
    headers['In-Reply-To'] = `<${args.inReplyTo}>`;
  }
  if (args.references && args.references.length > 0) {
    // References is space-separated <id> values per RFC 5322.
    // Include everything from oldest to newest so mail clients
    // reconstruct the full thread.
    headers['References'] = args.references.map((r) => `<${r}>`).join(' ');
  }

  const fromField = args.fromDisplayName
    ? `${args.fromDisplayName} <${args.from}>`
    : args.from;

  try {
    const { data, error } = await getResend().emails.send({
      from: fromField,
      to: args.to,
      replyTo: args.replyTo,
      subject: args.subject,
      text: args.body,
      html: args.html,
      headers,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data) {
      return { ok: false, error: 'Resend send returned no data' };
    }
    return { ok: true, messageId, resendId: data.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Derive a customer-facing subject line for a reply.
 *
 * If the parent subject already starts with `Re:` (case-insensitive,
 * possibly with a colon variant), reuse it verbatim — mail clients
 * don't want `Re: Re: Re:` chains. Otherwise prefix `Re: `.
 *
 * Empty / missing parent subject → `Re:` alone, which mail clients
 * render as an unlabelled thread. Fine as a fallback; Vero can
 * always edit if the UI exposes a subject field.
 */
export function deriveReplySubject(parentSubject: string | null | undefined): string {
  const parent = (parentSubject || '').trim();
  if (!parent) return 'Re:';
  // Match Re:, RE:, re:, Re :, RE: [spaces] optionally.
  if (/^\s*re\s*:/i.test(parent)) return parent;
  return `Re: ${parent}`;
}
