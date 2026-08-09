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
 *   Meta signs the raw request body with the app secret and sends it as
 *   `X-Hub-Signature-256: sha256=<hex>`. We recompute the HMAC over the
 *   raw body using IG_APP_SECRET and constant-time compare. Never trust
 *   an unsigned or mis-signed payload — the URL is public and anyone
 *   could POST fake messages otherwise.
 *
 *   ⚠️  IMPORTANT: IG_APP_SECRET must be the INSTAGRAM App secret, not
 *   the parent Facebook App secret. Meta creates a nested "Instagram
 *   App" (with its OWN app ID + secret, e.g. "vero-photography-feed-IG")
 *   inside the parent Facebook App. Meta signs Instagram webhook payloads
 *   with the Instagram App's secret. If you paste the Facebook App
 *   secret here by mistake (they're both under "App Settings → Basic",
 *   easy to confuse), every webhook returns 403 signature failure. Find
 *   the Instagram App secret at:
 *   dashboard → Instagram API use-case setup → top row → "The Secret of
 *   the Instagram App" → Show.
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
import getRawBody from 'raw-body';
import { getDb } from '../_db.js';
import { processInboundMessage } from '../_ai-reply.js';

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
  let rawBody: Buffer;
  let bodySource: 'stream' | 'parsed-object' | 'parsed-buffer' | 'parsed-string';
  try {
    const result = await readRawBody(req);
    rawBody = result.body;
    bodySource = result.source;
  } catch (err) {
    console.error('[inbox/ig-webhook] failed to read raw body:', err);
    return res.status(500).json({ error: 'Body read failed' });
  }

  const providedSig = req.headers['x-hub-signature-256'];
  if (typeof providedSig !== 'string') {
    console.warn('[inbox/ig-webhook] missing X-Hub-Signature-256 header');
    return res.status(403).json({ error: 'Invalid signature' });
  }
  const expectedSig = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')}`;
  const sigsMatch = safeEqual(providedSig, expectedSig);

  if (!sigsMatch) {
    // Diagnostic logging — masked so we don't leak secrets into logs.
    // First 4 chars of both signatures + secret prefix + body-source
    // + body length is enough to pinpoint mismatches without exposing
    // sensitive material. Remove after we've confirmed signatures work.
    console.warn(
      `[inbox/ig-webhook] signature verification FAILED ` +
        `bodySource=${bodySource} ` +
        `bodyLen=${rawBody.length} ` +
        `secretPrefix=${appSecret.slice(0, 4)}… ` +
        `expectedPrefix=${expectedSig.slice(7, 15)}… ` +
        `providedPrefix=${providedSig.slice(7, 15)}…`,
    );
    return res.status(403).json({ error: 'Invalid signature' });
  }

  let payload: IgWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('[inbox/ig-webhook] JSON parse failed:', err);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Diagnostic: log the shape of every payload we receive so we can
  // trace what Meta is (or isn't) sending. We describe the shape
  // structurally without dumping user content — enough to know
  // "this was a messaging_seen from user X" without leaking DM text.
  const shape = describePayloadShape(payload);
  console.log(`[inbox/ig-webhook] received ${shape}`);

  // Only care about Instagram-object webhooks. Meta may share the
  // endpoint if we ever add other object types (facebook page, etc.).
  if (payload.object !== 'instagram') {
    console.log(`[inbox/ig-webhook] ignored — object='${payload.object}' (not 'instagram')`);
    return res.status(200).json({ ignored: 'non-instagram object' });
  }

  // Persist FIRST, respond FAST. Meta expects a 200 within ~5s or
  // it treats the webhook as failed and retries. Any long work
  // (AI reply generation) MUST happen after we return.
  let persistStats: PersistStats;
  try {
    persistStats = await persistEvents(payload);
  } catch (err) {
    console.error('[inbox/ig-webhook] persist failed:', err);
    // 500 → Meta retries; the UNIQUE constraint on external_message_id
    // makes the retry idempotent.
    return res.status(500).json({ error: 'Persist failed' });
  }

  console.log(
    `[inbox/ig-webhook] persist result: ` +
      `stored=${persistStats.stored} ` +
      `processed_echo=${persistStats.processedEcho} ` +
      `skipped_no_text=${persistStats.skippedNoText} ` +
      `skipped_no_message_field=${persistStats.skippedNoMessageField}`,
  );

  // Trigger the AI reply pipeline for each newly-stored inbound
  // message. Runs inline (before we return 200) — total budget for
  // signature verify + persist + AI generation + IG send is ~3-4s,
  // comfortably under Meta's 5s webhook timeout. If we ever start
  // exceeding, Meta retries; our dedup logic (checking for an
  // outbound message after this inbound's sent_at) makes retries
  // no-op idempotently rather than double-replying.
  //
  // The AI reply function never throws; it returns a structured
  // result we log for observability without crashing the webhook.
  for (const stored of persistStats.storedMessages) {
    try {
      const result = await processInboundMessage({
        conversationId: stored.conversationId,
        inboundMessageId: stored.messageId,
        inboundSentAt: stored.sentAt,
      });
      console.log(
        `[inbox/ig-webhook] ai-reply action=${result.action}` +
          (result.reason ? ` reason="${result.reason}"` : ''),
      );
    } catch (err) {
      // processInboundMessage shouldn't throw, but belt-and-suspenders
      // — never let a reply failure break the webhook 200.
      console.error('[inbox/ig-webhook] ai-reply threw:', err);
    }
  }

  return res.status(200).json({ ok: true });
}

