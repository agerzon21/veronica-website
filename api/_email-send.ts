/**
 * Email reply sender — outbound side of the email inbox feature.
 *
 * Companion to _email-webhook.ts (inbound). Wires up In-Reply-To +
 * References so mail clients thread the conversation correctly.
 *
 * ─── We do NOT choose the Message-ID ────────────────────────────
 *
 * This file used to mint its own `<uuid@vero.photography>` and set it as
 * a Message-ID header, reasoning that an id on our own domain keeps
 * everything aligned. That reasoning was wrong on the only point that
 * mattered: RESEND SILENTLY DISCARDS IT and assigns its own (an Amazon
 * SES id).
 *
 * Confirmed empirically — a real customer reply carried
 * `In-Reply-To: 010001a02045c24f-…-0000`, an SES id, not ours. So every
 * In-Reply-To/References we emitted pointed at a message that existed
 * only in our database. Gmail has required a genuine reference chain
 * since 2019 and will not thread on matching subjects alone, so the
 * customer saw a pile of unrelated emails while the admin panel showed a
 * tidy thread (it routes on sender address, which masked the problem).
 *
 * Resend added `message_id` to their retrieve endpoint in July 2026 for
 * exactly this. The flow is now: send → read the assigned id back via
 * getResendMessageId() → store it → reference it next time.
 *
 * ─── Reply-To ───────────────────────────────────────────────────
 *
 * Set to vero@vero.photography, the same address we send from. Mail to
 * it hits ImprovMX, which fans out to both Veronika's Gmail and our
 * inbound webhook — so replies reach the panel with no subdomain and no
 * extra DNS, and the customer sees one consistent address.
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
  // Kept purely as an idempotency key for the caller's pre-insert. It is
  // NOT the SMTP Message-ID and must never be treated as one.
  const messageId = args.messageId || generateMessageId(args.from);

  // Build headers explicitly. Resend's SDK accepts a `headers`
  // parameter that maps directly onto the outbound SMTP headers.
  // Values here are wrapped in angle brackets per RFC 5322; we
  // strip them again on the webhook side via normalizeMsgId().
  // NOTE: we deliberately do NOT set a Message-ID header.
  //
  // Resend silently discards it and assigns its own (an Amazon SES id).
  // Setting one produced an id that existed only in our database, so the
  // In-Reply-To/References we built from it referenced a message no mail
  // client had ever seen — and Gmail, which since 2019 requires a real
  // reference chain and will not thread on subject alone, showed the
  // customer a pile of unrelated emails.
  //
  // The real id is read back after send via getResendMessageId(). See
  // api/_reply-delivery.ts.
  const headers: Record<string, string> = {};
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
