/**
 * Instagram DM webhook receiver.
 *
 * Two-mode endpoint per Meta's webhook spec:
 *
 *   GET  /api/inbox/ig-webhook
 *     Handshake — Meta calls this ONCE when we subscribe from the app
 *     dashboard. It sends hub.mode=subscribe, hub.verify_token=<our-secret>,
 *     hub.challenge=<random-string>. If our stored IG_WEBHOOK_VERIFY_TOKEN
 *     matches what Meta sent, we echo back hub.challenge in plaintext and
 *     Meta activates the subscription.
 *
 *   POST /api/inbox/ig-webhook
 *     Real message events. Meta posts a signed JSON payload for every
 *     DM sent to any connected IG Business account (in our case, just
 *     @vero.art.photo). We verify the signature, parse the payload,
 *     upsert the conversation, insert message rows, and return 200
 *     FAST. Meta retries slow/failed webhooks and eventually blacklists
 *     endpoints that consistently time out — the actual reply-generation
 *     work happens asynchronously in a later step (session 2), not
 *     inline here.
 *
 * Signature verification (POST):
 *   Meta signs the raw request body with our app secret and sends it as
 *   `X-Hub-Signature-256: sha256=<hex>`. We recompute the HMAC over the
 *   raw body using IG_APP_SECRET and constant-time compare. Never trust
 *   an unsigned or mis-signed payload — the URL is public and anyone
 *   could POST fake messages otherwise.
 *
 * Payload structure (simplified):
 *   {
 *     object: 'instagram',
 *     entry: [{
 *       id: '<IG_USER_ID of the recipient (Vero)>',
 *       time: <unix ms>,
 *       messaging: [{
 *         sender:    { id: '<IGSID of the customer>' },
 *         recipient: { id: '<IG_USER_ID of Vero>' },
 *         timestamp: <unix ms>,
 *         message:   { mid: '<msg-id>', text: '<body>' }
 *       }]
 *     }]
 *   }
 *
 * A single POST can contain multiple `entry` items and each entry can
 * contain multiple messaging events (Meta batches when they can). We
 * process them all in a single request.
 *
 * Dedup: `external_message_id` on the messages table has a UNIQUE
 * constraint on `mid`. If Meta re-delivers (which they do on any
 * non-2xx response and occasionally at random), the second INSERT
 * silently no-ops.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { getDb } from '../_db.js';

// Message events besides plain text (echoes, deleted, reactions, etc.)
// arrive on the same webhook — we ignore anything without a text body
// for MVP. If we ever want to react to attachments / stickers, add
// handling here.
interface IgMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
  };
}

interface IgWebhookEntry {
  id?: string;
  time?: number;
  messaging?: IgMessagingEvent[];
}

interface IgWebhookPayload {
  object?: string;
  entry?: IgWebhookEntry[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return handleVerification(req, res);
  }
  if (req.method === 'POST') {
    return handleMessageEvent(req, res);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * Meta calls this once per subscription. Echo back hub.challenge iff
 * hub.verify_token matches ours. Plaintext response (NOT JSON) — Meta
 * expects the raw challenge string as the response body.
 */
function handleVerification(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.IG_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    console.error('[inbox/ig-webhook] IG_WEBHOOK_VERIFY_TOKEN env var missing');
    return res.status(500).send('Server not configured');
  }
  const mode = firstQuery(req.query['hub.mode']);
  const token = firstQuery(req.query['hub.verify_token']);
  const challenge = firstQuery(req.query['hub.challenge']);
  if (mode !== 'subscribe' || token !== expected) {
    // Don't leak whether it was mode or token that failed.
    return res.status(403).send('Forbidden');
  }
  // Plaintext echo — Meta parses the response body as the challenge
  // value. Setting Content-Type explicitly since Vercel's default JSON
  // wrapping would break the handshake.
  res.setHeader('Content-Type', 'text/plain');
  return res.status(200).send(challenge ?? '');
}

/**
 * Process incoming message events. Signature-verify first, then store.
 * Reply generation is deferred to a later stage (fire-and-forget from
 * here — session 2's AI reply worker).
 */
