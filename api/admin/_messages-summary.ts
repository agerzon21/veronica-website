/**
 * Admin: generate an AI-powered summary of a conversation so Vero
 * can glance at the top of a thread and immediately know what the
 * customer is asking about, what info's been gathered, whether it's
 * even worth her time, and what her next step should be — without
 * reading the full message history.
 *
 * POST { password, conversationId, force? }
 *   → 200 { success, summary, cached }
 *   → 400 missing conversationId
 *   → 401 wrong password
 *   → 404 conversation not found
 *   → 502 upstream OpenAI error
 *
 * `cached: true` in the response means we hit the DB cache (no
 * OpenAI call, instant) — the frontend can use this if it ever
 * wants to show "cached / regenerated" state; for now it's
 * informational.
 *
 * `force: true` in the body bypasses the cache and always
 * regenerates. Wired to the Regenerate button in the admin UI so
 * Vero can force a fresh summary if the AI output was off.
 *
 * Cache invalidation strategy: "check at read time" via the message
 * id of the latest message. Each cache entry records which message
 * was latest when the summary was made; if a newer message has
 * arrived since (either an inbound reply from the customer or an
 * outbound one from Vero / the AI), we regenerate. Same message
 * id = safe to serve cache.
 *
 * `classification` — one of booking-inquiry, existing-client,
 *              general-question, collaboration-offer, personal, spam-or-unrelated,
 *              unclear. Lets Vero see at a glance whether to engage.
 * `asking` — one sentence: what the customer is fundamentally asking for
 * `gathered` — array of specific facts the customer has shared (dates,
 *              locations, session types, headcounts, styles they like,
 *              constraints, etc.) — empty array if nothing specific yet
 * `nextStep` — one sentence: what Vero should do next (confirm date,
 *              send package options, ask a specific missing question,
 *              or ignore if spam)
 * `tone` — one word describing the customer's energy (enthusiastic,
 *          hesitant, price-sensitive, casual, urgent, formal)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { FROM_ADDRESS } from '../_auto-reply.js';

const MODEL = 'gpt-4o-mini';

/**
 * Bump whenever the booking spec or the transcript we send the model changes.
 *
 * A cached summary is otherwise only rebuilt when a NEW MESSAGE ARRIVES, so a
 * thread that has gone quiet serves its old "Still needed" list forever. That
 * is exactly how the pre-`booking` rows survived long enough for Vero to be
 * looking at one. A version number rather than a presence check on some key,
 * because presence checks only ever retire one generation.
 */
const SUMMARY_VERSION = 2;

let cachedClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (cachedClient) return cachedClient;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY env var missing');
  cachedClient = new OpenAI({ apiKey: key });
  return cachedClient;
}

interface MessageRow {
  direction: 'inbound' | 'outbound';
  sender: 'contact' | 'ai' | 'human';
  body: string;
  sent_at: string;
}

type Classification =
  | 'booking-inquiry'
  | 'existing-client'
  | 'general-question'
  | 'collaboration-offer'
  | 'personal'
  | 'spam-or-unrelated'
  | 'unclear';

const VALID_CLASSIFICATIONS: readonly Classification[] = [
  'booking-inquiry',
  'existing-client',
  'general-question',
  'collaboration-offer',
  'personal',
  'spam-or-unrelated',
  'unclear',
] as const;

/**
 * Identity the platform hands us that the message bodies never carry.
 *
 * An email thread knows the customer's address before a single word is typed:
 * conversations.external_user_id IS the lowercased From address, and it is the
 * exact string every reply is delivered to. The model only ever saw
 * `${role}: ${body}`, so it could not know that, and duly told Vero to ask a
 * client for the address she was already writing to.
 */
interface ThreadContact {
  /** The customer's email address, when the platform knows it. Null on Instagram. */
  address: string | null;
  /** Display name from the platform, when there is one. */
  name: string | null;
  platform: string | null;
}

