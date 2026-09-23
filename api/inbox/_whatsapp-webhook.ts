/**
 * WhatsApp messages, into the same inbox as everything else.
 *
 * Deliberately built to be IDENTICAL whichever way the number question lands.
 * There are two ways Vero's WhatsApp can reach the Cloud API:
 *
 *   MIGRATE   her existing number is registered to the Cloud API. Self-serve,
 *             no business verification. The number stops working in the
 *             WhatsApp Business app on her phone and its history goes.
 *   COEXIST   the app on her phone AND the API at once. Keeps the number, the
 *             contacts and about six months of history, and needs Tech
 *             Provider status, Classic Business Verification and App Review.
 *             It also attaches the API as a companion device, which is where
 *             the roughly 13-day "open the app" chore comes from.
 *
 * NOTHING BELOW DEPENDS ON WHICH. Both deliver the same webhook payload to
 * the same endpoint with the same signature scheme. The only difference is
 * which credentials go in the environment, and coexistence additionally sends
 * `smb_message_echoes` for messages Vero sends from her own phone, which this
 * already handles as outbound. So this ships now and the decision changes
 * nothing here.
 *
 * ── THE SHAPE ────────────────────────────────────────────────────────────
 *
 * Mirrors api/inbox/_ig-webhook.ts closely and on purpose: same GET
 * verification handshake, same X-Hub-Signature-256 over the RAW body, same
 * persist-first-ack-fast ordering, same idempotency through the unique
 * constraint on external_message_id. A reader who knows one knows the other.
 *
 * ── WHAT IS DIFFERENT FROM INSTAGRAM, AND WHY IT MATTERS ─────────────────
 *
 * A WhatsApp sender is a PHONE NUMBER, not an opaque id. That is the whole
 * reason migration 037 put client_phone on client_portals and called it "the
 * join key for the WhatsApp and SMS work": a wa_id and a stored number are
 * the same person when they normalise to the same E.164, and both sides were
 * proven by possession rather than guessed. So this links the conversation to
 * a client automatically, which is something the Instagram path can never do
 * because an IGSID and an email share no identifier.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────
 *
 * It does not auto-reply. The Instagram path runs an AI reply after acking;
 * this does not, and will not until Alex asks for it. WhatsApp is where her
 * actual clients reach her about real bookings, the 24-hour service window
 * makes a mistimed automated message expensive as well as wrong, and this
 * repo has an incident on file about an assistant mailing a real customer.
 * Inbound lands in the inbox and a person answers it.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import getRawBody from 'raw-body';
import { getDb } from '../_db.js';
// .js extension is load bearing: an extensionless relative import in anything
// api/ reaches kills the whole admin API at runtime while the build passes.
import { toE164, toWaId } from '../../src/utils/phoneFromText.js';

const firstQuery = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

interface WaMessage {
  id?: string;
  /** Who SENT it. On an echo that is Vero, not the client. See counterparty(). */
  from?: string;
  /** Who it was sent TO. Present on echoes; absent on inbound. */
  to?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  [k: string]: unknown;
}

interface WaValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: WaMessage[];
  /** Coexistence: what Vero sent from her own phone. */
  message_echoes?: WaMessage[];
  statuses?: Array<{ id?: string; status?: string }>;
}

interface WaPayload {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: WaValue }> }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return verifySubscription(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return receive(req, res);
}

/**
 * Meta's one-time subscription handshake. Echo hub.challenge in PLAINTEXT
 * when the token matches, and say nothing useful when it does not.
 */
function verifySubscription(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const mode = firstQuery(req.query['hub.mode']);
  const token = firstQuery(req.query['hub.verify_token']);
  const challenge = firstQuery(req.query['hub.challenge']);

  if (!expected) {
    console.error('[inbox/whatsapp-webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN missing');
    return res.status(500).json({ error: 'Not configured' });
  }
  if (mode === 'subscribe' && token === expected && challenge) {
    console.log('[inbox/whatsapp-webhook] subscription verified');
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(challenge);
  }
  console.warn('[inbox/whatsapp-webhook] verification refused');
  return res.status(403).json({ error: 'Forbidden' });
}