async function handleMessageEvent(req: VercelRequest, res: VercelResponse) {
  const appSecret = process.env.IG_APP_SECRET;
  if (!appSecret) {
    console.error('[inbox/ig-webhook] IG_APP_SECRET env var missing');
    // 500 here means Meta will retry — worth it so we don't silently
    // drop messages during a config failure.
    return res.status(500).json({ error: 'Server not configured' });
  }

  // Vercel parses JSON bodies automatically, but signature verification
  // needs the RAW bytes because Meta's HMAC is over the exact string
  // they sent. If we hash the re-serialized JSON, whitespace / key-
  // ordering differences will break the check.
  const rawBody = await readRawBody(req);
  const providedSig = req.headers['x-hub-signature-256'];
  if (typeof providedSig !== 'string' || !verifySignature(rawBody, providedSig, appSecret)) {
    // Return 403 for bad signatures rather than 401 — Meta uses 4xx to
    // stop retrying, which is what we want here (a bad-signature POST
    // is almost certainly not from Meta at all).
    console.warn('[inbox/ig-webhook] signature verification FAILED');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  let payload: IgWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('[inbox/ig-webhook] JSON parse failed:', err);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Only care about Instagram-object webhooks. Meta may share the
  // endpoint if we ever add other object types (facebook page, etc.).
  if (payload.object !== 'instagram') {
    return res.status(200).json({ ignored: 'non-instagram object' });
  }

  // Persist FIRST, respond FAST. Meta expects a 200 within ~5s or
  // it treats the webhook as failed and retries. Any long work
  // (AI reply generation) MUST happen after we return.
  try {
    await persistEvents(payload);
  } catch (err) {
    console.error('[inbox/ig-webhook] persist failed:', err);
    // 500 → Meta retries; the UNIQUE constraint on external_message_id
    // makes the retry idempotent.
    return res.status(500).json({ error: 'Persist failed' });
  }

  return res.status(200).json({ ok: true });
}

/**
 * Walk the payload's nested entries → messaging events, upsert one
 * conversation per unique sender, insert one message per event. All
 * within a single Neon roundtrip loop.
 */
async function persistEvents(payload: IgWebhookPayload) {
  const sql = getDb();
  const events = (payload.entry ?? []).flatMap((e) => e.messaging ?? []);

  for (const evt of events) {
    // Ignore echoes (messages WE sent, which Meta bounces back on the
    // webhook so integrations can display outbound sends). We already
    // know when we send our own replies; storing echoes would cause
    // duplicate rows.
    if (evt.message?.is_echo) continue;

    // Text-only for MVP. Attachments / reactions / typing indicators
    // arrive on the same webhook and are skipped here.
    const text = evt.message?.text;
    const mid = evt.message?.mid;
    const senderId = evt.sender?.id;
    if (!text || !mid || !senderId) continue;

    const sentAt = evt.timestamp
      ? new Date(evt.timestamp).toISOString()
      : new Date().toISOString();

    // Upsert conversation keyed on (platform, external_user_id). If a
    // conversation for this IGSID already exists, we get its id back
    // without touching any other fields (name, ai_enabled, notes,
    // etc.). If it's new, we insert and get the fresh id.
    const convoRows = (await sql`
      INSERT INTO conversations (platform, external_user_id)
      VALUES ('instagram', ${senderId})
      ON CONFLICT (platform, external_user_id) DO UPDATE
        SET external_user_id = EXCLUDED.external_user_id
      RETURNING id
    `) as Array<{ id: string }>;
    const conversationId = convoRows[0]?.id;
    if (!conversationId) continue;

    // Insert the message. The UNIQUE constraint on external_message_id
    // makes this idempotent — Meta's re-deliveries silently no-op.
    await sql`
      INSERT INTO messages (
        conversation_id, direction, sender, body,
        external_message_id, sent_at
      )
      VALUES (
        ${conversationId}, 'inbound', 'contact', ${text},
        ${mid}, ${sentAt}
      )
      ON CONFLICT (external_message_id) DO NOTHING
    `;
  }
}

function verifySignature(rawBody: Buffer, providedHeader: string, appSecret: string): boolean {
  const expected = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')}`;
  // Length check first so timingSafeEqual doesn't throw on mismatched
  // buffer sizes (which happens if someone sends a completely wrong-
  // format header).
  if (providedHeader.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedHeader),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

/**
 * Vercel's Node runtime auto-parses JSON request bodies, which strips
 * the raw bytes we need for signature verification. This helper
 * re-serializes from the parsed body when Vercel already parsed
 * (the common path), and reads from the raw stream as a fallback.
 * Not perfect — the re-serialized version may not byte-match if Meta
 * used a non-canonical JSON formatting — but works for the current
 * Instagram payload shape, which is compact JSON.
 *
 * For a fully bulletproof implementation we'd need to disable
 * Vercel's body parser (export config = { api: { bodyParser: false } })
 * and read the raw stream. Doing that now to avoid signature-mismatch
 * surprises later.
 */
async function readRawBody(req: VercelRequest): Promise<Buffer> {
  // If Vercel already parsed the body (which it does by default), we
  // won't have access to the raw stream. Guard: if `req.body` is
  // present and is an object/string, re-serialize it. Otherwise stream.
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
    return Buffer.from(JSON.stringify(req.body), 'utf8');
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function firstQuery(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

// Tell Vercel to give us the raw body instead of auto-parsing — we
// need the exact bytes for signature verification. See the
// readRawBody() docstring for why.
export const config = {
  api: {
    bodyParser: false,
  },
};
