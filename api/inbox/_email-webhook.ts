/**
 * Inbound email webhook receiver.
 *
 * Companion to _ig-webhook.ts. Email conversations live in the same
 * `conversations` + `messages` tables as Instagram DMs, keyed by
 * (platform='email', external_user_id=<sender's address, lowercased>).
 *
 * Registered under the /api/inbox dispatcher:
 *   POST /api/inbox/email-webhook  →  this file
 *
 * ─── Provider adapters ──────────────────────────────────────────
 *
 * Everything provider-specific lives in the two adapters at the bottom
 * of this file. They authenticate the request and flatten whatever the
 * vendor sent into one `InboundEmail`. The routing + persistence below
 * is provider-agnostic, so switching vendors is an adapter, not a
 * rewrite.
 *
 *   improvmx (ACTIVE) — Alex's existing $9/mo Premium plan includes
 *     webhooks. The alias forwards to Veronika's Gmail AND to this URL
 *     in one rule (comma-separated destinations), so Gmail keeps
 *     receiving everything on an independent path. Requires no DNS
 *     changes at all. Auth is a shared token in the query string —
 *     ImprovMX does not sign its webhooks.
 *
 *   resend (STANDBY) — signed with Svix, and Resend stores inbound mail
 *     so a down webhook loses nothing. Requires an MX record and shares
 *     the sending quota. Kept wired because it is the likely path if
 *     this ever ships to other photographers, where per-tenant domain
 *     provisioning matters.
 *
 * Selected by the INBOUND_EMAIL_PROVIDER env var; defaults to improvmx.
 *
 * ─── Routing ────────────────────────────────────────────────────
 *
 * Primary key is the SENDER'S ADDRESS, not the In-Reply-To header. One
 * client means one ongoing thread, which is how a photographer actually
 * works — and it means threading still works when a provider omits
 * In-Reply-To (ImprovMX does not document it). In-Reply-To is used only
 * as a corroborating signal when present.
 *
 * ─── Dedup ──────────────────────────────────────────────────────
 *
 * `external_message_id` is UNIQUE. Providers retry on non-2xx, so the
 * ON CONFLICT DO NOTHING on insert makes redelivery a silent no-op.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import getRawBody from 'raw-body';
import { Resend } from 'resend';
import { waitUntil } from '@vercel/functions';
import { getDb } from '../_db.js';
import { processInboundMessage } from '../_ai-reply.js';
import { splitQuotedEmail, looksLikeSameMessage, type QuotedMessage } from '../_email-quotes.js';

/** Our own sending identity — used to drop echoes of our own outbound. */
const SELF_ADDRESS = (process.env.EMAIL_FROM_ADDRESS || 'vero@vero.photography').toLowerCase();

/**
 * Senders that are our own tooling notifying Veronika, not customers
 * writing in. Mail from these must never become a conversation.
 */
const SELF_NOTIFICATION_DOMAINS = ['web3forms.com'];

/**
 * Senders whose bulk mail we WANT, because it carries new customer
 * reviews. Matched together with a review-ish subject — see
 * isReviewNotification.
 */
const REVIEW_NOTIFICATION_DOMAINS = ['google.com', 'yelp.com'];
const REVIEW_SUBJECT_HINT =
  /\b(review|reviewed|rating|rated|feedback|отзыв|оценк)/i;

type Provider = 'improvmx' | 'resend';
const PROVIDER = ((process.env.INBOUND_EMAIL_PROVIDER || 'improvmx').toLowerCase() as Provider);

/**
 * The normalized shape every adapter produces. Nothing downstream of
 * `parseInbound` knows which vendor delivered the message.
 */
interface InboundEmail {
  /** Stored as external_message_id. Must be stable across retries. */
  providerMessageId: string;
  fromAddress: string;
  fromDisplayName: string | null;
  subject: string | null;
  body: string;
  /** Parent Message-ID if the provider exposed one. Advisory only. */
  inReplyTo: string | null;
  sentAt: string;
  /** Names only — bytes stay with the provider / in Gmail. */
  attachmentNames: string[];
}

