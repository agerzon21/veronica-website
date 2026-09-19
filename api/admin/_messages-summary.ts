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
// The form this feeds owns these, and they are plain data with no React in
// them. Importing rather than restating is the point: a session type the
// summariser recognises but no template renders is a prefill that quietly
// does nothing when Vero clicks Create client.
import {
  COUPLE_SESSION_TYPES,
  toSessionType,
  type DurationStatement,
  type SessionType,
} from '../../src/components/clientPrefill.js';

const MODEL = 'gpt-4o-mini';

/**
 * Bump whenever the booking spec or the transcript we send the model changes.
 *
 * A cached summary is otherwise only rebuilt when a NEW MESSAGE ARRIVES, so a
 * thread that has gone quiet serves its old "Still needed" list forever. That
 * is exactly how the pre-`booking` rows survived long enough for Vero to be
 * looking at one. A version number rather than a presence check on some key,
 * because presence checks only ever retire one generation.
 *
 * 3 to 4: six contract types instead of a free-text session type, a per-type
 * "Still needed" list, and three new keys. A version 3 row carries the old
 * field set and, worse, the old gap list, which asks every client for a
 * partner's full name the moment it decides the shoot is a couple one.
 *
 * 4 to 5: session_durations. A version 4 row has no record of how long
 * anybody said the session runs, so the new-client form it prefills leaves
 * the end time blank on a thread that states one plainly. Nothing arrives to
 * invalidate that row either, since these are settled threads by the time
 * Vero converts them, which is the case this number exists for.
 */
const SUMMARY_VERSION = 5;

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
  /** Gaps only the customer can fill. */
  missing: string[];
  /** Gaps Vero fills herself — the price and the retainer. */
  decide: string[];
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
  /**
   * One of the six contract types, or null when the thread never says. Never
   * free text: readBooking coerces anything else to 'other', because a type
   * the new-client form cannot find a template for prefills nothing.
   */
  session_type: string | null;
  event_date: string | null;
  event_time: string | null;
  event_location: string | null;
  client_full_name: string | null;
  /** Wedding and engagement only. Every other contract names one person. */
  partner_full_name: string | null;
  client_email: string | null;
  total_amount: string | null;
  retainer_amount: string | null;
  /** Maternity only: the estimated due date the session is timed against. */
  due_date: string | null;
  /** Engagement only, and optional there: the wedding the session precedes. */
  wedding_date: string | null;
  /** 'other' only: what is being photographed, since nothing else says. */
  session_scope: string | null;
  /**
   * Verbatim source sentences for the two values that cost money to get
   * wrong. Real threads renegotiate — one in this inbox contains $1,000,
   * $1,400 and $2,000 — so the form shows Vero what a figure came from
   * instead of silently filling in a number.
   */
  total_amount_quote: string | null;
  event_date_quote: string | null;
  /**
   * Every statement in the thread about how long the session runs, each one
   * tagged with who made it. The only key here that is not a lone value,
   * and deliberately so: DurationStatement in clientPrefill.ts explains why
   * the choice between a maximum the photographer offered and a shorter
   * length the customer guessed at is made in code rather than by this
   * prompt. The model's job is to find the sentences, not to pick one.
   */
  session_durations: DurationStatement[];
}

/** Every key above except the list, which is the one that is not a string. */
type BookingStringKey = Exclude<keyof BookingFields, 'session_durations'>;

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
  due_date: null,
  wedding_date: null,
  session_scope: null,
  total_amount_quote: null,
  event_date_quote: null,
  session_durations: [],
};

/**
 * The string-valued keys, as something the readers below can walk.
 *
 * They used to walk Object.keys(EMPTY_BOOKING) and coerce every value with
 * one rule, which only worked while every value was a string. Filtering the
 * list once, here, keeps that single loop honest instead of teaching it to
 * skip a key by name in the middle of its own body.
 */
const BOOKING_STRING_KEYS = (Object.keys(EMPTY_BOOKING) as Array<keyof BookingFields>).filter(
  (k): k is BookingStringKey => k !== 'session_durations',
);

/**
 * The duration statements, taking only what the shape promises.
 *
 * A statement with no speaker is unusable: the whole reason this is a list
 * is that the choice between two lengths turns on who said which, so a row
 * that cannot answer that is dropped rather than guessed at. A missing quote
 * falls back to the length itself, because the quote is there to be shown to
 * Vero and a short line is better than an empty one. The cap is there so a
 * model looping on one sentence cannot write an unbounded array into the
 * summary cache.
 */
