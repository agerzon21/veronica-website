/**
 * Admin: conversational chat endpoint powering the Assistant tab.
 *
 * Vero talks to her personal assistant in Russian; the assistant
 * looks up + updates her structured knowledge base (ai_context
 * table) via tool calls, and answers her in Russian while storing
 * the underlying knowledge normalized to English (so the customer-
 * facing AI reply engine, which reads the same table, gets clean
 * data regardless of what language Vero used in the chat).
 *
 * POST { password, action: 'send', message }
 *   → 200 { success, reply, dbWrites, messageCount }
 *     - reply: the assistant's Russian response
 *     - dbWrites: array of {type, category, label, content_ru}
 *       events the frontend can turn into achievement toasts
 *     - messageCount: total messages in the thread now
 *
 * POST { password, action: 'history' }
 *   → 200 { success, messages }
 *     Just returns the thread so the UI can rehydrate on load.
 *
 * POST { password, action: 'reset' }
 *   → 200 { success }
 *     Clears the thread. Useful if a conversation went sideways.
 *
 * Tool loop: OpenAI can call search_knowledge_base / upsert_knowledge /
 * delete_knowledge to manage the customer-reply knowledge base, and
 * list_conversations / read_thread / send_reply to help Vero answer an
 * actual customer. We execute the tool, feed the result back, and loop
 * until it stops calling tools. Hard cap of 8 rounds per turn so a
 * runaway loop can't eat the function budget.
 *
 * Three things this assistant does, which are easy to conflate:
 *
 *   1. EDITS THE KNOWLEDGE BASE that the customer-facing reply engine
 *      uses. Vero says "family sessions are $600 now" and it lands in
 *      ai_context.
 *   2. DRAFTS AND SENDS REPLIES on her behalf. This replaces her actual
 *      habit of screenshotting a message into ChatGPT and copying the
 *      answer back. Sending goes through api/_reply-delivery.ts — the
 *      same path as the Messages panel's Send button — so threading,
 *      signature and idempotency are identical. Requires explicit
 *      approval: the model must pass confirmed=true, and is told never
 *      to do that in the same turn it proposes a draft.
 *   3. ANSWERS "HOW DO I…" QUESTIONS about the admin panel itself, from
 *      ai_context rows with source='system'. Those are written by Alex,
 *      are excluded from the customer-facing prompt (migration 018), and
 *      are protected from edit/delete here — otherwise the assistant
 *      could be talked into deleting its own documentation.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { deliverReply } from '../_reply-delivery.js';

const MODEL = 'gpt-4o-mini';
const MAX_TOOL_ROUNDS = 8;
const CHAT_SLOT = 'default';

/**
 * How many prior turns get replayed to the model, and how many are kept
 * in the database.
 *
 * The whole thread used to be sent on every single turn, on top of a
 * system prompt that now carries the entire admin-panel documentation.
 * Nothing trimmed it, so a long-running conversation got steadily slower
 * and more expensive and would eventually just fail against the context
 * window — and it would fail on Vero, mid-sentence, with no obvious
 * cause.
 *
 * SENT is the smaller window, but deliberately generous. Measured against
 * the live thread: the knowledge base and panel documentation rebuilt into
 * every prompt come to ~17.5k tokens, and 80 stored messages to ~10k —
 * because stored messages include tool_calls and tool results, which are
 * far more verbose than the visible chat suggests. So history is roughly
 * a third of the payload, not the rounding error it looks like.
 *
 * 80 is still the right number: ~27k tokens a turn is a fraction of the
 * 128k window and costs well under a cent on gpt-4o-mini, while a shorter
 * window costs real continuity in a long working session. But if this ever
 * needs tightening, note that trimming TOOL RESULTS from stored history
 * would reclaim more than shrinking the window, and lose less.
 *
 * What actually persists is NOT in this window: ai_context is loaded in
 * full on every turn, so anything the assistant wrote down (pricing,
 * tone, services) is permanent no matter how long the chat gets. The
 * transcript is a working surface; the knowledge base is the memory.
 * That's why the prompt pushes it to save durable facts rather than rely
 * on remembering them.
 *
 * STORED is larger still — the transcript is Vero's to scroll, and she
 * keeps far more of it than the model is given.
 */