/** Adapter outcome: either a message to store, or a reason to stop. */
type ParseResult =
  | { ok: true; email: InboundEmail }
  | { ok: false; status: number; reason: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await readRawBody(req);

  let parsed: ParseResult;
  try {
    parsed = PROVIDER === 'resend'
      ? await parseResend(req, rawBody)
      : parseImprovMx(req, rawBody);
  } catch (err) {
    console.error(`[inbox/email-webhook] adapter '${PROVIDER}' threw:`, err);
    // 500 → provider retries. Better than swallowing a real inquiry.
    return res.status(500).json({ error: 'Adapter failure' });
  }

  if (!parsed.ok) {
    // 2xx reasons are deliberate skips (auto-replies, our own echoes).
    // Ack those so the provider stops retrying something we'll never want.
    const level = parsed.status >= 400 ? 'warn' : 'log';
    console[level](`[inbox/email-webhook] ${parsed.status}: ${parsed.reason}`);
    return res.status(parsed.status).json({ ok: parsed.status < 400, reason: parsed.reason });
  }

  const email = parsed.email;
  console.log(
    `[inbox/email-webhook] inbound from=${email.fromAddress} ` +
      `subject="${(email.subject || '').slice(0, 60)}" ` +
      `msg_id=${email.providerMessageId} attachments=${email.attachmentNames.length}`,
  );

  try {
    const sql = getDb();
    let conversationId: string | null = null;

    // ── Route 1: In-Reply-To points at one of our outbound messages,
    //    AND the sender owns that conversation.
    //
    // The ownership check is a security gate, not a nicety. Message-IDs
    // leak in every forwarded thread; without it, anyone who scrapes one
    // could forge an In-Reply-To and have their text injected into a
    // client's thread, rendered under that client's name.
    if (email.inReplyTo) {
      const rows = (await sql`
        SELECT c.id
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.external_message_id = ${email.inReplyTo}
          AND c.platform = 'email'
          AND LOWER(c.external_user_id) = ${email.fromAddress}
        LIMIT 1
      `) as Array<{ id: string }>;
      if (rows.length > 0) conversationId = rows[0].id;
    }

    // ── Route 2: existing thread with this sender. The normal path,
    //    and the one that makes a contact-form submission and a later
    //    direct email land together.
    if (!conversationId) {
      const rows = (await sql`
        SELECT id FROM conversations
        WHERE platform = 'email' AND LOWER(external_user_id) = ${email.fromAddress}
        LIMIT 1
      `) as Array<{ id: string }>;
      if (rows.length > 0) conversationId = rows[0].id;
    }

    // ── Route 3: first contact. COALESCE on the name so a later email
    //    carrying a display name backfills one we never had.
    if (!conversationId) {
      const rows = (await sql`
        INSERT INTO conversations (platform, external_user_id, contact_name, contact_handle)
        VALUES ('email', ${email.fromAddress}, ${email.fromDisplayName}, ${email.fromAddress})
        ON CONFLICT (platform, external_user_id) DO UPDATE
          SET contact_name = COALESCE(conversations.contact_name, EXCLUDED.contact_name),
              updated_at = NOW()
        RETURNING id
      `) as Array<{ id: string }>;
      conversationId = rows[0]?.id ?? null;
    }

    if (!conversationId) {
      console.error('[inbox/email-webhook] could not resolve a conversation');
      return res.status(500).json({ error: 'Conversation resolution failed' });
    }

    // ── Strip quoted history, and recover anything it reveals ──────
    //
    // Every reply carries the whole thread re-quoted underneath. We
    // render the thread above the message anyway, so storing the quote
    // buries the actual sentence under screens of '>'.
    //
    // The quote is also the ONLY record of messages Veronika sent from
    // Gmail rather than the panel — those never touch our webhook. So
    // before discarding it, mine it for anything missing.
    const split = splitQuotedEmail(email.body);
    await recoverQuotedOutbound(
      sql,
      conversationId,
      split.mostRecentQuote,
      email.fromAddress,
      email.sentAt,
    );

    const body = email.attachmentNames.length
      ? `${split.newContent}\n\n[Attachments: ${email.attachmentNames.join(', ')} — open in Gmail]`
      : split.newContent;

    const inserted = (await sql`
      INSERT INTO messages (
        conversation_id, direction, sender, channel, body,
        external_message_id, from_address, subject, in_reply_to, sent_at
      )
      VALUES (
        ${conversationId}, 'inbound', 'contact', 'email', ${body},
        ${email.providerMessageId}, ${email.fromAddress}, ${email.subject},
        ${email.inReplyTo}, ${email.sentAt}
      )
      ON CONFLICT (external_message_id) DO NOTHING
      RETURNING id
    `) as Array<{ id: string }>;

    if (inserted.length === 0) {
      console.log(`[inbox/email-webhook] duplicate ${email.providerMessageId} — skipped`);
      return res.status(200).json({ ok: true, duplicate: true });
    }

    console.log(
      `[inbox/email-webhook] stored message=${inserted[0].id} conversation=${conversationId}`,
    );

    // ── Hand off to the AI reply engine ───────────────────────────
    //
    // Ack the provider FIRST, then think — same shape as the Instagram
    // webhook. ImprovMX retries only twice before dropping mail
    // permanently, so a slow OpenAI call must never sit on the response.
    //
    // On email the engine DRAFTS rather than sends (migration 019), so
    // nothing reaches the customer without Vero. Every other guardrail —
    // kill switch, per-conversation toggle, rate limit, spam filter,
    // booking-commitment bridge — applies unchanged.
    //
    // Review notifications are skipped: Google telling us someone left a
    // review is not a customer writing in, and drafting a reply to it
    // would be nonsense.
    const isReviewMail = isReviewNotification(email.fromAddress, email.subject);
    if (!isReviewMail) {
      const conversationIdForAi = conversationId;
      const storedId = inserted[0].id;
      const storedSentAt = email.sentAt;
      waitUntil(
        (async () => {
          const startedAt = Date.now();
          try {
            const result = await processInboundMessage({
              conversationId: conversationIdForAi,
              inboundMessageId: storedId,
              inboundSentAt: storedSentAt,
            });
            console.log(
              `[inbox/email-webhook] ai-reply action=${result.action} ` +
                `duration_ms=${Date.now() - startedAt}` +
                (result.reason ? ` reason="${result.reason}"` : ''),
            );
          } catch (err) {
            // processInboundMessage returns structured results rather
            // than throwing; this is belt-and-braces so a future edit
            // that slips a throw through doesn't vanish silently.
            console.error('[inbox/email-webhook] ai-reply threw:', err);
          }
        })(),
      );
    }

    return res.status(200).json({ ok: true, messageId: inserted[0].id });
  } catch (err) {
    console.error('[inbox/email-webhook] persist failed:', err);
    // 500 → retry. The UNIQUE constraint makes that idempotent.
    return res.status(500).json({ error: 'Persist failed' });
  }
}