function readDurations(src: unknown): DurationStatement[] {
  if (!Array.isArray(src)) return [];
  const out: DurationStatement[] = [];
  for (const row of src.slice(0, 8)) {
    if (!row || typeof row !== 'object') continue;
    const speaker = (row as any).speaker;
    if (speaker !== 'photographer' && speaker !== 'client') continue;
    const text = typeof (row as any).text === 'string' ? (row as any).text.trim() : '';
    if (!text) continue;
    const quote = typeof (row as any).quote === 'string' ? (row as any).quote.trim() : '';
    out.push({ speaker, text, quote: quote || text });
  }
  return out;
}

/**
 * What a contract needs, in the order it renders. Labels live here in both
 * languages rather than coming back from the model, so the wording stays
 * identical between threads and between regenerations.
 *
 * `source` splits the list into the two genuinely different things it used to
 * conflate. Only the customer can say when the wedding is or how to spell her
 * partner's surname. The price and the retainer are Vero's own decisions, and
 * showing them under a heading that reads as "ask them for this" produced
 * advice like "ask Daria for the amount of the advance payment" — telling a
 * photographer to ask a client what deposit she would like to be charged.
 *
 * `types` replaced a single couple-only flag once there were six contracts
 * rather than one. A family session has no second signatory, no due date and
 * no scope paragraph, and a list that asks for them anyway sends Vero back to
 * the client for answers the contract has nowhere to print. Absent means the
 * field belongs to all six.
 */
const BOOKING_REQUIREMENTS: Array<{
  key: BookingStringKey;
  en: string;
  ru: string;
  source: 'client' | 'vero';
  /** Session types this field exists for. Absent means all of them. */
  types?: readonly SessionType[];
  /**
   * Worth carrying when the thread happens to say it, never worth chasing:
   * kept out of the "Still needed" list but still type-scoped, so the value
   * is dropped rather than prefilled onto a contract with no field for it.
   */
  optional?: boolean;
}> = [
  { key: 'session_type', en: 'Type of session', ru: 'Тип съёмки', source: 'client' },
  {
    key: 'session_scope',
    en: 'What is being photographed',
    ru: 'Что именно снимаем',
    source: 'client',
    types: ['other'],
  },
  { key: 'event_date', en: 'Event date', ru: 'Дата съёмки', source: 'client' },
  {
    key: 'due_date',
    en: 'Estimated due date',
    ru: 'Предполагаемая дата родов',
    source: 'client',
    types: ['maternity'],
  },
  { key: 'event_time', en: 'Coverage hours', ru: 'Часы съёмки', source: 'client' },
  { key: 'event_location', en: 'Location', ru: 'Место съёмки', source: 'client' },
  {
    key: 'client_full_name',
    en: "Client's full name",
    ru: 'Полное имя клиента',
    source: 'client',
  },
  {
    key: 'partner_full_name',
    en: "Partner's full name",
    ru: 'Полное имя партнёра',
    source: 'client',
    types: COUPLE_SESSION_TYPES,
  },
  {
    key: 'client_email',
    en: 'Client email address',
    ru: 'Электронная почта клиента',
    source: 'client',
  },
  {
    // The clause it drives only appears when a wedding is already booked, so
    // an engagement thread with no wedding date is complete, not incomplete.
    key: 'wedding_date',
    en: 'Wedding date',
    ru: 'Дата свадьбы',
    source: 'client',
    types: ['engagement'],
    optional: true,
  },
  { key: 'total_amount', en: 'Total price', ru: 'Итоговая стоимость', source: 'vero' },
  { key: 'retainer_amount', en: 'Retainer amount', ru: 'Размер предоплаты', source: 'vero' },
];

/** Only these threads are heading toward a contract; the rest need nothing. */
const BOOKING_CLASSIFICATIONS = new Set(['booking-inquiry', 'existing-client']);