const MAX_HISTORY_SENT = 80;
const MAX_HISTORY_STORED = 400;

/**
 * Trim to at most `limit` trailing messages, starting at a 'user' turn.
 *
 * The boundary matters. A `tool` message is only valid when the
 * `assistant` turn carrying its matching tool_calls is also present —
 * slice in the middle of a tool sequence and OpenAI rejects the whole
 * request. Every conversational exchange starts with a user turn, so
 * advancing to one guarantees a coherent window.
 */
function trimHistory(messages: StoredMessage[], limit: number): StoredMessage[] {
  if (messages.length <= limit) return messages;
  let start = messages.length - limit;
  while (start < messages.length && messages[start].role !== 'user') start++;
  // Everything after the cut was one enormous tool sequence — rather
  // than send something malformed, send nothing and let the system
  // prompt carry the turn.
  return start >= messages.length ? [] : messages.slice(start);
}

let cachedClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (cachedClient) return cachedClient;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY env var missing');
  cachedClient = new OpenAI({ apiKey: key });
  return cachedClient;
}

interface DbWrite {
  type: 'created' | 'updated' | 'deleted';
  category: string;
  label: string;
  // A short paraphrase for the achievement toast, in whatever
  // language the chat is currently running in. The model produces
  // this on the tool call so there's no separate translation
  // roundtrip. Field is language-agnostic on purpose — it's just
  // "the toast text."
  content_summary: string;
}

type ChatLanguage = 'ru' | 'en';
const LANGUAGE_NAMES: Record<ChatLanguage, string> = {
  ru: 'Russian',
  en: 'English',
};