// ────────────────────────────────────────────────────────────────
// Adapter: ImprovMX
// ────────────────────────────────────────────────────────────────

/**
 * ImprovMX POSTs a fully-parsed message in one request — no second
 * fetch needed for the body.
 *
 * Auth: ImprovMX does not sign webhooks. The only mechanisms available
 * are a shared secret in the query string and their single static
 * source IP. We require the token (constant-time compared) and log an
 * IP mismatch without enforcing it, since Vercel's proxy layer makes
 * the observed source address unreliable.
 *
 * The alias should be configured with `?attachments=false` so files are
 * not base64-inlined into the request — Vercel rejects bodies over
 * 4.5MB, and a client sending three photos would otherwise vanish. The
 * files still reach Gmail; we keep their names.
 */
function parseImprovMx(req: VercelRequest, rawBody: string): ParseResult {
  const expected = process.env.INBOX_WEBHOOK_TOKEN;
  if (!expected) {
    console.error('[inbox/email-webhook] INBOX_WEBHOOK_TOKEN env var missing');
    return { ok: false, status: 500, reason: 'Server not configured' };
  }
  const provided = firstQuery(req.query?.token);
  if (!provided || !timingSafeEqual(provided, expected)) {
    return { ok: false, status: 403, reason: 'Bad or missing token' };
  }

  const sourceIp = readHeader(req, 'x-forwarded-for')?.split(',')[0]?.trim();
  if (sourceIp && sourceIp !== IMPROVMX_SOURCE_IP) {
    console.warn(
      `[inbox/email-webhook] source IP ${sourceIp} != ImprovMX ${IMPROVMX_SOURCE_IP} (not enforced)`,
    );
  }

  const payload = parseBody(rawBody);
  if (!payload) return { ok: false, status: 400, reason: 'Unparseable body' };

  // `from` arrives as either "Name <addr>" or { name, email } depending
  // on how the message was addressed. Handle both.
  const rawFrom = payload.from;
  let fromAddress: string | null = null;
  let fromDisplayName: string | null = null;
  if (rawFrom && typeof rawFrom === 'object') {
    const o = rawFrom as Record<string, unknown>;
    fromAddress = typeof o.email === 'string' ? o.email.trim().toLowerCase() : null;
    fromDisplayName = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : null;
  } else if (typeof rawFrom === 'string') {
    const parsedFrom = parseFromHeader(rawFrom);
    fromAddress = parsedFrom.address;
    fromDisplayName = parsedFrom.displayName;
  }
  if (!fromAddress) return { ok: false, status: 400, reason: 'No sender address' };

  const headers = (payload.headers ?? {}) as Record<string, unknown>;
  const subjectForFilter = typeof payload.subject === 'string' ? payload.subject : null;
  const skip = shouldSkip(fromAddress, headers, subjectForFilter);
  if (skip) return { ok: false, status: 200, reason: skip };

  const text = typeof payload.text === 'string' ? payload.text : '';
  const html = typeof payload.html === 'string' ? payload.html : '';
  const files = attachmentNames(payload.attachments);
  let body = text.trim() || stripHtml(html) || '(no body)';

  // SENDER AUTHENTICITY.
  //
  // We route inbound mail into a conversation by From address alone, and
  // From is trivially forged. ImprovMX evaluates SPF upstream and passes
  // the verdict through, so use it — a forged "client" asking Veronika to
  // change payment details is the realistic attack here, not spam.
  //
  // We FLAG rather than reject: SPF legitimately fails on relayed and
  // mailing-list mail, and silently dropping a real inquiry is worse than
  // showing one with a warning on it. The banner goes in the body so it
  // is impossible to miss in the thread and is carried into the AI's
  // context along with the message.
  const spf = spfVerdict(headers);
  if (spf === 'fail') {
    body =
      `⚠️ This message failed sender verification (SPF). The "from" address ` +
      `may be forged — confirm by phone before acting on anything in it.\n\n${body}`;
    console.warn(`[inbox/email-webhook] SPF fail for claimed sender ${fromAddress}`);
  }

  // Prefer the message's own Message-ID so a redelivery dedupes. Fall
  // back to a content-derived key rather than a random one — a random id
  // would defeat the UNIQUE constraint on retry.
  //
  // Attachment names are folded into the hash. Without them, a client who
  // sends "Here are the ones I like" twice with DIFFERENT photos attached
  // produces an identical key, and the second email is silently dropped
  // as a duplicate. The date is included for the same reason: two
  // genuinely identical "Any update?" nudges days apart are different
  // messages, and the second one is precisely the one that matters.
  const messageId =
    normalizeMsgId(readAny(payload, headers, 'message-id')) ||
    `improvmx:${fromAddress}:${hashString(
      [payload.subject ?? '', body, files.join(','), new Date().toISOString().slice(0, 13)].join(
        '|',
      ),
    )}`;

  return {
    ok: true,
    email: {
      providerMessageId: messageId,
      fromAddress,
      fromDisplayName,
      subject: typeof payload.subject === 'string' ? payload.subject : null,
      body,
      inReplyTo: normalizeMsgId(readAny(payload, headers, 'in-reply-to')),
      sentAt: coerceDate(payload.date ?? payload.timestamp ?? readAny(payload, headers, 'date')),
      attachmentNames: files,
    },
  };
}