async function receive(req: VercelRequest, res: VercelResponse) {
  /**
   * The app secret, and WHICH app secret.
   *
   * Meta's Instagram product creates a NESTED app with its OWN secret, and
   * using the parent Facebook one there makes every webhook 403. WhatsApp
   * hangs off the parent app, so this is the PARENT secret and is a separate
   * variable from IG_APP_SECRET on purpose: one of them being wrong should
   * never be able to silently fix or break the other.
   */
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error('[inbox/whatsapp-webhook] WHATSAPP_APP_SECRET missing');
    return res.status(500).json({ error: 'Not configured' });
  }

  // The RAW bytes. Vercel's Node runtime does not reliably honour
  // `bodyParser: false` from an imported module, and JSON.stringify of a
  // parsed body does NOT byte-match what Meta signed, so the signature would
  // fail for reasons nobody could see. raw-body reads the stream exactly.
  let rawBody: Buffer;
  try {
    rawBody = await getRawBody(req, { limit: '2mb' });
  } catch (err) {
    console.error('[inbox/whatsapp-webhook] raw body read failed:', err);
    return res.status(400).json({ error: 'Bad body' });
  }

  const header = req.headers['x-hub-signature-256'];
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided) {
    console.warn('[inbox/whatsapp-webhook] missing X-Hub-Signature-256');
    return res.status(401).json({ error: 'Unsigned' });
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual THROWS on a length mismatch, and a
  // throw here would be a 500 where a 401 is meant.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.warn(`[inbox/whatsapp-webhook] signature mismatch, bodyLen=${rawBody.length}`);
    return res.status(401).json({ error: 'Bad signature' });
  }

  let payload: WaPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as WaPayload;
  } catch (err) {
    console.error('[inbox/whatsapp-webhook] JSON parse failed:', err);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (payload.object !== 'whatsapp_business_account') {
    console.log(`[inbox/whatsapp-webhook] ignored, object='${payload.object}'`);
    return res.status(200).json({ ignored: 'non-whatsapp object' });
  }

  // Persist first, ack fast. Meta wants a 200 inside about 20 seconds or it
  // starts treating us as an unhealthy subscriber and batching deliveries.
  try {
    const stats = await persist(payload);
    console.log(
      `[inbox/whatsapp-webhook] stored=${stats.stored} echoes=${stats.echoes} ` +
        `linked=${stats.linked} skipped_no_text=${stats.skippedNoText} ` +
        `statuses=${stats.statuses}`,
    );
  } catch (err) {
    console.error('[inbox/whatsapp-webhook] persist failed:', err);
    // 500 makes Meta retry, and the unique constraint on
    // external_message_id makes the retry a no-op.
    return res.status(500).json({ error: 'Persist failed' });
  }

  return res.status(200).json({ ok: true });
}

interface Stats {
  stored: number;
  echoes: number;
  linked: number;
  skippedNoText: number;
  statuses: number;
}