interface StoredMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  tool_call_id?: string;
  name?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const action = req.body?.action;

  try {
    const sql = getDb();

    if (action === 'history') {
      const rows = (await sql`
        SELECT messages FROM assistant_chats WHERE slot = ${CHAT_SLOT} LIMIT 1
      `) as Array<{ messages: StoredMessage[] }>;
      const messages = rows[0]?.messages ?? [];
      // Filter down to just user + assistant text turns for the UI —
      // tool_calls / tool responses / system prompt are noise.
      const displayable = messages.filter(
        (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content,
      );
      return res.status(200).json({ success: true, messages: displayable });
    }

    if (action === 'reset') {
      await sql`
        INSERT INTO assistant_chats (slot, messages)
        VALUES (${CHAT_SLOT}, '[]'::jsonb)
        ON CONFLICT (slot) DO UPDATE SET messages = '[]'::jsonb, updated_at = NOW()
      `;
      return res.status(200).json({ success: true });
    }

    if (action !== 'send') {
      return res.status(400).json({ success: false, error: "action must be 'send' | 'history' | 'reset'" });
    }

    const userMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!userMessage) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    // Load thread history (or bootstrap an empty row).
    const existing = (await sql`
      SELECT messages FROM assistant_chats WHERE slot = ${CHAT_SLOT} LIMIT 1
    `) as Array<{ messages: StoredMessage[] }>;
    const priorMessages: StoredMessage[] = existing[0]?.messages ?? [];

    // Load the full ai_context table into the system prompt so the
    // assistant has instant reference for everything it knows,
    // without needing to burn a tool call for basic questions. The
    // search_knowledge_base tool is still available for structured
    // lookups by category.
    const contextRows = (await sql`
      SELECT id, category, label, content, source, active, updated_at
      FROM ai_context
      ORDER BY category, sort_order, label
    `) as Array<{
      id: string;
      category: string;
      label: string;
      content: string;
      source: 'manual' | 'chatbot' | 'system';
      active: boolean;
      updated_at: string;
    }>;

    // Per-turn UI language. Persisted client-side (per browser),
    // sent through on every send. Falls back to Russian to preserve
    // Vero's default — she's the primary user of this chat.
    const requestedLang = typeof req.body?.language === 'string' ? req.body.language : 'ru';
    const language: ChatLanguage = requestedLang === 'en' ? 'en' : 'ru';

    const systemPrompt = buildSystemPrompt(contextRows, language);

    // Assemble the message list we'll send to OpenAI.
    // Always leads with the fresh system prompt (regenerated each
    // turn so it reflects the current ai_context table), then all
    // prior turns, then the new user turn.
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...trimHistory(priorMessages, MAX_HISTORY_SENT).map(toOpenaiMessage),
      { role: 'user', content: userMessage },
    ];

    // Track everything we're going to persist:
    //   - the user turn (always)
    //   - the assistant's tool_calls turn (if any)
    //   - the tool response turns (one per tool call)
    //   - the assistant's final text turn
    const newlyPersistedMessages: StoredMessage[] = [
      { role: 'user', content: userMessage },
    ];
    const dbWrites: DbWrite[] = [];

    const client = getOpenAI();
    let finalReply = '';

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages: openaiMessages,
        tools: TOOL_DEFINITIONS,
        temperature: 0.4,
      });
      const choice = completion.choices[0];
      const msg = choice?.message;
      if (!msg) throw new Error('OpenAI returned no message');

      // Record the assistant's turn (whether it's a tool-call turn
      // or a final text turn) so the persisted history includes it.
      newlyPersistedMessages.push({
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: msg.tool_calls,
      });
      openaiMessages.push(msg);

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        // No tool call → this is the final answer, exit the loop.
        finalReply = msg.content ?? '';
        break;
      }

      // Execute each tool call and record the response.
      for (const toolCall of msg.tool_calls) {
        const toolResult = await executeToolCall(sql, toolCall, dbWrites);
        const toolResponseText = JSON.stringify(toolResult);
        newlyPersistedMessages.push({
          role: 'tool',
          content: toolResponseText,
          tool_call_id: toolCall.id,
          // Same union narrowing as executeToolCall — only function calls have
          // `.function`, and we never register custom tools.
          name: toolCall.type === 'function' ? toolCall.function.name : 'unknown',
        });
        openaiMessages.push({
          role: 'tool',
          content: toolResponseText,
          tool_call_id: toolCall.id,
        });
      }
    }

    if (!finalReply) {
      finalReply =
        '(The assistant kept calling tools without giving a final answer. Try rephrasing.)';
    }

    // Persist the thread, bounded. Vero keeps far more scrollback than
    // the model is given, but not an unbounded amount.
    const updatedThread = trimHistory(
      [...priorMessages, ...newlyPersistedMessages],
      MAX_HISTORY_STORED,
    );
    await sql`
      INSERT INTO assistant_chats (slot, messages)
      VALUES (${CHAT_SLOT}, ${JSON.stringify(updatedThread)}::jsonb)
      ON CONFLICT (slot) DO UPDATE
        SET messages = ${JSON.stringify(updatedThread)}::jsonb, updated_at = NOW()
    `;

    return res.status(200).json({
      success: true,
      reply: finalReply,
      dbWrites,
      messageCount: updatedThread.filter((m) => m.role === 'user' || m.role === 'assistant').length,
    });
  } catch (err) {
    console.error('[admin/assistant-chat] handler failed:', err);
    return res
      .status(500)
      .json({ success: false, error: err instanceof Error ? err.message : 'Chat failed' });
  }
}

// ────────────────────────────────────────────────────────────────