/**
 * Describe a webhook payload's shape without dumping content.
 * Instagram DMs are private user messages — logging raw text would
 * be a privacy leak. Structural description is enough to diagnose
 * "which subscription field fired + how many events."
 */
function describePayloadShape(payload: IgWebhookPayload): string {
  const objectStr = payload.object ?? '(no object)';
  const entries = payload.entry ?? [];
  const entryCount = entries.length;
  // Meta's Instagram webhook mixes "messaging" events and "changes"
  // events. Message events go in entry[].messaging[]. Field events
  // (comments, message_reactions, etc.) go in entry[].changes[] with
  // a `field` name. We describe both.
  const messagingCount = entries.reduce((acc, e) => acc + (e.messaging?.length ?? 0), 0);
  const changesFields = entries.flatMap((e) => {
    const changes = (e as unknown as { changes?: Array<{ field?: string }> }).changes ?? [];
    return changes.map((c) => c.field ?? 'unknown');
  });
  return (
    `object=${objectStr} entries=${entryCount} ` +
    `messaging_events=${messagingCount} ` +
    `change_fields=[${changesFields.join(',')}]`
  );
}

interface StoredMessageRef {
  conversationId: string;
  messageId: string;
  sentAt: string;
}

interface PersistStats {
  stored: number;
  processedEcho: number;
  skippedNoText: number;
  skippedNoMessageField: number;
  // References to the actual DB rows created — used by the caller to
  // trigger AI reply generation for each new inbound. Empty on
  // no-op / all-skipped payloads (e.g., only echoes or reactions).
  storedMessages: StoredMessageRef[];
}

/**
 * Walk the payload's nested entries → messaging events, upsert one
 * conversation per unique sender, insert one message per event. All
 * within a single Neon roundtrip loop.
 *
 * Returns counters so the caller can log a per-event summary — useful
 * for tracing "we received 3 events, stored 1, skipped 2 for reason X"
 * without dumping raw payload content.
 */
