/**
 * AI reply engine for the Vero messaging assistant.
 *
 * Called from the Instagram webhook after a new inbound message is
 * persisted. Runs through a series of guardrails before generating,
 * then generates a reply via GPT-4o-mini, sends it via the IG API,
 * and stores the outbound message row.
 *
 * The pipeline:
 *   1. Check global kill switch (system_state.messaging_ai_state)
 *   2. Check per-conversation ai_enabled toggle
 *   3. Check dedup: any outbound msg after this inbound already?
 *   4. Check rate limit: any AI msg from us in the last 5 min?
 *   5. Detect booking/pricing intent → send bridge, disable AI, done
 *   6. Detect spam (last 3 inbounds too similar) → send bridge, disable AI, done
 *   7. Detect wrap-up trigger (>= MAX_AI_MSGS AI replies already)
 *      → send wrap-up handoff, disable AI, done
 *   8. Load ai_context rows + last N messages for context
 *   9. Call OpenAI with a system prompt + conversation history
 *  10. Send the reply via IG API
 *  11. Persist the outbound message row (direction=outbound, sender=ai)
 *
 * Every skip / escalation path logs a reason so we can trace behavior
 * without dumping full messages. Everything Vero can edit lives in
 * ai_context; hardcoded meta-framing keeps her from accidentally
 * unmaking the safety rails via the UI.
 */

import OpenAI from 'openai';
import { getDb } from './_db.js';
import { sendIgTextMessage } from './_ig-send.js';

// GPT-4o-mini is fast, cheap, and plenty smart for concierge-style
// short replies. ~$0.15/1M input tokens, ~$0.60/1M output — a typical
// reply is well under a cent.
const OPENAI_MODEL = 'gpt-4o-mini';

// After this many AI replies in a conversation, send the wrap-up
// handoff and disable AI. Prevents the bot from having infinite
// conversations that could deliver bad info OR waste API tokens.
const MAX_AI_MSGS_PER_CONVO = 6;

// Minimum gap between AI replies in the same conversation. Prevents
// spam/bursts if the webhook fires multiple times or messages arrive
// in quick succession.
const MIN_GAP_MS_BETWEEN_AI = 60_000; // 60 seconds

// How many recent messages to feed the AI as conversation history.
// Balances context (better replies) vs token cost.
const HISTORY_CONTEXT_MESSAGES = 12;

// Booking / pricing intent keywords. If ANY of these substring-match
// the (lowercased) inbound message, we skip AI generation and send
// the pre-written bridge message + disable AI for the convo. Kept
// generous — false positives are fine (Vero handles the follow-up
// personally either way); false negatives are the risk we minimize.
//
// English + Russian (Vero gets both). Add more languages as needed.
const BOOKING_INTENT_KEYWORDS = [
  // English
  'price', 'pricing', 'cost', 'quote', 'quotes', 'how much', 'rate', 'rates',
  'fee', 'fees', 'deposit', 'retainer', 'book', 'booking', 'available',
  'availability', 'hire', 'hiring', 'package', 'packages', 'discount',
  'contract', 'payment', 'invoice', 'reserve',
  // Russian
  'цена', 'цены', 'стоимость', 'сколько стоит', 'сколько', 'предоплата',
  'аванс', 'забронировать', 'бронирование', 'свободн', 'доступн', 'заказать',
  'пакет', 'скидк', 'договор', 'оплат',
];

export interface ReplyResult {
  action:
    | 'sent-ai-reply'
    | 'sent-booking-bridge'
    | 'sent-wrap-up'
    | 'sent-spam-bridge'
    | 'skipped-global-kill'
    | 'skipped-convo-disabled'
    | 'skipped-already-replied'
    | 'skipped-rate-limit'
    | 'error-send-failed'
    | 'error-generation-failed';
  reason?: string;
  outboundBody?: string;
}

interface Conversation {
  id: string;
  external_user_id: string;
  ai_enabled: boolean;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  sender: 'contact' | 'ai' | 'human';
  body: string;
  sent_at: string;
}

interface ContextRow {
  category: string;
  label: string;
  content: string;
}

let cachedClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (cachedClient) return cachedClient;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY env var missing');
  cachedClient = new OpenAI({ apiKey: key });
  return cachedClient;
}

/**
 * Main entry — call after persisting an inbound message. Handles
 * everything from guardrail checks to sending the outbound reply.
 * Never throws; returns a structured result the caller can log.
 */
export async function processInboundMessage(args: {
  conversationId: string;
  inboundMessageId: string;
  inboundSentAt: string;
}): Promise<ReplyResult> {
  try {
    const sql = getDb();

    // ── 1. Global kill switch ────────────────────────────────
    const stateRows = (await sql`
      SELECT value FROM system_state WHERE key = 'messaging_ai_state' LIMIT 1
    `) as Array<{ value: string | null }>;
    if (stateRows[0]?.value === 'off') {
      return { action: 'skipped-global-kill', reason: 'messaging_ai_state=off' };
    }

    // ── 2. Load conversation + per-convo toggle check ────────
    const convoRows = (await sql`
      SELECT id, external_user_id, ai_enabled
      FROM conversations
      WHERE id = ${args.conversationId}
      LIMIT 1
    `) as Array<Conversation>;
    const convo = convoRows[0];
    if (!convo) {
      return { action: 'error-generation-failed', reason: 'conversation not found' };
    }
    if (!convo.ai_enabled) {
      return { action: 'skipped-convo-disabled', reason: 'ai_enabled=false' };
    }

    // ── 3. Dedup: did we already reply to this inbound? ──────
    const laterOutbound = (await sql`
      SELECT id FROM messages
      WHERE conversation_id = ${args.conversationId}
        AND direction = 'outbound'
        AND sent_at > ${args.inboundSentAt}
      LIMIT 1
    `) as Array<{ id: string }>;
    if (laterOutbound.length > 0) {
      return { action: 'skipped-already-replied', reason: 'outbound exists after inbound' };
    }

    // ── 4. Rate limit: any outbound within the last N seconds? ──
    const rateRows = (await sql`
      SELECT id, sent_at FROM messages
      WHERE conversation_id = ${args.conversationId}
        AND direction = 'outbound'
        AND sent_at > NOW() - INTERVAL '${MIN_GAP_MS_BETWEEN_AI / 1000} seconds'
      LIMIT 1
    `) as Array<{ id: string; sent_at: string }>;
    if (rateRows.length > 0) {
      return { action: 'skipped-rate-limit', reason: 'outbound within rate-limit window' };
    }

    // ── 5. Load full conversation history for the AI + guardrails ──
    const historyRows = (await sql`
      SELECT id, direction, sender, body, sent_at
      FROM messages
      WHERE conversation_id = ${args.conversationId}
      ORDER BY sent_at DESC
      LIMIT ${HISTORY_CONTEXT_MESSAGES}
    `) as Array<Message>;
    // Query returned newest-first for LIMIT purposes; feed AI oldest-first.
    const history = [...historyRows].reverse();
    const inboundMessages = history.filter((m) => m.direction === 'inbound');
    const outboundAiMessages = history.filter(
      (m) => m.direction === 'outbound' && m.sender === 'ai',
    );
    const latestInbound = [...inboundMessages].reverse()[0];
    const latestInboundBody = latestInbound?.body ?? '';

    // ── 6. Booking / pricing intent → bridge + disable ───────
    if (matchesBookingIntent(latestInboundBody)) {
      return await sendBridgeAndEscalate(
        sql,
        convo,
        'booking_bridge',
        'sent-booking-bridge',
        'booking-intent keyword match',
      );
    }

    // ── 7. Spam / repeat detection: last 3 inbounds very similar ──
    if (looksLikeSpam(inboundMessages)) {
      return await sendBridgeAndEscalate(
        sql,
        convo,
        'booking_bridge',
        'sent-spam-bridge',
        'inbound messages look repetitive',
      );
    }

    // ── 8. Wrap-up trigger: too many AI replies already ──────
    if (outboundAiMessages.length >= MAX_AI_MSGS_PER_CONVO) {
      return await sendBridgeAndEscalate(
        sql,
        convo,
        'escalation_wrap_up',
        'sent-wrap-up',
        `hit MAX_AI_MSGS (${MAX_AI_MSGS_PER_CONVO})`,
      );
    }

    // ── 9. Load ai_context for the system prompt ─────────────
    const contextRows = (await sql`
      SELECT category, label, content
      FROM ai_context
      WHERE active = TRUE
      ORDER BY category, sort_order
    `) as Array<ContextRow>;

    // ── 10. Generate reply ───────────────────────────────────
    let replyText: string;
    try {
      replyText = await generateReply({
        contextRows,
        history,
        aiMessageCount: outboundAiMessages.length,
      });
    } catch (err) {
      console.error('[ai-reply] generation failed:', err);
      return {
        action: 'error-generation-failed',
        reason: err instanceof Error ? err.message : 'unknown',
      };
    }
    if (!replyText.trim()) {
      return { action: 'error-generation-failed', reason: 'empty reply' };
    }

    // ── 11. Send via IG API ──────────────────────────────────
    const sendResult = await sendIgTextMessage({
      recipientIgsid: convo.external_user_id,
      text: replyText,
    });
    if (!sendResult.ok) {
      return {
        action: 'error-send-failed',
        reason: sendResult.error ?? `HTTP ${sendResult.statusCode}`,
      };
    }

    // ── 12. Persist outbound row ─────────────────────────────
    await sql`
      INSERT INTO messages (
        conversation_id, direction, sender, body,
        external_message_id, sent_at, ai_model
      )
      VALUES (
        ${convo.id}, 'outbound', 'ai', ${replyText},
        ${sendResult.externalMessageId ?? null}, NOW(), ${OPENAI_MODEL}
      )
      ON CONFLICT (external_message_id) DO NOTHING
    `;

    return { action: 'sent-ai-reply', outboundBody: replyText };
  } catch (err) {
    console.error('[ai-reply] pipeline error:', err);
    return {
      action: 'error-generation-failed',
      reason: err instanceof Error ? err.message : 'unknown',
    };
  }
}