export function computeGaps(
  booking: BookingFields,
  classification: Classification,
  locale: 'en' | 'ru',
  source: 'client' | 'vero',
): string[] {
  if (!BOOKING_CLASSIFICATIONS.has(classification)) return [];
  // Null means the thread has not said what kind of shoot this is, so every
  // type-scoped field is skipped: the one thing worse than not asking for a
  // due date is asking a client who is not pregnant for one.
  const type = toSessionType(booking.session_type);
  return BOOKING_REQUIREMENTS.filter((f) => f.source === source)
    .filter((f) => !f.optional)
    .filter((f) => !f.types || (type !== null && f.types.includes(type)))
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
  If the same key is given more than one value over the thread, use the MOST RECENT. The one exception is "session_durations", which is a list and keeps every statement it finds, oldest first.
    - "session_type": EXACTLY one of "wedding", "portrait", "family", "engagement", "maternity", "other". Those six are the only contracts that exist, so choose the closest one rather than inventing a word for the shoot. The tests below OVERLAP, so work down them in order and take the FIRST that fits: a wedding with children in it is still a wedding, and a pregnancy shoot of one adult is still maternity. (1) "wedding": a wedding, an elopement or a vow renewal, however many family members are in it. (2) "engagement": a proposal, a save-the-date or an engagement shoot. (3) "maternity": a bump or pregnancy shoot. (4) "other": a newborn, a birthday, an anniversary, or a branding, product or event shoot. (5) "family": children, or more than one generation, where none of the above was named. (6) "portrait": one adult on their own, including headshots, boudoir and graduation. (7) "other" again for anything that fits none of them. null only if the thread never says what kind of shoot this is.
    - "event_date": the day of the shoot as YYYY-MM-DD, four-digit year, two-digit month, two-digit day. A day counts as soon as either side names it, including a day the customer proposed while asking whether Vero is free when Vero has not answered yet. Every transcript line is prefixed with the date that message was sent; when a day is named without a year ("October 7", "Nov 8", "7 октября"), take the year from that prefix, choosing the first such day falling on or after the date of the message that names it. The month and the day themselves must come from the thread's own words: never supply those yourself. null only when no single day is named at all: "sometime in October", "next summer", "a weekend in the spring", or two or more candidate days with no choice made between them.
    - "event_time": the clock time the shoot starts, or the whole window if the thread gives both ends, worded as in the thread, e.g. "3:00 PM to 6:00 PM" or "11:30 AM". A start time on its own IS the value: do not hold it back for want of an end, and do not work one out yourself by adding a length to it. How long the session runs belongs in "session_durations" and never inside this string. null only if no clock time is named.
    - "session_durations": every statement anyone makes about HOW LONG the session runs, in the order they were said, as an array of objects with EXACTLY these three keys: "speaker", either "photographer" (Vero, or the AI assistant answering in her place) or "client" (the customer); "text", the length alone in the words it was said in, e.g. "1.5 hours", "an hour", "90 minutes", "полтора часа"; and "quote", the sentence it was said in copied word for word. Include a length that was offered as a maximum, floated, proposed, asked for or merely guessed at, and include BOTH sides when they say different lengths, in the order they said them. Which one reaches the contract is decided outside this summary, and a statement you leave out cannot be weighed there. A clock time is not a duration: "we'll start at 11:30" says nothing about length. An empty array when nobody says how long the session runs, which is common and is the right answer there.
    - "event_location": the venue, address or place as either side named it. null only if no place is named.
    - "client_full_name": the customer's first and last name, taken from a message or from the sender display name in the thread metadata. Take a name at face value: a name typed in a chat IS that person's name, and it does not have to be legal, formal or verified. null only when no first-and-last name is available at all, meaning a first name on its own, a handle, a single word, an emoji nickname or a business name.
    - "partner_full_name": for a wedding or an engagement, the OTHER partner's first and last name, on exactly the same terms. Those are the only two contracts that name two people. null for every other session type, including one where the thread happens to mention a spouse, and null when no such name appears.
    - "client_email": an email address that reaches the customer. If the thread metadata gives the address the customer writes from, that IS their email address: use it, and never treat it as missing. Otherwise use an address typed in a message. A shared, work or partner's address counts. The only address to exclude is Vero's own (vero@vero.photography) and anything from her signature. null only when neither the metadata nor the thread contains a customer address.
    - "total_amount": the full price named for THIS shoot, digits only, no currency symbol and no words: "500", not "$500 for 3 hours". A figure Vero quoted counts, full stop: acceptance, confirmation, a deposit and a signature are all irrelevant to this key. If several totals for this shoot appear, use the MOST RECENT. Do NOT use: an hourly or per-item rate that was never multiplied out into a total, one option from a list of packages the customer has not chosen between, a retainer or deposit, a travel or add-on fee on its own, or a number the customer floated as a budget that Vero never quoted. null only when no total for this shoot appears anywhere in the thread.
    - "retainer_amount": the retainer or deposit for this shoot, digits only, on the same terms: a figure Vero named counts even if it is unpaid and the customer never answered. A retainer is NOT the same as the total: do not copy one into the other. null only when no retainer or deposit figure appears.
    - "due_date": maternity sessions only. The customer's estimated due date, written and year-resolved exactly like "event_date". null for every other session type, and null when the thread never names one.
    - "wedding_date": engagement sessions only. The day of the wedding this session leads up to, written exactly like "event_date", and only when the thread names a day that is already settled. null for every other session type, and null when no wedding day is named. Many engagement threads have no wedding date yet and null is the right answer there.
    - "session_scope": "other" sessions only. A short phrase in the thread's own words saying what is being photographed, e.g. "branding session for a bakery" or "60th birthday party". null for every other session type, and null when nothing says what the shoot is.
    - "total_amount_quote": the sentence from the thread that names the total, copied word for word. Whenever "total_amount" is non-null this is the sentence it came from, so you must be able to produce it. null if "total_amount" is null.
    - "event_date_quote": the sentence that names the date, copied word for word, on the same terms. null if "event_date" is null.
  "gathered" and this object are the same facts read two ways, so they can never disagree. Every fact you put in "gathered" must appear in its matching key here, and every key here that carries a value, including a "session_durations" list with anything in it, must show up in "gathered". If you are about to write a detail into "gathered" while its key is still null, the key is what is wrong: go back and fill it.

- "en": an object with:
    - "asking": one English sentence describing what the customer is fundamentally asking for. If unclear, say "General inquiry — nothing specific asked yet." If spam, describe what they're pitching.
    - "gathered": array of concrete facts ESTABLISHED ANYWHERE IN THIS THREAD, in English, no matter who said them. Include what the customer shared AND what Vero quoted or committed to — a price Vero gave IS a gathered fact and is one of the most important ones. Cover: session type, event date, event time or coverage hours, location, headcount, the price/total quoted, any retainer or deposit, what's included, full names, email addresses, phone numbers, deadlines, styles and constraints. Where a number came from Vero rather than the customer, say so plainly, e.g. "Price quoted: $500 for 3 hours (quoted by Vero)". If the same thing was said more than once with different values, give the MOST RECENT and note it changed, e.g. "Price quoted: $1,400 (revised from $1,000)". Empty array if nothing concrete or if it's spam. Format phone numbers with proper grouping like "(555) 123-4567" — never as one long digit string.
    - "nextStep": one English sentence — what should Vero do next. If details are still needed from the customer before a contract could be written, say which ones to ask for. NEVER suggest asking the customer for the price or the retainer/deposit amount: those are Vero's to set, and asking a client what she would like to be charged reads as amateurish. If the only thing outstanding is a figure Vero has not named yet, tell her to decide and quote it, not to ask.
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
    // → 1000 for the `booking` object and its verbatim source quotes, then
    // → 1500 once session_durations started carrying a sentence per speaker
    // on top of that. A truncated response is unparseable JSON, so this has
    // headroom.
    max_tokens: 1500,
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
    // Both filled in below from `booking`, not read from the model. See
    // BookingFields for why the model is not trusted to write these lists.
    missing: [],
    decide: [],
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
    out.session_durations = readDurations(src.session_durations);
    for (const key of BOOKING_STRING_KEYS) {
      const v = src[key];
      if (typeof v !== 'string') continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      if (['unknown', 'tbd', 'n/a', 'na', 'none', 'null'].includes(trimmed.toLowerCase())) continue;
      out[key] = trimmed;
    }
    // One of six keys or null, never the model's own word for the shoot. An
    // unrecognised type used to travel to the new-client form and match no
    // template there, so the dropdown fell back to Wedding and the prefill
    // panel showed a session type the form had silently ignored.
    out.session_type = toSessionType(out.session_type);
    // Digits only, so the form can put these straight into number inputs.
    for (const key of ['total_amount', 'retainer_amount'] as const) {
      if (!out[key]) continue;
      const digits = out[key]!.replace(/[^0-9.]/g, '');
      out[key] = digits && Number.isFinite(Number(digits)) ? digits : null;
    }
    // Shape, then reality: the regex alone accepts "2026-13-45". All three
    // dates land in <input type="date">, so all three get the same check.
    for (const key of ['event_date', 'due_date', 'wedding_date'] as const) {
      const value = out[key];
      if (!value) continue;
      const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      const d = parts ? new Date(`${value}T00:00:00Z`) : null;
      const real =
        parts &&
        d &&
        Number.isFinite(d.getTime()) &&
        d.getUTCFullYear() === Number(parts[1]) &&
        d.getUTCMonth() + 1 === Number(parts[2]) &&
        d.getUTCDate() === Number(parts[3]);
      if (!real) out[key] = null;
    }
    // Drop anything this contract has no field for. The prompt already says
    // so, but a model that volunteers a partner's name on a family booking
    // would otherwise hand it to a form that shows one name input, and the
    // value would ride along invisibly into the portal.
    //
    // Only once the type is known: null means we have no information yet, not
    // that the field does not apply.
    const type = toSessionType(out.session_type);
    if (type) {
      for (const f of BOOKING_REQUIREMENTS) {
        if (f.types && !f.types.includes(type)) out[f.key] = null;
      }
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

  en.missing = computeGaps(booking, classification, 'en', 'client');
  ru.missing = computeGaps(booking, classification, 'ru', 'client');
  en.decide = computeGaps(booking, classification, 'en', 'vero');
  ru.decide = computeGaps(booking, classification, 'ru', 'vero');

  return {
    classification,
    tone: typeof parsed.tone === 'string' ? parsed.tone : 'unclear',
    en,
    ru,
    booking,
    summaryVersion: SUMMARY_VERSION,
  };
}