async function persist(payload: WaPayload): Promise<Stats> {
  const sql = getDb();
  const stats: Stats = { stored: 0, echoes: 0, linked: 0, skippedNoText: 0, statuses: 0 };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      if (value.statuses?.length) stats.statuses += value.statuses.length;

      // Name from the contacts block, when Meta sends one. It is the person's
      // WhatsApp profile name, which is the best display name available.
      //
      // Kept beside the wa_id it belongs to, and applied only to that thread.
      // An echo payload carries a contacts block too, and writing its name
      // onto whichever conversation the loop happens to be on would label a
      // thread with a different person's name.
      const contactWaId = normaliseWa(value.contacts?.[0]?.wa_id);
      const profileName = value.contacts?.[0]?.profile?.name?.trim() || null;

      const inbound = (value.messages ?? []).map((m) => ({ m, echo: false }));
      const echoes = (value.message_echoes ?? []).map((m) => ({ m, echo: true }));

      for (const { m, echo } of [...inbound, ...echoes]) {
        // THE CLIENT'S number, never Vero's.
        //
        // On an inbound message `from` is the client. On an echo it is the
        // business, and the client is in `to`. Keying on `from` either way
        // would open a conversation with Vero's own number as the contact,
        // file her replies into it, and leave the client's real thread
        // missing exactly the messages she sent from her phone, which is
        // the one thing Coexistence exists to capture.
        const waId = (echo ? m.to : m.from)?.trim();
        const mid = m.id?.trim();
        if (!waId || !mid) continue;

        // Text only for now. A photo or a voice note still needs a row so the
        // thread is not silently incomplete, so it gets a placeholder rather
        // than being dropped: a gap in a transcript is worse than a line
        // saying what arrived.
        const text =
          typeof m.text?.body === 'string' && m.text.body.trim()
            ? m.text.body
            : m.type && m.type !== 'text'
              ? `[${m.type}]`
              : '';
        if (!text) {
          stats.skippedNoText++;
          continue;
        }

        // ONE normalisation, shared with the extractor and the dialling
        // helpers, so a stored number and a wa_id are compared after exactly
        // the same transformation. That is the whole reason toWaId exists.
        // A wa_id with no digits in it is not a number, and a conversation
        // keyed on '' would collect every such message into one thread.
        const normalised = normaliseWa(waId);
        if (!normalised) continue;

        // Only when the profile name is demonstrably this person's.
        const name = contactWaId && contactWaId === normalised ? profileName : null;

        const convoRows = (await sql`
          INSERT INTO conversations (platform, external_user_id, contact_name)
          VALUES ('whatsapp', ${normalised}, ${name})
          ON CONFLICT (platform, external_user_id) DO UPDATE
            SET contact_name = COALESCE(conversations.contact_name, EXCLUDED.contact_name)
          RETURNING id, linked_client_portal_id
        `) as Array<{ id: string; linked_client_portal_id: string | null }>;
        const conversationId = convoRows[0]?.id;
        if (!conversationId) continue;

        /**
         * Link the thread to a client, by number.
         *
         * Migration 037 called client_phone "the join key for the WhatsApp
         * and SMS work: a verified E.164 on one channel matching a verified
         * E.164 on the other is the single identity signal safe enough to
         * link automatically, since both sides were proven by possession
         * rather than inferred". This is that link.
         *
         * Only when nothing is linked yet, and only on an EXACT normalised
         * match. It never overwrites a link a person made, and it never
         * guesses from a partial number.
         */
        if (!convoRows[0].linked_client_portal_id) {
          const e164 = toE164(waId);
          if (e164) {
            const match = (await sql`
              SELECT id FROM client_portals
               WHERE client_phone IS NOT NULL
                 AND regexp_replace(client_phone, '[^0-9]', '', 'g') IN (${e164.slice(1)}, ${e164.slice(2)})
               LIMIT 2
            `) as Array<{ id: string }>;
            // Exactly one, or not at all. Two clients sharing a number is a
            // couple, and picking one of them would be a coin toss printed
            // on a booking.
            if (match.length === 1) {
              await sql`
                UPDATE conversations
                   SET linked_client_portal_id = ${match[0].id}
                 WHERE id = ${conversationId} AND linked_client_portal_id IS NULL
              `;
              stats.linked++;
            }
          }
        }

        const sentAt = m.timestamp
          ? new Date(Number(m.timestamp) * 1000).toISOString()
          : new Date().toISOString();

        const inserted = (await sql`
          INSERT INTO messages (
            conversation_id, direction, sender, channel, body,
            external_message_id, sent_at
          )
          VALUES (
            ${conversationId}, ${echo ? 'outbound' : 'inbound'},
            ${echo ? 'human' : 'contact'}, 'whatsapp', ${text},
            ${mid}, ${sentAt}
          )
          ON CONFLICT (external_message_id) DO NOTHING
          RETURNING id
        `) as Array<{ id: string }>;

        if (inserted.length > 0) {
          if (echo) stats.echoes++;
          else stats.stored++;
        }
      }
    }
  }

  return stats;
}

/**
 * The one way a WhatsApp number becomes a key.
 *
 * toWaId is the shared normaliser, and its refusals are deliberate: it
 * returns null for anything it cannot prove is a phone number. A wa_id from
 * Meta is always real, so falling back to the bare digits keeps a valid
 * international number that toE164's North-America-shaped rules do not
 * recognise from being dropped on the floor.
 */
function normaliseWa(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  return toWaId(s) ?? (s.replace(/\D/g, '') || null);
}

/**
 * Inert here; api/inbox.ts is the file Vercel reads this from. Declared so a
 * reader who opens this file directly knows the body is unparsed.
 */
export const config = { api: { bodyParser: false } };