/**
 * Read the upstream SPF result out of whichever header the provider
 * supplied. Returns null when no verdict is present — absence is not
 * failure, and must not be treated as one.
 */
function spfVerdict(headers: Record<string, unknown>): 'pass' | 'fail' | null {
  const raw =
    headerValue(headers, 'authentication-results') ?? headerValue(headers, 'received-spf') ?? '';
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (/spf\s*=\s*pass|^\s*pass\b/.test(lower)) return 'pass';
  if (/spf\s*=\s*(?:fail|softfail)|^\s*(?:fail|softfail)\b/.test(lower)) return 'fail';
  // none / neutral / temperror / permerror — not an assertion either way.
  return null;
}

const IMPROVMX_SOURCE_IP = '15.237.103.194';

// ────────────────────────────────────────────────────────────────
// Adapter: Resend Inbound (standby)
// ────────────────────────────────────────────────────────────────

/**
 * Resend signs webhooks with Svix and sends METADATA ONLY — the body,
 * headers, and attachments require a second API call. Kept wired but
 * inactive; see the file header for why ImprovMX is the current choice.
 */
async function parseResend(req: VercelRequest, rawBody: string): Promise<ParseResult> {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  if (!webhookSecret || !apiKey) {
    console.error('[inbox/email-webhook] RESEND_WEBHOOK_SECRET or RESEND_API_KEY missing');
    return { ok: false, status: 500, reason: 'Server not configured' };
  }

  const id = readHeader(req, 'svix-id');
  const timestamp = readHeader(req, 'svix-timestamp');
  const signature = readHeader(req, 'svix-signature');
  if (!id || !timestamp || !signature) {
    return { ok: false, status: 400, reason: 'Missing Svix headers' };
  }

  const resend = new Resend(apiKey);
  let payload: Record<string, unknown>;
  try {
    payload = resend.webhooks.verify({
      payload: rawBody,
      headers: { id, timestamp, signature },
      webhookSecret,
    }) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, status: 403, reason: `Bad signature: ${(err as Error).message}` };
  }

  if (payload.type !== 'email.received') {
    return { ok: false, status: 200, reason: `ignored event ${String(payload.type)}` };
  }

  const data = (payload.data ?? {}) as Record<string, unknown>;
  const emailId = typeof data.email_id === 'string' ? data.email_id : null;
  if (!emailId) return { ok: false, status: 400, reason: 'No email_id' };

  // Second round-trip for the actual content.
  const result = await resend.emails.receiving.get(emailId);
  if (result.error || !result.data) {
    console.error(`[inbox/email-webhook] receiving.get failed: ${result.error?.message}`);
    return { ok: false, status: 500, reason: 'Content fetch failed' };
  }
  const full = result.data as unknown as Record<string, unknown>;

  const { address, displayName } = parseFromHeader(String(full.from ?? data.from ?? ''));
  if (!address) return { ok: false, status: 400, reason: 'No sender address' };

  const headers = (full.headers ?? {}) as Record<string, unknown>;
  const skip = shouldSkip(address, headers, typeof full.subject === 'string' ? full.subject : null);
  if (skip) return { ok: false, status: 200, reason: skip };

  const text = typeof full.text === 'string' ? full.text : '';
  const html = typeof full.html === 'string' ? full.html : '';

  return {
    ok: true,
    email: {
      providerMessageId:
        normalizeMsgId(readAny(full, headers, 'message-id')) || `resend:${emailId}`,
      fromAddress: address,
      fromDisplayName: displayName,
      subject: typeof full.subject === 'string' ? full.subject : null,
      body: text.trim() || stripHtml(html) || '(no body)',
      inReplyTo: normalizeMsgId(readAny(full, headers, 'in-reply-to')),
      sentAt: coerceDate(full.received_at),
      attachmentNames: attachmentNames(full.attachments),
    },
  };
}