/**
 * Send a pre-written bridge / handoff message from the ai_context
 * table and flip the conversation's ai_enabled to false so Vero
 * takes over from here. Used for booking intent, spam, and wrap-up.
 */
async function sendBridgeAndEscalate(
  sql: ReturnType<typeof getDb>,
  convo: Conversation,
  contextCategory: 'booking_bridge' | 'escalation_wrap_up',
  action: ReplyResult['action'],
  reason: string,
): Promise<ReplyResult> {
  const bridgeRows = (await sql`
    SELECT content FROM ai_context
    WHERE category = ${contextCategory} AND active = TRUE
    ORDER BY sort_order
    LIMIT 1
  `) as Array<{ content: string }>;
  const bridgeText =
    bridgeRows[0]?.content ??
    'Thanks so much for reaching out! Vero will personally get back to you shortly.';

  const send = await sendIgTextMessage({
    recipientIgsid: convo.external_user_id,
    text: bridgeText,
  });

  if (!send.ok) {
    console.error(`[ai-reply] bridge send failed (${action}): ${send.error}`);
    return { action: 'error-send-failed', reason: send.error };
  }

  // Persist outbound row, then flip ai_enabled to false so this
  // conversation stays quiet until Vero re-engages via admin UI.
  await sql`
    INSERT INTO messages (
      conversation_id, direction, sender, body,
      external_message_id, sent_at
    )
    VALUES (
      ${convo.id}, 'outbound', 'ai', ${bridgeText},
      ${send.externalMessageId ?? null}, NOW()
    )
    ON CONFLICT (external_message_id) DO NOTHING
  `;
  await sql`
    UPDATE conversations
    SET ai_enabled = FALSE, updated_at = NOW()
    WHERE id = ${convo.id}
  `;

  return { action, reason, outboundBody: bridgeText };
}

function matchesBookingIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return BOOKING_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Basic spam detection: if the last 3+ inbound messages are all
 * substantially the same (Jaccard similarity of word sets), it's
 * probably a bot or a frustrated user hitting send repeatedly.
 * Escalate to Vero rather than reply.
 */
function looksLikeSpam(inbound: Message[]): boolean {
  if (inbound.length < 3) return false;
  const recent = inbound.slice(-3);
  const [a, b, c] = recent.map((m) => wordSet(m.body));
  return jaccard(a, b) > 0.7 && jaccard(b, c) > 0.7;
}

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9а-яё\s]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

interface GenerateArgs {
  contextRows: ContextRow[];
  history: Message[];
  aiMessageCount: number;
}

async function generateReply(args: GenerateArgs): Promise<string> {
  const client = getOpenAI();

  const systemPrompt = buildSystemPrompt(args.contextRows, args.aiMessageCount);

  // Feed conversation history as alternating user/assistant messages.
  // 'contact' = user, 'ai' = assistant, 'human' = assistant too
  // (Vero's own manual replies still count as our side).
  const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];
  for (const m of args.history) {
    chatMessages.push({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.body,
    });
  }

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: chatMessages,
    // Keep replies short and warm — the tone context also asks for
    // this but the parameter enforces it as a hard cap.
    max_tokens: 300,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() ?? '';
}

function buildSystemPrompt(contextRows: ContextRow[], aiMessageCount: number): string {
  // Group context rows by category for clean prompt structure.
  const byCategory = new Map<string, ContextRow[]>();
  for (const row of contextRows) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  }

  const identityRows = byCategory.get('identity') ?? [];
  const assistantName =
    identityRows.find((r) => r.label === 'Assistant name')?.content ?? "Vero's Assistant";

  const contextSections: string[] = [];
  for (const [cat, rows] of byCategory.entries()) {
    if (cat === 'booking_bridge' || cat === 'escalation_wrap_up' || cat === 'identity') {
      // These are used elsewhere, not in the system prompt
      continue;
    }
    const heading = cat.replace(/_/g, ' ').toUpperCase();
    const bullets = rows.map((r) => `- ${r.content}`).join('\n');
    contextSections.push(`## ${heading}\n${bullets}`);
  }

  // Website CTA hint — the AI decides when to weave it in naturally
  // (usually after ~2 exchanges when the conversation has warmed).
  const websiteCtaHint =
    aiMessageCount >= 2
      ? 'You may naturally mention vero.photography once during this exchange if it fits (portfolio link).'
      : 'Do NOT mention the website in your first 1-2 replies — feels salesy. Save it for once the conversation has warmed.';

  return `You are ${assistantName} — an AI assistant helping Vero manage her Instagram inbox while she's busy on photography sessions.

## YOUR ROLE
- Respond warmly to inbound messages
- Gather useful info from prospective clients (session type, date range, location, what they're looking for) that Vero will use to follow up
- Answer general questions about Vero's work and process
- Match the customer's language (respond in the SAME language they wrote in — English, Russian, or otherwise)
- Keep replies short: 1–3 sentences typically. Never wall-of-text.
- Introduce yourself as "${assistantName}" in your FIRST reply of a conversation. Don't re-introduce in subsequent replies.

${contextSections.join('\n\n')}

## HARD RULES (never violate — these are safety rails, not tone)
- NEVER quote a specific price, hour rate, package cost, or dollar amount
- NEVER commit to a specific date or availability
- NEVER claim to BE Vero — you are her assistant
- If a customer asks about pricing or booking, do NOT try to answer with a range or "starting from" — the system has a separate bridging message for that; you'll never actually be asked to handle those questions
- If unsure, err on the side of a brief warm reply that gathers more info rather than making things up
- If the customer's message is empty, incoherent, or clearly not a real inquiry, reply with a short friendly clarifier

## STYLE NOTES
- ${websiteCtaHint}
- Emojis are welcome but sparingly (one per message at most, when it fits naturally)
- Use the customer's first name if they've shared it; otherwise skip greeting-by-name
- Sound like a warm human colleague, not a corporate bot

Now respond to the most recent customer message using the conversation history for context.`;
}