interface LocalizedSummary {
  asking: string;
  gathered: string[];
  missing: string[];
  nextStep: string;
}

/**
 * The details a contract and a client portal actually need, as data rather
 * than prose. The model fills each one or leaves it null; it never writes the
 * "Still needed" list itself.
 *
 * WHY THIS IS STRUCTURED
 *
 * `gathered` and `missing` used to be two independent free-text lists from one
 * pass, with nothing tying them together, so the model could contradict
 * itself — and did: one summary listed "Client name: Daria Klabun" and
 * "Groom's name: Tufan Akshahin" under gathered while simultaneously asking
 * for both under missing, having decided a name in a chat was not a "full
 * legal name". No prompt wording makes that reliably impossible.
 *
 * With one set of keys, "present" and "missing" are the same fact read two
 * ways: the list below is computed from whichever values came back null. A
 * field cannot appear in both, because there is only one of it.
 *
 * These values are also what prefills the new-client form, which is the other
 * reason they are typed data and not sentences.
 */
export interface BookingFields {
  session_type: string | null;
  event_date: string | null;
  event_time: string | null;
  event_location: string | null;
  client_full_name: string | null;
  partner_full_name: string | null;
  client_email: string | null;
  total_amount: string | null;
  retainer_amount: string | null;
  /**
   * Verbatim source sentences for the two values that cost money to get
   * wrong. Real threads renegotiate — one in this inbox contains $1,000,
   * $1,400 and $2,000 — so the form shows Vero what a figure came from
   * instead of silently filling in a number.
   */
  total_amount_quote: string | null;
  event_date_quote: string | null;
}

export const EMPTY_BOOKING: BookingFields = {
  session_type: null,
  event_date: null,
  event_time: null,
  event_location: null,
  client_full_name: null,
  partner_full_name: null,
  client_email: null,
  total_amount: null,
  retainer_amount: null,
  total_amount_quote: null,
  event_date_quote: null,
};

/** Session types where the contract names two people rather than one. */
const COUPLE_SESSION_TYPES = new Set(['wedding', 'engagement', 'elopement', 'anniversary']);

/**
 * What "Still needed" can list, in the order it renders. Labels live here in
 * both languages rather than coming back from the model, so the wording stays
 * identical between threads and between regenerations.
 */
const BOOKING_REQUIREMENTS: Array<{
  key: keyof BookingFields;
  en: string;
  ru: string;
  coupleOnly?: boolean;
}> = [
  { key: 'session_type', en: 'Type of session', ru: 'Тип съёмки' },
  { key: 'event_date', en: 'Event date', ru: 'Дата съёмки' },
  { key: 'event_time', en: 'Coverage hours', ru: 'Часы съёмки' },
  { key: 'event_location', en: 'Location', ru: 'Место съёмки' },
  { key: 'client_full_name', en: "Client's full name", ru: 'Полное имя клиента' },
  {
    key: 'partner_full_name',
    en: "Partner's full name",
    ru: 'Полное имя партнёра',
    coupleOnly: true,
  },
  { key: 'client_email', en: 'Client email address', ru: 'Электронная почта клиента' },
  { key: 'total_amount', en: 'Total price', ru: 'Итоговая стоимость' },
  { key: 'retainer_amount', en: 'Retainer amount', ru: 'Размер предоплаты' },
];

/** Only these threads are heading toward a contract; the rest need nothing. */
const BOOKING_CLASSIFICATIONS = new Set(['booking-inquiry', 'existing-client']);

export function computeMissing(
  booking: BookingFields,
  classification: Classification,
  locale: 'en' | 'ru',
): string[] {
  if (!BOOKING_CLASSIFICATIONS.has(classification)) return [];
  const couple = COUPLE_SESSION_TYPES.has(booking.session_type ?? '');
  return BOOKING_REQUIREMENTS.filter((f) => !f.coupleOnly || couple)
    .filter((f) => !booking[f.key])
    .map((f) => f[locale]);
}