// ────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────

/**
 * Reasons to acknowledge a message without storing it.
 *
 * Vacation responders and bounce notifications are the common case —
 * without this filter they create phantom "the client replied" threads
 * and, once AI is enabled for email, an auto-responder ping-pong.
 */
function shouldSkip(
  fromAddress: string,
  headers: Record<string, unknown>,
  subject: string | null,
): string | null {
  if (fromAddress === SELF_ADDRESS) return 'echo of our own outbound';

  // Review notifications are wanted, and the bulk filter below would eat
  // them. Google Business Profile and Yelp both send with
  // `Precedence: bulk` / `Auto-Submitted: auto-generated` — the exact
  // headers that identify a vacation responder. Without this exemption
  // the reviews auto-ingest (Phase 6) has no input at all: the mail
  // arrives, and we throw it away before storing it.
  //
  // Scoped to sender domain AND a review-ish subject on purpose. A bare
  // domain allowlist would also pull in Google security alerts and
  // product marketing, which really are bulk mail we don't want.
  if (isReviewNotification(fromAddress, subject)) return null;

  // Notification mail generated by our OWN contact-form pipeline and
  // addressed to Veronika. Ingesting it creates a second, junk thread
  // beside the real one for every single submission — the customer's
  // details rendered as if a stranger named "Vero Photography Website"
  // had emailed in.
  //
  // The Resend lead notification is already covered by the SELF_ADDRESS
  // check above (it sends as vero@). Web3Forms is not: it sends from its
  // own domain, and the site still dual-runs it. This can come out once
  // the Web3Forms cord is cut — see Phase 2 PR 2 in TRANSITIONS.md.
  const domain = fromAddress.split('@')[1] ?? '';
  if (SELF_NOTIFICATION_DOMAINS.includes(domain)) {
    return `own form-notification pipeline (${domain})`;
  }

  const autoSubmitted = String(headerValue(headers, 'auto-submitted') ?? '').toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return `auto-submitted: ${autoSubmitted}`;

  const precedence = String(headerValue(headers, 'precedence') ?? '').toLowerCase();
  if (['bulk', 'junk', 'list', 'auto_reply'].includes(precedence)) {
    return `precedence: ${precedence}`;
  }
  if (headerValue(headers, 'x-autoreply') || headerValue(headers, 'x-autorespond')) {
    return 'autoresponder header';
  }
  // RFC 3464 delivery-status notifications arrive with a null envelope
  // sender; some forwarders surface that as the literal string.
  if (fromAddress === '<>' || fromAddress.startsWith('mailer-daemon@')) {
    return 'bounce notification';
  }
  return null;
}