const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description:
        "Search Vero's photography business knowledge base for entries matching a category (e.g. 'pricing', 'style', 'availability', 'services') and/or a free-text query. Use when the user asks 'what do you know about X' or when you need to check for existing entries before creating a new one to avoid duplicates.",
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description:
              'Optional category filter. Common values: pricing, style, services, availability, delivery, tone, escalation_wrap_up, booking_bridge, website_cta, response_time, contact.',
          },
          query: {
            type: 'string',
            description:
              'Optional case-insensitive substring match against entry label or content (English).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'upsert_knowledge',
      description:
        'Create a new knowledge base entry, or update an existing one. Content MUST be written in English (this table is consumed by the customer-facing AI reply engine, which is English-normalized). Include a short paraphrase in `content_summary` (in the SAME language the user is chatting in) so the achievement toast reads naturally to them. If updating, pass `id`; otherwise omit it and a new row is inserted.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              "Existing entry's UUID to update. Omit to create a new entry. Get this via search_knowledge_base first if updating.",
          },
          category: {
            type: 'string',
            description:
              "Category the entry belongs to. Snake-case if new (e.g. 'wedding_pricing'), or match an existing category exactly.",
          },
          label: {
            type: 'string',
            description:
              'Short human label for the entry (e.g. "Wedding base rate"). English.',
          },
          content: {
            type: 'string',
            description:
              'The actual knowledge, in ENGLISH. E.g. "$3,500 for weddings up to 8 hours; additional hours at $400 each."',
          },
          content_summary: {
            type: 'string',
            description:
              'A very short (5-12 word) paraphrase of the change, IN THE SAME LANGUAGE the user is chatting in, for the toast the user sees. E.g. "Свадебная базовая ставка: $3,500" (RU) or "Wedding base rate: $3,500" (EN).',
          },
        },
        required: ['category', 'label', 'content', 'content_summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_knowledge',
      description:
        'Delete an entry from the knowledge base. Only do this when the user explicitly asks to remove something. Include a short summary of what was deleted, in the user\'s current chat language, for the toast.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: "The entry's UUID (get via search first)." },
          content_summary: {
            type: 'string',
            description: "Short summary of what was deleted, in the user's current chat language, for the toast.",
          },
        },
        required: ['id', 'content_summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_conversations',
      description:
        "List recent customer conversations from the unified inbox (Instagram DMs and email). Use this when Vero refers to a customer by name or asks about 'the conversation with X' and you need to find the right conversation_id. Returns the most recently active conversations first.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "Optional case-insensitive substring to match against the contact's name, handle, or email address.",
          },
          limit: { type: 'number', description: 'How many to return. Default 15, max 40.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_thread',
      description:
        'Read the full message history of one conversation, oldest first, so you can draft a reply that actually responds to what the customer said. Always call this before drafting a reply.',
      parameters: {
        type: 'object',
        properties: {
          conversation_id: { type: 'string', description: 'UUID from list_conversations.' },
        },
        required: ['conversation_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_reply',
      description:
        "Send a reply to a customer on whichever channel the conversation uses (Instagram or email — handled automatically). ONLY call this after showing Vero the draft and getting her explicit approval in the chat. Never call it in the same turn you first propose a draft. The message is sent as Vero herself, not as the AI.",
      parameters: {
        type: 'object',
        properties: {
          conversation_id: { type: 'string', description: 'UUID of the conversation to reply in.' },
          text: {
            type: 'string',
            description:
              "The exact message to send, in the language the CUSTOMER writes in (not the admin chat language). For email, the signature is appended automatically — do not include one.",
          },
          confirmed: {
            type: 'boolean',
            description:
              'Must be true. Set this only after Vero has seen this exact text and explicitly approved sending it.',
          },
          content_summary: {
            type: 'string',
            description: "Short summary for the toast, in the admin chat's language.",
          },
        },
        required: ['conversation_id', 'text', 'confirmed', 'content_summary'],
      },
    },
  },
];