interface Summary {
  classification: Classification;
  tone: string;
  // Bilingual copies. Old cached rows (pre-migration) still contain
  // flat `asking` / `gathered` / `nextStep` fields — we keep those
  // as optional so the frontend can fall back if `en`/`ru` are
  // missing on an old row.
  en: LocalizedSummary;
  ru: LocalizedSummary;
  // Language-neutral contract details. Optional because summaries cached
  // before this existed do not have it.
  booking?: BookingFields;
  // Which generation of the summariser wrote this row. Absent on every row
  // written before it existed, which is what retires them.
  summaryVersion?: number;
  // Legacy fields — populated on old cache rows, unused on new ones.
  // Kept in the type so the JSON round-trip stays lossless.
  asking?: string;
  gathered?: string[];
  missing?: string[];
  nextStep?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const conversationId =
    typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
  if (!conversationId) {
    return res.status(400).json({ success: false, error: 'conversationId is required' });
  }
  const force = Boolean(req.body?.force);

  try {
    const sql = getDb();

    // Cache check: fetch the cached summary + the id of the currently
    // latest message in the conversation in ONE roundtrip. If the
    // cached summary's message id matches, we can skip the OpenAI
    // call entirely.
    const cacheRows = (await sql`
      SELECT
        c.summary_json,
        c.summary_message_id,
        c.platform,
        c.external_user_id,
        c.contact_name,
        (
          SELECT id FROM messages
          WHERE conversation_id = c.id
          ORDER BY sent_at DESC
          LIMIT 1
        ) AS latest_message_id
      FROM conversations c
      WHERE c.id = ${conversationId}
      LIMIT 1
    `) as Array<{
      summary_json: Summary | null;
      summary_message_id: string | null;
      platform: string | null;
      external_user_id: string | null;
      contact_name: string | null;
      latest_message_id: string | null;
    }>;

    if (cacheRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    const cacheRow = cacheRows[0];
    if (!cacheRow.latest_message_id) {
      return res.status(404).json({
        success: false,
        error: 'Conversation has no messages',
      });
    }

    // Cache hit — nothing new since the last summary, no force flag, and the
    // cached row was written by this version of the summariser.
    //
    // That last condition matters. Summaries cached before `booking` existed
    // carry a "Still needed" list the MODEL wrote as free text, which is
    // exactly the thing that used to contradict the facts listed right above
    // it — one row named the client and her partner as gathered facts and then
    // asked for both again. Those rows are otherwise immortal: a summary is
    // only rebuilt when a new message arrives, so a settled thread would show
    // the old contradictory list indefinitely. Treating a row with no
    // `booking` as a miss retires them the first time anyone opens the thread.
    const cachedSchemaIsCurrent =
      (cacheRow.summary_json as Summary | null)?.summaryVersion === SUMMARY_VERSION;
    if (
      !force &&
      cachedSchemaIsCurrent &&
      cacheRow.summary_json &&
      cacheRow.summary_message_id === cacheRow.latest_message_id
    ) {
      return res
        .status(200)
        .json({ success: true, summary: cacheRow.summary_json, cached: true });
    }

    // Cache miss (or force). Pull the transcript, generate, save.
    const rows = (await sql`
      SELECT direction, sender, body, sent_at
      FROM messages
      -- Unsent drafts excluded. Without this the summariser treats an AI draft
      -- Vero never sent as something that was actually said, and states it back
      -- as fact. Live example found in the data: a conversation whose cached
      -- summary carries a price of 300 taken from an unsent draft, sitting next
      -- to the 200 that was really quoted. _assistant-chat.ts already filters
      -- this way, which is part of why the two disagree.
      WHERE conversation_id = ${conversationId} AND status <> 'draft'
      ORDER BY sent_at ASC
      LIMIT 100
    `) as MessageRow[];

    // For platform='email', conversations.external_user_id is the lowercased
    // From address and the exact string every reply is delivered to. On
    // Instagram it is an IGSID, so it stays null there and the email genuinely
    // does still need asking for.
    const rawAddress = cacheRow.platform === 'email' ? cacheRow.external_user_id : null;
    const contact: ThreadContact = {
      address:
        rawAddress && rawAddress.includes('@') && rawAddress.toLowerCase() !== FROM_ADDRESS
          ? rawAddress
          : null,
      name: cacheRow.contact_name,
      platform: cacheRow.platform,
    };
    const summary = await generateSummary(rows, contact);

    // Persist so the next request hits cache. If the latest message
    // id changed BETWEEN the SELECT above and this UPDATE (very
    // narrow race), we just cache with the older id — the next
    // request notices and regenerates. Not worth locking.
    await sql`
      UPDATE conversations
      SET
        summary_json = ${JSON.stringify(summary)}::jsonb,
        summary_message_id = ${cacheRow.latest_message_id},
        summary_generated_at = NOW(),
        -- A thread the classifier calls spam-or-unrelated should not get
        -- AI replies. Without this the assistant was drafting warm
        -- replies to marketing blasts, and those drafts surfaced as the
        -- inbox preview — making a thread Vero had never opened look
        -- like she had answered it.
        --
        -- Deliberately one-way: promotional switches AI OFF, but a
        -- non-promotional classification does NOT switch it back on.
        -- Vero turns AI off on real client threads when she wants to
        -- handle someone personally, and a summary refresh silently
        -- undoing that would start auto-replying to her client.
        ai_enabled = CASE
          WHEN ${summary.classification} = 'spam-or-unrelated' THEN FALSE
          ELSE ai_enabled
        END
      WHERE id = ${conversationId}
    `;

    return res.status(200).json({ success: true, summary, cached: false });
  } catch (err) {
    console.error('[admin/messages-summary] handler failed:', err);
    return res.status(502).json({ success: false, error: 'Summary generation failed' });
  }
}

async function generateSummary(
  messages: MessageRow[],
  contact: ThreadContact,
): Promise<Summary> {
  const client = getOpenAI();

  // Business timezone, not UTC. Vercel runs UTC, so on a weekday evening in ET
  // `toISOString()` is already tomorrow — enough to push a bare "the 12th" into
  // the wrong month at a boundary.
  const dayOf = (d: Date | string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(d));

  // Format the transcript for the model. Label sides clearly so the
  // model doesn't get confused about which side is the customer. Each line
  // carries its send date so a bare "October 7" can be resolved to a year
  // instead of coming back null.
  const transcript = messages
    .map((m) => {
      const role =
        m.direction === 'inbound'
          ? 'Customer'
          : m.sender === 'ai'
            ? 'AI Assistant'
            : 'Vero';
      return `[${dayOf(m.sent_at)}] ${role}: ${m.body}`;
    })
    .join('\n\n');

  // Fenced off as metadata so the model cannot mistake it for something a
  // person typed, while still being usable as a source of facts.
  const metaLines = [
    contact.platform ? `Channel: ${contact.platform}` : null,
    contact.address ? `Customer writes from: ${contact.address}` : null,
    contact.name ? `Customer display name: ${contact.name}` : null,
  ].filter(Boolean);
  const userContent = metaLines.length
    ? `--- THREAD METADATA (from the platform, not typed by anyone) ---\n${metaLines.join('\n')}\n--- CONVERSATION ---\n${transcript}`
    : transcript;

  const systemPrompt = `You are analyzing a conversation between a photography customer and a photographer's inbox (some replies come from the photographer's AI assistant, some from the photographer Vero personally). Produce a compact summary Vero can use to catch up on the thread at a glance AND immediately decide whether it's worth her time.

Vero speaks Russian natively but the admin panel is bilingual, so return the summary in BOTH English AND Russian. Classification and tone stay as machine-readable keys.

Today is ${dayOf(new Date())}. Every transcript line is prefixed with the date that message was sent. Use those dates ONLY to pin down the year or month of a day the thread already names. Never convert a vague reference such as "next summer" or "sometime in October" into a real date.

Return a JSON object with EXACTLY these keys:
- "classification": one string, EXACTLY one of:
    * "booking-inquiry" — real photography client asking about pricing/availability/sessions/weddings
    * "existing-client" — someone Vero is already working with (references a past shoot, a scheduled event, a delivered gallery, or is following up on something Vero personally started)
    * "general-question" — genuine but non-booking (e.g. asking about her camera gear, admiring her work with no ask)
    * "collaboration-offer" — a legitimate creative/brand collab proposal (rare — most "collab" DMs are actually spam)
    * "personal" — a friend or acquaintance writing to Vero as a person: a social invitation, plans, catching up, personal chat. Warm and specific to her as a human rather than as a business. This is NOT spam — do not label a friend spam.
    * "spam-or-unrelated" — solicitation, sales pitch, agency outreach (web design, SEO, marketing services, "your website is outdated", "we can help you"), crypto/investment, unrelated to photography, or template mass-DM. When in doubt between this and collaboration-offer, prefer this — real collabs are extremely rare.
    * "unclear" — you genuinely cannot tell (e.g. just "hey" with no prior context)
Fill "booking" BEFORE writing "gathered" — decide the facts first, then describe them. If a detail belongs in "gathered" while its key is still null, the NULL is the mistake: go back and fill the key. Never resolve the disagreement by dropping the fact from "gathered", which would hide the error rather than fix it.

- "tone": ONE WORD (English) describing the customer's tone. Options: enthusiastic, hesitant, curious, decisive, casual, formal, urgent, price-sensitive, promotional (for spam/agency pitches), unclear.
- "booking": an object holding the details needed to write a contract and open a client portal. This is DATA, not prose: do not translate it, do not add commentary, do not write "unknown" or "TBD". Every key below MUST be present.
  TWO RULES GOVERN EVERY KEY. They are not in tension with each other.
  1. FILL IT IF IT WAS SAID. A value is established the moment anyone states it anywhere in the thread. It does not matter which side said it: a date the customer named, a price Vero quoted, a location either of them mentioned all count equally. It does not matter whether the other side replied, agreed, accepted, confirmed, booked, paid or signed anything, and it does not matter that the plan could still change. A price Vero quoted IS the price even if the customer never accepted it, never answered, or answered only "ok". Never hold a value back on the grounds that it is not yet agreed, not settled, not final, not confirmed, not official, not legal, not verified, or not the person's own. None of those tests apply to any key here. If the fact is in the thread, it goes in the key.
  2. NEVER INVENT ONE. If nobody stated it, the key is null. Do not guess it, do not infer it from what is typical for this kind of shoot, do not carry it in from your own knowledge. A null is correct and useful; a made-up value ends up on a contract.
  Thread metadata at the top of the conversation (the channel, the address the customer writes from, their display name) is supplied by the platform rather than typed by anyone. It is a valid source of facts under rule 1, and nothing it contains may ever be reported as something still to ask the customer for.
  If the same key is given more than one value over the thread, use the MOST RECENT.
    - "session_type": one of "wedding", "engagement", "elopement", "anniversary", "portrait", "family", "maternity", "newborn", "event", "other". null only if the thread never says what kind of shoot this is.
    - "event_date": the day of the shoot as YYYY-MM-DD, four-digit year, two-digit month, two-digit day. A day counts as soon as either side names it, including a day the customer proposed while asking whether Vero is free when Vero has not answered yet. Every transcript line is prefixed with the date that message was sent; when a day is named without a year ("October 7", "Nov 8", "7 октября"), take the year from that prefix, choosing the first such day falling on or after the date of the message that names it. The month and the day themselves must come from the thread's own words: never supply those yourself. null only when no single day is named at all: "sometime in October", "next summer", "a weekend in the spring", or two or more candidate days with no choice made between them.
    - "event_time": coverage hours or start time, worded as in the thread, e.g. "3:00 PM to 6:00 PM". null only if no time or duration is named.
    - "event_location": the venue, address or place as either side named it. null only if no place is named.
    - "client_full_name": the customer's first and last name, taken from a message or from the sender display name in the thread metadata. Take a name at face value: a name typed in a chat IS that person's name, and it does not have to be legal, formal or verified. null only when no first-and-last name is available at all, meaning a first name on its own, a handle, a single word, an emoji nickname or a business name.
    - "partner_full_name": for a wedding, engagement, elopement or anniversary, the OTHER partner's first and last name, on exactly the same terms. null for any other session type, or when no such name appears.
    - "client_email": an email address that reaches the customer. If the thread metadata gives the address the customer writes from, that IS their email address: use it, and never treat it as missing. Otherwise use an address typed in a message. A shared, work or partner's address counts. The only address to exclude is Vero's own (vero@vero.photography) and anything from her signature. null only when neither the metadata nor the thread contains a customer address.
    - "total_amount": the full price named for THIS shoot, digits only, no currency symbol and no words: "500", not "$500 for 3 hours". A figure Vero quoted counts, full stop: acceptance, confirmation, a deposit and a signature are all irrelevant to this key. If several totals for this shoot appear, use the MOST RECENT. Do NOT use: an hourly or per-item rate that was never multiplied out into a total, one option from a list of packages the customer has not chosen between, a retainer or deposit, a travel or add-on fee on its own, or a number the customer floated as a budget that Vero never quoted. null only when no total for this shoot appears anywhere in the thread.
    - "retainer_amount": the retainer or deposit for this shoot, digits only, on the same terms: a figure Vero named counts even if it is unpaid and the customer never answered. A retainer is NOT the same as the total: do not copy one into the other. null only when no retainer or deposit figure appears.
    - "total_amount_quote": the sentence from the thread that names the total, copied word for word. Whenever "total_amount" is non-null this is the sentence it came from, so you must be able to produce it. null if "total_amount" is null.
    - "event_date_quote": the sentence that names the date, copied word for word, on the same terms. null if "event_date" is null.
  "gathered" and this object are the same facts read two ways, so they can never disagree. Every fact you put in "gathered" must appear in its matching key here, and every non-null key here must show up in "gathered". If you are about to write a detail into "gathered" while its key is still null, the key is what is wrong: go back and fill it.

- "en": an object with:
    - "asking": one English sentence describing what the customer is fundamentally asking for. If unclear, say "General inquiry — nothing specific asked yet." If spam, describe what they're pitching.
    - "gathered": array of concrete facts ESTABLISHED ANYWHERE IN THIS THREAD, in English, no matter who said them. Include what the customer shared AND what Vero quoted or committed to — a price Vero gave IS a gathered fact and is one of the most important ones. Cover: session type, event date, event time or coverage hours, location, headcount, the price/total quoted, any retainer or deposit, what's included, full names, email addresses, phone numbers, deadlines, styles and constraints. Where a number came from Vero rather than the customer, say so plainly, e.g. "Price quoted: $500 for 3 hours (quoted by Vero)". If the same thing was said more than once with different values, give the MOST RECENT and note it changed, e.g. "Price quoted: $1,400 (revised from $1,000)". Empty array if nothing concrete or if it's spam. Format phone numbers with proper grouping like "(555) 123-4567" — never as one long digit string.
    - "nextStep": one English sentence — what should Vero do next. If details are still needed before a contract could be written, say which ones to ask for.
- "ru": an object with the SAME keys ("asking", "gathered", "nextStep") but in RUSSIAN. Preserve phone-number formatting, proper names, and specific dates/times unchanged (e.g. "9:30am" stays "9:30am", "Bushkill Falls" stays "Bushkill Falls").

Reply with ONLY the JSON object — no preamble, no markdown code fences, no explanation.

Facts and dates should be short — "Aug 12, 2026" not "the 12th of August 2026". If the customer said "next weekend" don't try to convert it — write it as they said it.`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    // 400 → 700 for the Russian copy when summaries went bilingual, then
    // → 1000 for the `booking` object and its verbatim source quotes. A
    // truncated response is unparseable JSON, so this has headroom.
    max_tokens: 1200,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
  const parsed = JSON.parse(raw) as Partial<Summary> & Record<string, any>;

  const classification: Classification =
    typeof parsed.classification === 'string' &&
    (VALID_CLASSIFICATIONS as readonly string[]).includes(parsed.classification)
      ? (parsed.classification as Classification)
      : 'unclear';

  // Extract each locale block. Fall back to flat fields if the model
  // regressed to the old shape (defense-in-depth) so we never render
  // an empty summary.
  const readLocale = (
    src: any,
    fallbackAsking: string,
    fallbackNext: string,
  ): LocalizedSummary => ({
    asking: typeof src?.asking === 'string' ? src.asking : fallbackAsking,
    gathered: Array.isArray(src?.gathered)
      ? src.gathered.filter((g: unknown): g is string => typeof g === 'string')
      : [],
    // Filled in below from `booking`, not read from the model. See
    // BookingFields for why the model is not trusted to write this list.
    missing: [],
    nextStep: typeof src?.nextStep === 'string' ? src.nextStep : fallbackNext,
  });

  /**
   * Take only keys we asked for, only as non-empty strings. A model that
   * writes "unknown", "TBD" or "n/a" instead of null would otherwise read as
   * a real value and quietly drop the field off the "Still needed" list.
   */
  const readBooking = (src: any): BookingFields => {
    const out = { ...EMPTY_BOOKING };
    if (!src || typeof src !== 'object') return out;
    for (const key of Object.keys(EMPTY_BOOKING) as Array<keyof BookingFields>) {
      const v = src[key];
      if (typeof v !== 'string') continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      if (['unknown', 'tbd', 'n/a', 'na', 'none', 'null'].includes(trimmed.toLowerCase())) continue;
      out[key] = trimmed;
    }
    // Digits only, so the form can put these straight into number inputs.
    for (const key of ['total_amount', 'retainer_amount'] as const) {
      if (!out[key]) continue;
      const digits = out[key]!.replace(/[^0-9.]/g, '');
      out[key] = digits && Number.isFinite(Number(digits)) ? digits : null;
    }
    // Shape, then reality: the regex alone accepts "2026-13-45".
    if (out.event_date) {
      const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(out.event_date);
      const d = parts ? new Date(`${out.event_date}T00:00:00Z`) : null;
      const real =
        parts &&
        d &&
        Number.isFinite(d.getTime()) &&
        d.getUTCFullYear() === Number(parts[1]) &&
        d.getUTCMonth() + 1 === Number(parts[2]) &&
        d.getUTCDate() === Number(parts[3]);
      if (!real) out.event_date = null;
    }
    // A quote with nothing to back up is noise.
    if (!out.total_amount) out.total_amount_quote = null;
    if (!out.event_date) out.event_date_quote = null;
    return out;
  };

  const en = readLocale(
    parsed.en ?? parsed,
    'Nothing specific asked yet.',
    'Awaiting customer response',
  );
  const ru = readLocale(
    parsed.ru,
    // If the model failed to give us Russian, fall back to the
    // English copy rather than empty — better than nothing.
    en.asking,
    en.nextStep,
  );

  const booking = readBooking(parsed.booking);

  // Not a guess and not a promise the prompt might forget to keep: this is the
  // address the conversation row is keyed on and the address every reply Vero
  // sends already goes to. Leaving it to prompt wording alone keeps the most
  // frequently wrong field depending on the model noticing a metadata block.
  if (!booking.client_email && contact.address) booking.client_email = contact.address;

  en.missing = computeMissing(booking, classification, 'en');
  ru.missing = computeMissing(booking, classification, 'ru');

  return {
    classification,
    tone: typeof parsed.tone === 'string' ? parsed.tone : 'unclear',
    en,
    ru,
    booking,
    summaryVersion: SUMMARY_VERSION,
  };
}