/** Case-insensitive lookup across a provider's header bag. */
function headerValue(headers: Record<string, unknown>, name: string): string | null {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) {
      if (Array.isArray(v)) return v.length ? String(v[0]) : null;
      return v == null ? null : String(v);
    }
  }
  return null;
}

/** Prefer a top-level field, else the header bag. */
function readAny(
  payload: Record<string, unknown>,
  headers: Record<string, unknown>,
  name: string,
): string | null {
  const snake = name.replace(/-/g, '_');
  const direct = payload[name] ?? payload[snake];
  if (typeof direct === 'string' && direct.trim()) return direct;
  return headerValue(headers, name);
}

async function readRawBody(req: VercelRequest): Promise<string> {
  try {
    const buf = await getRawBody(req, { encoding: 'utf8' });
    return typeof buf === 'string' ? buf : String(buf);
  } catch {
    // Body already consumed upstream — reconstruct as best we can.
    const b = req.body;
    if (b == null) return '';
    if (typeof b === 'string') return b;
    if (Buffer.isBuffer(b)) return b.toString('utf8');
    return JSON.stringify(b);
  }
}

/** Accepts JSON or form-encoded — providers differ and can change. */
function parseBody(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  try {
    const params = new URLSearchParams(trimmed);
    const out: Record<string, unknown> = {};
    for (const [k, v] of params) {
      // Nested JSON is common in form-encoded webhook payloads.
      if ((v.startsWith('{') || v.startsWith('[')) && v.length > 1) {
        try {
          out[k] = JSON.parse(v);
          continue;
        } catch {
          /* fall through to the raw string */
        }
      }
      out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** Parse `Display Name <addr@host>`; tolerates a bare address. */
function parseFromHeader(from: string): { displayName: string | null; address: string | null } {
  const trimmed = (from || '').trim();
  if (!trimmed) return { displayName: null, address: null };
  const match = trimmed.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match) {
    const name = match[1].replace(/^"|"$/g, '').trim();
    return { displayName: name || null, address: match[2].trim().toLowerCase() };
  }
  return { displayName: null, address: trimmed.toLowerCase() };
}

/**
 * Normalize a Message-ID for storage and comparison.
 *
 * RFC 5322 writes these as `<local@domain>`, but parsers vary on whether
 * they keep the brackets. Storing both forms silently breaks equality
 * lookups, so normalize on read AND write: strip brackets, lowercase the
 * domain half.
 *
 * Splitting on whitespace BEFORE stripping brackets matters: In-Reply-To
 * is single-valued per spec but clients do send space-separated chains,
 * and stripping outer brackets first corrupts every token. Take the last
 * one — the most immediate parent.
 */
function normalizeMsgId(value: string | null | undefined): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  let s = tokens[tokens.length - 1];
  if (s.startsWith('<')) s = s.slice(1);
  if (s.endsWith('>')) s = s.slice(0, -1);
  s = s.trim();
  if (!s) return null;
  const at = s.lastIndexOf('@');
  if (at > 0) s = s.slice(0, at) + '@' + s.slice(at + 1).toLowerCase();
  return s || null;
}

function attachmentNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a && typeof a === 'object') {
        const o = a as Record<string, unknown>;
        const name = o.filename ?? o.name ?? o.file_name;
        return typeof name === 'string' ? name : null;
      }
      return null;
    })
    .filter((n): n is string => !!n && n.trim().length > 0)
    .slice(0, 20);
}