async function persistEvents(payload: IgWebhookPayload): Promise<PersistStats> {
  const sql = getDb();
  const events = (payload.entry ?? []).flatMap((e) => e.messaging ?? []);
  const stats: PersistStats = {
    stored: 0,
    processedEcho: 0,
    skippedNoText: 0,
    skippedNoMessageField: 0,
    storedMessages: [],
  };

  for (const evt of events) {
    // If there's no `message` field at all, this is a non-message
    // event (delivery receipt, seen receipt, postback, etc.) that
    // slipped through under the `messaging` array. Skip.
    if (!evt.message) {
      stats.skippedNoMessageField++;
      continue;
    }

    // Echo events fire when Vero (or anyone with access to her IG
    // account) sends a message from the Instagram app directly,
    // NOT through our admin panel. We store them as outbound
    // 'human' messages so the admin thread reflects the full
    // conversation — otherwise Vero's own replies from her phone
    // silently vanish from the transcript. Dedup with admin-panel
    // sends happens automatically via the UNIQUE constraint on
    // external_message_id (both paths write the same `mid`).
    const isEcho = Boolean(evt.message.is_echo);

    // Text-only for MVP. Attachments / reactions / typing indicators
    // arrive on the same webhook and are skipped here.
    const text = evt.message.text;
    const mid = evt.message.mid;
    // For a normal inbound, the customer is the sender. For an echo,
    // Vero is the sender and the customer is the recipient — so the
    // customer's IGSID (which keys the conversation) is on
    // recipient.id for echoes.
    const customerIgsid = isEcho ? evt.recipient?.id : evt.sender?.id;
    if (!text || !mid || !customerIgsid) {
      stats.skippedNoText++;
      continue;
    }

    const sentAt = evt.timestamp
      ? new Date(evt.timestamp).toISOString()
      : new Date().toISOString();

    // Upsert conversation keyed on (platform, external_user_id). If a
    // conversation for this IGSID already exists, we get its id back
    // without touching any other fields (name, ai_enabled, notes,
    // etc.). If it's new, we insert and get the fresh id.
    const convoRows = (await sql`
      INSERT INTO conversations (platform, external_user_id)
      VALUES ('instagram', ${customerIgsid})
      ON CONFLICT (platform, external_user_id) DO UPDATE
        SET external_user_id = EXCLUDED.external_user_id
      RETURNING id
    `) as Array<{ id: string }>;
    const conversationId = convoRows[0]?.id;
    if (!conversationId) continue;

    const direction = isEcho ? 'outbound' : 'inbound';
    const sender = isEcho ? 'human' : 'contact';

    // Insert the message. The UNIQUE constraint on external_message_id
    // makes this idempotent — Meta's re-deliveries silently no-op AND
    // admin-panel sends dedup against later echoes for the same mid.
    // ON CONFLICT ... RETURNING returns NO row on conflict, which is
    // exactly what we want here: retries + echo-after-admin-send
    // don't create duplicates.
    const inserted = (await sql`
      INSERT INTO messages (
        conversation_id, direction, sender, body,
        external_message_id, sent_at
      )
      VALUES (
        ${conversationId}, ${direction}, ${sender}, ${text},
        ${mid}, ${sentAt}
      )
      ON CONFLICT (external_message_id) DO NOTHING
      RETURNING id
    `) as Array<{ id: string }>;

    if (inserted.length > 0) {
      stats.stored++;
      if (isEcho) {
        // Track echoes separately for observability but NOT for
        // AI-reply triggering — Vero replying from her phone
        // shouldn't spawn a bot reply on top of her own.
        stats.processedEcho++;
      } else {
        stats.storedMessages.push({
          conversationId,
          messageId: inserted[0].id,
          sentAt,
        });
      }
    }
  }

  return stats;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Read the exact raw request body bytes for HMAC signature verification.
 *
 * Preferred path: `raw-body` package reads the stream directly, giving
 * us bytes identical to what Meta sent. This is what we WANT.
 *
 * Fallback paths (bad news if we hit them): Vercel's Node runtime
 * sometimes parses the body BEFORE our handler runs, populating
 * `req.body` and consuming the stream. When that happens `raw-body`
 * throws "stream already read". We fall back to whatever's in
 * `req.body`, but the re-serialized JSON almost certainly won't byte-
 * match Meta's original — signature verification will fail even with
 * the correct secret. Not much we can do about that at the code
 * level; it's a runtime quirk.
 *
 * We tell the caller which path we took so diagnostic logging can
 * pinpoint the source when signatures mismatch.
 */
async function readRawBody(
  req: VercelRequest,
): Promise<{ body: Buffer; source: 'stream' | 'parsed-object' | 'parsed-buffer' | 'parsed-string' }> {
  // Attempt raw stream read first. raw-body handles the stream
  // lifecycle correctly (length limits, encoding, cleanup) and gives
  // us exact bytes.
  try {
    const body = await getRawBody(req, {
      // No length cap of our own — Meta's webhook payloads are small.
      // If they ever balloon we can tighten this to something like 1mb.
      encoding: null, // return Buffer, not decoded string
    });
    return { body, source: 'stream' };
  } catch (streamErr) {
    // Stream unavailable (Vercel already consumed it via its own
    // parser). Fall back to whatever's in req.body.
    console.warn(
      `[inbox/ig-webhook] raw-body stream read failed, falling back to req.body: ${
        (streamErr as Error).message
      }`,
    );
  }

  if (req.body === undefined || req.body === null) {
    // Vercel parsed but req.body is empty — weird case, treat as
    // empty payload.
    return { body: Buffer.from(''), source: 'parsed-object' };
  }
  if (Buffer.isBuffer(req.body)) {
    return { body: req.body, source: 'parsed-buffer' };
  }
  if (typeof req.body === 'string') {
    return { body: Buffer.from(req.body, 'utf8'), source: 'parsed-string' };
  }
  // Object — re-serialize (likely won't byte-match Meta's original).
  return {
    body: Buffer.from(JSON.stringify(req.body), 'utf8'),
    source: 'parsed-object',
  };
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