async function executeToolCall(
  sql: ReturnType<typeof getDb>,
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  dbWrites: DbWrite[],
): Promise<unknown> {
  // The SDK's ChatCompletionMessageToolCall is a union: function calls and
  // custom tool calls. Only function calls carry `.function`. We never register
  // custom tools, so anything else is a protocol surprise rather than something
  // to handle.
  if (toolCall.type !== 'function') {
    return { error: `Unsupported tool call type: ${toolCall.type}` };
  }
  const name = toolCall.function.name;
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    return { error: 'Could not parse tool arguments' };
  }

  if (name === 'search_knowledge_base') {
    const category = typeof args.category === 'string' ? args.category : null;
    const query = typeof args.query === 'string' ? args.query.toLowerCase() : null;
    const all = (await sql`
      SELECT id, category, label, content, active, source, updated_at
      FROM ai_context
      ORDER BY category, sort_order, label
    `) as Array<{
      id: string;
      category: string;
      label: string;
      content: string;
      active: boolean;
      source: 'manual' | 'chatbot' | 'system';
      updated_at: string;
    }>;
    const filtered = all.filter((r) => {
      if (category && r.category !== category) return false;
      if (query) {
        const hay = `${r.label} ${r.content}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    return { entries: filtered, total: filtered.length };
  }

  if (name === 'upsert_knowledge') {
    const category = String(args.category ?? '').trim();
    const label = String(args.label ?? '').trim();
    const content = String(args.content ?? '').trim();
    // Prefer the new `content_summary` field, but accept the old
    // `content_ru_summary` name for backward compat (in-flight tool
    // calls from older thread history could still reference it).
    const contentSummary =
      String(args.content_summary ?? args.content_ru_summary ?? '').trim() || label;
    const providedId = typeof args.id === 'string' ? args.id.trim() : '';
    if (!category || !label || !content) {
      return { error: 'category, label, content are required' };
    }

    if (providedId) {
      // source='system' rows document how the admin panel works
      // (migration 018). The assistant must not be able to rewrite its
      // own instructions — it would do so cheerfully if Vero said
      // something like "that's wrong, fix it", and the damage would only
      // surface later as confidently wrong answers.
      const [owner] = (await sql`
        SELECT source FROM ai_context WHERE id = ${providedId}
      `) as Array<{ source: string }>;
      if (owner?.source === 'system') {
        return {
          error:
            'That entry documents how the admin panel works and is maintained by Alex. Tell Vero it can\'t be edited here, and to message Alex if it looks wrong.',
        };
      }
      const updated = (await sql`
        UPDATE ai_context
        SET category = ${category}, label = ${label}, content = ${content},
            source = 'chatbot', updated_at = NOW()
        WHERE id = ${providedId}
        RETURNING id, category, label, content
      `) as Array<{ id: string; category: string; label: string; content: string }>;
      if (updated.length === 0) return { error: `No entry with id ${providedId}` };
      dbWrites.push({ type: 'updated', category, label, content_summary: contentSummary });
      return { success: true, action: 'updated', entry: updated[0] };
    }

    // No id supplied — this is the path the model actually takes most of
    // the time, because it rarely bothers to search first.
    //
    // It used to INSERT unconditionally, which meant every time Vero
    // re-explained something ("make the replies more tailored") the
    // assistant created ANOTHER row instead of revising the existing
    // one. That is the literal mechanism behind "I've told it this
    // several times and nothing changes": her corrections piled up as
    // duplicates, the model saw the same instruction repeated, and the
    // prompt grew without the behavior changing. It left 6 duplicated
    // entries and ~5k wasted characters in every reply's context.
    //
    // Match on (category, label) first. Those are the model's own
    // identifiers for a fact, so re-teaching the same fact now updates
    // it. A genuinely new fact gets a new label and still inserts.
    const existing = (await sql`
      SELECT id FROM ai_context
      WHERE LOWER(category) = LOWER(${category}) AND LOWER(label) = LOWER(${label})
      ORDER BY created_at ASC
      LIMIT 1
    `) as Array<{ id: string }>;

    if (existing.length > 0) {
      const updated = (await sql`
        UPDATE ai_context
        SET content = ${content}, source = 'chatbot', active = TRUE, updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING id, category, label, content
      `) as Array<{ id: string; category: string; label: string; content: string }>;
      dbWrites.push({ type: 'updated', category, label, content_summary: contentSummary });
      return { success: true, action: 'updated', entry: updated[0] };
    }

    const created = (await sql`
      INSERT INTO ai_context (category, label, content, source, active)
      VALUES (${category}, ${label}, ${content}, 'chatbot', TRUE)
      RETURNING id, category, label, content
    `) as Array<{ id: string; category: string; label: string; content: string }>;
    dbWrites.push({ type: 'created', category, label, content_summary: contentSummary });
    return { success: true, action: 'created', entry: created[0] };
  }

  if (name === 'delete_knowledge') {
    const id = String(args.id ?? '').trim();
    if (id) {
      const [owner] = (await sql`
        SELECT source FROM ai_context WHERE id = ${id}
      `) as Array<{ source: string }>;
      if (owner?.source === 'system') {
        return {
          error:
            'That entry documents how the admin panel works and is maintained by Alex. It cannot be deleted here.',
        };
      }
    }
    const contentSummary =
      String(args.content_summary ?? args.content_ru_summary ?? '').trim() || 'entry deleted';
    if (!id) return { error: 'id is required' };
    // The guard above already returns for source='system', so this predicate is
    // belt-and-braces — the two statements are separate, and this is the only
    // thing standing between a race and the assistant erasing its own
    // documentation. _context-delete.ts carries the same clause.
    const deleted = (await sql`
      DELETE FROM ai_context WHERE id = ${id} AND source <> 'system'
      RETURNING id, category, label
    `) as Array<{ id: string; category: string; label: string }>;
    if (deleted.length === 0) return { error: `No entry with id ${id}` };
    dbWrites.push({
      type: 'deleted',
      category: deleted[0].category,
      label: deleted[0].label,
      content_summary: contentSummary,
    });
    return { success: true, action: 'deleted', entry: deleted[0] };
  }

  // ── Reply co-pilot ────────────────────────────────────────────
  //
  // Replaces Veronika's actual workflow: screenshot the message, paste
  // it into ChatGPT, ask for a reply, copy it back. She can now say
  // "help me answer Sarah" and stay in one place.

  if (name === 'list_conversations') {
    const query = String(args.query ?? '').trim();
    const rawLimit = Number(args.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 40) : 15;
    const like = `%${query}%`;

    const rows = (await sql`
      SELECT c.id, c.platform, c.contact_name, c.contact_handle, c.external_user_id,
             c.ai_enabled, c.unread_count, c.last_message_at,
             last_msg.body AS last_body, last_msg.direction AS last_direction
      FROM conversations c
      LEFT JOIN LATERAL (
        SELECT body, direction FROM messages m
        WHERE m.conversation_id = c.id ORDER BY m.sent_at DESC LIMIT 1
      ) last_msg ON TRUE
      WHERE ${query === ''}
         OR c.contact_name ILIKE ${like}
         OR c.contact_handle ILIKE ${like}
         OR c.external_user_id ILIKE ${like}
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT ${limit}
    `) as Array<Record<string, unknown>>;

    return {
      conversations: rows.map((r) => ({
        conversation_id: r.id,
        channel: r.platform,
        name: r.contact_name ?? r.contact_handle ?? r.external_user_id,
        unread: r.unread_count,
        last_message_at: r.last_message_at,
        // Truncated: the model only needs enough to pick the right
        // thread. read_thread gives it the full history.
        last_message: typeof r.last_body === 'string' ? r.last_body.slice(0, 160) : null,
        last_message_from: r.last_direction === 'inbound' ? 'customer' : 'us',
      })),
    };
  }

  if (name === 'read_thread') {
    const conversationId = String(args.conversation_id ?? '').trim();
    if (!conversationId) return { error: 'conversation_id is required' };

    const [convo] = (await sql`
      SELECT platform, contact_name, contact_handle, external_user_id, ai_enabled
      FROM conversations WHERE id = ${conversationId} LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!convo) return { error: 'No conversation with that id' };

    const msgs = (await sql`
      SELECT direction, sender, channel, body, subject, sent_at
      FROM messages WHERE conversation_id = ${conversationId}
      ORDER BY sent_at ASC LIMIT 40
    `) as Array<Record<string, unknown>>;

    return {
      channel: convo.platform,
      name: convo.contact_name ?? convo.contact_handle ?? convo.external_user_id,
      ai_enabled: convo.ai_enabled,
      messages: msgs.map((m) => ({
        from: m.direction === 'inbound' ? 'customer' : m.sender === 'ai' ? 'ai' : 'vero',
        channel: m.channel,
        subject: m.subject ?? undefined,
        text: m.body,
        sent_at: m.sent_at,
      })),
    };
  }

  if (name === 'send_reply') {
    const conversationId = String(args.conversation_id ?? '').trim();
    const text = String(args.text ?? '').trim();
    const contentSummary = String(args.content_summary ?? '').trim() || 'reply sent';
    if (!conversationId || !text) {
      return { error: 'conversation_id and text are required' };
    }
    // Structural speed bump on top of the prompt instruction. The model
    // has to affirmatively assert approval, which makes an accidental
    // send take a deliberate step rather than a plausible next token.
    if (args.confirmed !== true) {
      return {
        error:
          'Not sent. Show Vero the draft and get her explicit approval first, then call again with confirmed=true.',
      };
    }

    // Goes through the SAME path as the Messages panel's Send button —
    // threading headers, signature, persist-before-send ordering and
    // channel dispatch all included. See api/_reply-delivery.ts.
    const result = await deliverReply(sql, conversationId, text);
    if (!result.ok) {
      if (result.status === 409) {
        return {
          error:
            'That exact message was already sent to this person in the last 15 minutes. Tell Vero it looks like a duplicate and ask whether she wants it sent again anyway.',
        };
      }
      return { error: result.error ?? 'Send failed' };
    }
    console.log(
      `[assistant-chat] sent reply via co-pilot to conversation=${conversationId}`,
    );
    dbWrites.push({
      type: 'created',
      category: 'reply',
      label: 'Reply sent',
      content_summary: contentSummary,
    });
    return { success: true, sent: true, message_id: result.message?.id ?? null };
  }

  return { error: `Unknown tool: ${name}` };
}

/**
 * Convert a stored message back to the shape OpenAI's API expects.
 * `tool_call_id` is required on tool messages; `tool_calls` optional
 * on assistant messages. Regular user/assistant text messages pass
 * through unchanged.
 */
function toOpenaiMessage(m: StoredMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (m.role === 'tool') {
    return {
      role: 'tool',
      content: m.content ?? '',
      tool_call_id: m.tool_call_id ?? '',
    };
  }
  if (m.role === 'assistant') {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.tool_calls,
    } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
  }
  if (m.role === 'system') {
    return { role: 'system', content: m.content ?? '' };
  }
  return { role: 'user', content: m.content ?? '' };
}