/**
 * Convert a provider/sender-supplied timestamp to an ISO string, CLAMPED
 * to a believable window.
 *
 * The value lands in messages.sent_at, and the messages_touch_conversation
 * trigger (migration 005) copies it unconditionally into
 * conversations.last_message_at — which is the inbox sort key. The `Date`
 * header is set by the sender's mail client, so without a clamp anyone
 * can pin a thread to the top of Vero's inbox forever with a year-2099
 * date, or sink a live conversation below every stale one with a
 * year-2019 date. It also reorders the thread view, which sorts by
 * sent_at ascending.
 *
 * Tolerate ordinary drift and genuinely delayed relays; treat anything
 * beyond that as untrustworthy and fall back to our own receipt time.
 * Ordering integrity beats fidelity to a clock we cannot verify.
 */
const FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 minutes of clock drift
const PAST_SKEW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — a slow relay, not a broken clock

function coerceDate(value: unknown): string {
  const now = Date.now();
  const clamp = (ms: number): string | null => {
    if (!Number.isFinite(ms)) return null;
    if (ms > now + FUTURE_SKEW_MS || ms < now - PAST_SKEW_MS) return null;
    return new Date(ms).toISOString();
  };

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Unix seconds vs milliseconds — anything below ~1e11 is seconds.
    const iso = clamp(value < 1e11 ? value * 1000 : value);
    if (iso) return iso;
  }
  if (typeof value === 'string' && value.trim()) {
    const iso = clamp(new Date(value).getTime());
    if (iso) return iso;
  }
  if (value != null && String(value).trim()) {
    console.warn(`[inbox/email-webhook] unusable Date "${String(value).slice(0, 60)}" — using now`);
  }
  return new Date(now).toISOString();
}

/** Stable non-cryptographic hash — dedup key only, never a secret. */
function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Length-independent comparison so the token can't be probed by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readHeader(req: VercelRequest, name: string): string | null {
  const v = req.headers[name.toLowerCase()] ?? req.headers[name];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function firstQuery(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * HTML → readable text, for senders that omit a text/plain part.
 *
 * Drops <head> (otherwise "Untitled Document" leads the preview) and
 * CSS-hidden preheader divs — the marketing pattern where a
 * display:none block exists purely to control Gmail's snippet. Without
 * that, the inbox preview shows tracking chrome instead of the message.
 */
function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(
      /<div[^>]*style="[^"]*(?:display\s*:\s*none|visibility\s*:\s*hidden|max-height\s*:\s*0)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      '',
    )
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// Documentation only — Vercel reads `export const config` from the
// top-level function file (api/inbox.ts), not from imported handlers.
// The bodyParser:false that actually applies is declared there.
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Recover a message Veronika sent from Gmail, using the copy the client
 * quoted back at us.
 *
 * When she replies outside the panel, that message never reaches this
 * webhook and the thread has a hole. Their next reply quotes it, so the
 * quoted block is the only evidence we will ever get. Without this, the
 * panel shows the client asking a question and then apparently being
 * ignored — and once AI-on-email lands, the assistant would draft a
 * reply to a question she already answered.
 *
 * Guards, in order of how badly each would misfire:
 *   - Only recover blocks attributed to US. A quote of the CLIENT'S own
 *     earlier message would otherwise be re-inserted as an outbound from
 *     Veronika, putting words in her mouth.
 *   - Only when the thread has no similar outbound already. Mail clients
 *     re-wrap and re-punctuate, so this is a fuzzy comparison, not
 *     equality.
 *   - Never newer than the reply that carried it.
 *
 * Best-effort: a failure here must not cost us the real inbound message,
 * so everything is caught and logged.
 */
async function recoverQuotedOutbound(
  sql: ReturnType<typeof getDb>,
  conversationId: string,
  quote: QuotedMessage | null,
  replySender: string,
  replySentAt: string,
): Promise<void> {
  if (!quote || !quote.body.trim()) return;

  try {
    // Attributed to us? Prefer the address; fall back to the display
    // name only when the quote carried no address at all.
    const quotedEmail = quote.authorEmail?.toLowerCase() ?? null;
    const isOurs = quotedEmail
      ? quotedEmail === SELF_ADDRESS
      : !!quote.author && /vero|veronika/i.test(quote.author);
    if (!isOurs) return;

    // Defensive: if the quote is attributed to the person who just
    // wrote to us, it is their own words being echoed, not ours.
    if (quotedEmail && quotedEmail === replySender.toLowerCase()) return;

    const existing = (await sql`
      SELECT body FROM messages
      WHERE conversation_id = ${conversationId} AND direction = 'outbound'
      ORDER BY sent_at DESC LIMIT 12
    `) as Array<{ body: string }>;

    if (existing.some((m) => looksLikeSameMessage(m.body, quote.body))) return;

    // Anchor the recovered message to the reply that revealed it, NOT to
    // the timestamp in the quoted attribution line.
    //
    // Attribution lines carry a wall-clock time with NO timezone ("at
    // 1:22 PM"). Vercel runs UTC, so parsing that yields 13:22 UTC for a
    // message actually sent at 13:22 EDT — four hours early, which sorts
    // the recovered message above the thread instead of into it. That is
    // exactly the bug this replaced: the recovery worked, but landed the
    // message where nobody would look for it.
    //
    // The absolute time is genuinely unknowable from the quote. The
    // ORDER is not: this message provably came before the reply quoting
    // it. So place it one second earlier and be correct about the only
    // thing that matters.
    const replyMs = new Date(replySentAt).getTime();
    const anchorMs = Number.isFinite(replyMs) ? replyMs : Date.now();
    const sentAt = new Date(anchorMs - 1000).toISOString();

    // 'recovered:' marks this as reconstructed, not sent by us — it is a
    // synthetic id and is filtered out of RFC 5322 References headers by
    // isRealMessageId() in _messages-send.ts.
    const externalId = `recovered:${hashString(`${conversationId}|${quote.body}`)}`;

    const rows = (await sql`
      INSERT INTO messages (
        conversation_id, direction, sender, channel, body,
        external_message_id, from_address, sent_at
      )
      VALUES (
        ${conversationId}, 'outbound', 'human', 'email', ${quote.body},
        ${externalId}, ${SELF_ADDRESS}, ${sentAt}
      )
      ON CONFLICT (external_message_id) DO NOTHING
      RETURNING id
    `) as Array<{ id: string }>;

    if (rows.length > 0) {
      console.log(
        `[inbox/email-webhook] recovered a Gmail-sent reply from quoted history ` +
          `(message=${rows[0].id} conversation=${conversationId})`,
      );
    }
  } catch (err) {
    // Never let recovery cost us the real message.
    console.error('[inbox/email-webhook] quote recovery failed (non-fatal):', err);
  }
}

/**
 * True for the notification emails Google Business Profile and Yelp send
 * when a customer leaves a review.
 *
 * Requires BOTH a known sender domain and a review-ish subject. Google
 * sends a great deal of bulk mail to a business address — security
 * alerts, Workspace marketing, Search Console digests — and none of that
 * belongs in Veronika's client inbox. Subdomain-aware so
 * `businessprofile-noreply@notifications.google.com` matches too.
 */
function isReviewNotification(fromAddress: string, subject: string | null): boolean {
  const domain = fromAddress.split('@')[1] ?? '';
  const fromKnownSender = REVIEW_NOTIFICATION_DOMAINS.some(
    (d) => domain === d || domain.endsWith(`.${d}`),
  );
  if (!fromKnownSender) return false;
  return REVIEW_SUBJECT_HINT.test(subject ?? '');
}