function buildSystemPrompt(
  contextRows: Array<{
    id: string;
    category: string;
    label: string;
    content: string;
    source: 'manual' | 'chatbot' | 'system';
    active: boolean;
  }>,
  language: ChatLanguage,
): string {
  // Group by category for readable rendering. Include ID so the
  // model can pass it to upsert_knowledge for updates without
  // needing an extra search call.
  // Two different kinds of knowledge live in this table and must be
  // rendered separately. source='system' rows document how the ADMIN
  // PANEL works (migration 018) — they answer Vero's "how do I…"
  // questions. Everything else is business knowledge that drives the
  // customer-facing reply engine. Mixing them in one list made the model
  // treat panel documentation as something to quote at customers.
  const byCategory = new Map<string, typeof contextRows>();
  const systemRows: typeof contextRows = [];
  for (const row of contextRows) {
    if (!row.active) continue;
    if (row.source === 'system') {
      systemRows.push(row);
      continue;
    }
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  }

  const systemKnowledge =
    systemRows.length === 0
      ? '(Not loaded yet.)'
      : systemRows
          .map((r) => `- **${r.label}**: ${r.content}`)
          .join('\n');
  const knowledgeSummary =
    byCategory.size === 0
      ? '(No entries yet — the knowledge base is empty. Feel free to help Vero populate it.)'
      : [...byCategory.entries()]
          .map(([cat, rows]) => {
            const items = rows
              .map((r) => `  - [${r.id}] ${r.label}: ${r.content}`)
              .join('\n');
            return `## ${cat}\n${items}`;
          })
          .join('\n\n');

  const langName = LANGUAGE_NAMES[language];
  // Language-specific concrete examples so the model doesn't default
  // to the wrong tongue when the user's UI has been switched.
  const exampleConfirm =
    language === 'ru'
      ? '"Записал новую цену — $600 для семейных сессий"'
      : '"Saved new price — $600 for family sessions"';

  return `You are Vero's INTERNAL personal AI assistant, talking privately to Vero (or Alex, her admin) inside her business admin panel. Vero is a professional photographer (portraits, weddings, families, maternity). This is a private back-office chat — NOT a customer-facing channel.

You have full context that your only audience is Vero herself (or another admin helping her). Never introduce yourself as if you were meeting a stranger. Never talk ABOUT Vero in the third person to Vero. If she greets you with "hi" or "привет", greet her back naturally and briefly ("Привет! Что нужно?" / "Hey — what can I help with?"). Ask what she wants to work on, or offer a quick pointer if you know she's mid-way through something.

## Your job
Help Vero read, review, and shape the customer-reply knowledge base (the ai_context table) through natural conversation. That knowledge base drives a SEPARATE customer-facing AI that replies to Instagram DMs — you are NOT that customer-facing AI. When you edit an entry, you're editing the DATA that the OTHER AI uses to talk to customers.

## LANGUAGE RULES (critical)
- The user has set their interface language to ${langName}. ALWAYS respond in ${langName}, regardless of what language the incoming message was in. If they message in English but the UI language is Russian, still reply in Russian.
- The knowledge base itself is stored in ENGLISH (because the customer-facing AI needs English text to reply to customers correctly). When you call upsert_knowledge, the "content" argument MUST be in English — translate whatever the user says into clean, concise English before storing.
- Every upsert/delete call includes a "content_summary" argument — a very short paraphrase (5-12 words) of what changed, in ${langName} (matching the current UI language). This is what shows up in the achievement toast, so it needs to read naturally in ${langName}.

## SAFETY RULES for knowledge base writes
- Before creating a new entry, ALWAYS call search_knowledge_base first to check if one already exists for the same concept — update it instead of duplicating.
- For price changes: if a new value is more than ~50% different from an existing value (either up or down), briefly double-check in the chat before writing ("You said $50 — should that be $500? Just making sure it's not a typo."). For small tweaks (say $500 → $550), just do it, no confirmation.
- Never delete an entry without an explicit request from the user.
- For feedback about how the customer-facing AI is behaving (e.g. "the replies are too formal", "she replies too often"), translate that into concrete style/tone entries in the "tone" category, so the reply engine picks them up.

## CUSTOMER-REPLY KNOWLEDGE BASE (this is DATA, not your identity)
Below is everything currently in the customer-reply knowledge base. Read it as raw data — DO NOT quote it as if it were your own greeting or your own voice. Entries under the "identity" category describe how the CUSTOMER-FACING bot introduces itself to CUSTOMERS — those are NOT how you introduce yourself to Vero. When you're greeting Vero, you're greeting her personally as her internal assistant, not reciting a template from this table.

${knowledgeSummary}

## HELPING VERO ANSWER CUSTOMERS (reply co-pilot)
This is the single most valuable thing you do for her. Her current habit is to copy a whole conversation into ChatGPT, work out a reply there, and paste it back. You have MORE context than that — the full thread, her pricing, her tone, her services — so there is no reason for her to leave.

She can ask to reply to someone — "help me answer Sarah", "draft a reply to that wedding inquiry", or just "help me reply to someone". When she does:
1. **If she named a person**, use list_conversations with that name and go straight to step 2. Don't make her pick from a list when she already told you who.
2. **If she DIDN'T name anyone**, call list_conversations with no query, then show her the most recent 4-5 in a short numbered list — name, channel, and a few words about what they last said — and ask which one. Keep it scannable; she's picking, not reading.
3. Use read_thread to read what was actually said. NEVER draft from the name alone.
4. Write the draft IN THE CHAT so she can read it in full. Write it in the language the CUSTOMER uses, even if you and Vero are talking in another language. Use what you know — her pricing ranges, her services, her tone — and ask her for anything you'd need that isn't in the thread.
5. Then ASK: would you like me to send this, or do you want to change something? Do NOT call send_reply in the same turn you first show a draft, ever.
6. Only after she approves ("yes", "send it", "да, отправь") call send_reply with confirmed=true and the exact approved text.
If she asks for changes, revise and show it again. If she'd rather send it herself, that's fine — the draft is right there in the chat for her to copy. It goes out as Vero herself, on whatever channel the conversation uses; you don't need to think about Instagram vs email, that's handled.

## HOW THE ADMIN PANEL WORKS (answer her questions from this)
Vero will ask you how to DO things — "I finished a gallery, how do I give the client access?", "how do I add a photo to the site?". Answer from the facts below. These are maintained by Alex and you cannot edit or delete them; if she says one is wrong, tell her to message Alex rather than trying to change it.

If something is BROKEN rather than just unfamiliar — the site is down, emails aren't arriving, Instagram messages stopped — that's Alex's, not something she should try to fix. Say so directly, and tell her what to send him so he can diagnose it quickly.

If the answer genuinely isn't below, say you don't know and suggest she ask Alex. Do NOT guess at steps — a confident wrong instruction wastes her time and makes her stop trusting you.

${systemKnowledge}

## STYLE
- Warm and casual, like a smart friend who happens to run the business's systems.
- Concise. Vero's a working photographer, not a corporate exec — don't over-explain.
- When you make a change to the knowledge base, mention it briefly in your reply (${exampleConfirm}). The toast handles the visual, but a one-line confirmation in the chat closes the loop.
- If the user asks a question you can answer from the current knowledge base above, just answer — no need to call search_knowledge_base for something already visible in the context.
- Never say "Vero's currently in a session" or similar — that phrasing is aimed at CUSTOMERS. YOU are talking to Vero. She knows what she's doing.`;
}
