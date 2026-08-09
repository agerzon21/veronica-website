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
 * Tool loop: OpenAI can call search_knowledge_base / upsert_knowledge
 * / delete_knowledge. We execute the tool, feed the result back,
 * loop until it stops calling tools and just returns a text reply.
 * Hard cap of 8 tool-call rounds per turn so a runaway loop can't
 * eat the function budget.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

const MODEL = 'gpt-4o-mini';
const MAX_TOOL_ROUNDS = 8;
const CHAT_SLOT = 'default';

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
  // content_ru: an already-Russian short paraphrase for the toast.
  // The model produces this on the tool call — no separate
  // translation roundtrip needed.
  content_ru: string;
}

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
      source: 'manual' | 'chatbot';
      active: boolean;
      updated_at: string;
    }>;

    const systemPrompt = buildSystemPrompt(contextRows);

    // Assemble the message list we'll send to OpenAI.
    // Always leads with the fresh system prompt (regenerated each
    // turn so it reflects the current ai_context table), then all
    // prior turns, then the new user turn.
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...priorMessages.map(toOpenaiMessage),
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
          name: toolCall.function.name,
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

    // Persist the full expanded thread to the DB.
    const updatedThread = [...priorMessages, ...newlyPersistedMessages];
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
        'Create a new knowledge base entry, or update an existing one. Content MUST be written in English (this table is consumed by the customer-facing AI reply engine, which is English-normalized). Include a short Russian paraphrase in `content_ru_summary` so the achievement toast Vero sees is in her language. If updating, pass `id`; otherwise omit it and a new row is inserted.',
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
          content_ru_summary: {
            type: 'string',
            description:
              'A very short (5-12 word) paraphrase of the change in Russian, for the toast Vero sees. E.g. "Свадебная базовая ставка: $3,500".',
          },
        },
        required: ['category', 'label', 'content', 'content_ru_summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_knowledge',
      description:
        'Delete an entry from the knowledge base. Only do this when the user explicitly asks to remove something. Include a Russian summary of what was deleted for the toast.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: "The entry's UUID (get via search first)." },
          content_ru_summary: {
            type: 'string',
            description: 'Short Russian summary of what was deleted, for the toast.',
          },
        },
        required: ['id', 'content_ru_summary'],
      },
    },
  },
];

async function executeToolCall(
  sql: ReturnType<typeof getDb>,
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  dbWrites: DbWrite[],
): Promise<unknown> {
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
      source: 'manual' | 'chatbot';
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
    const contentRu = String(args.content_ru_summary ?? '').trim() || label;
    const providedId = typeof args.id === 'string' ? args.id.trim() : '';
    if (!category || !label || !content) {
      return { error: 'category, label, content are required' };
    }

    if (providedId) {
      const updated = (await sql`
        UPDATE ai_context
        SET category = ${category}, label = ${label}, content = ${content},
            source = 'chatbot', updated_at = NOW()
        WHERE id = ${providedId}
        RETURNING id, category, label, content
      `) as Array<{ id: string; category: string; label: string; content: string }>;
      if (updated.length === 0) return { error: `No entry with id ${providedId}` };
      dbWrites.push({ type: 'updated', category, label, content_ru: contentRu });
      return { success: true, action: 'updated', entry: updated[0] };
    }

    const created = (await sql`
      INSERT INTO ai_context (category, label, content, source, active)
      VALUES (${category}, ${label}, ${content}, 'chatbot', TRUE)
      RETURNING id, category, label, content
    `) as Array<{ id: string; category: string; label: string; content: string }>;
    dbWrites.push({ type: 'created', category, label, content_ru: contentRu });
    return { success: true, action: 'created', entry: created[0] };
  }

  if (name === 'delete_knowledge') {
    const id = String(args.id ?? '').trim();
    const contentRu = String(args.content_ru_summary ?? '').trim() || 'запись удалена';
    if (!id) return { error: 'id is required' };
    const deleted = (await sql`
      DELETE FROM ai_context WHERE id = ${id}
      RETURNING id, category, label
    `) as Array<{ id: string; category: string; label: string }>;
    if (deleted.length === 0) return { error: `No entry with id ${id}` };
    dbWrites.push({
      type: 'deleted',
      category: deleted[0].category,
      label: deleted[0].label,
      content_ru: contentRu,
    });
    return { success: true, action: 'deleted', entry: deleted[0] };
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
    source: 'manual' | 'chatbot';
    active: boolean;
  }>,
): string {
  // Group by category for readable rendering. Include ID so the
  // model can pass it to upsert_knowledge for updates without
  // needing an extra search call.
  const byCategory = new Map<string, typeof contextRows>();
  for (const row of contextRows) {
    if (!row.active) continue;
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  }
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

  return `You are Vero's personal AI business assistant. Vero is a professional photographer (portraits, weddings, families, maternity). Her customer-facing AI reply engine uses a structured "knowledge base" table to answer her Instagram DMs — this is the SAME table you can search + modify via your tools. Your job is to help Vero read, review, and shape that knowledge base through natural conversation.

## LANGUAGE RULES (critical)
- Vero speaks Russian. ALWAYS respond in Russian, regardless of what language the user's message was in.
- The knowledge base itself is stored in ENGLISH (because the customer-facing AI needs English text to reply to customers correctly). When you call upsert_knowledge, the "content" argument MUST be in English — translate what Vero says into clean, concise English before storing.
- Every upsert/delete call includes a "content_ru_summary" argument — a very short Russian paraphrase (5-12 words) of what changed. This is what Vero sees in the achievement toast, so it needs to be clear + concise + Russian.

## SAFETY RULES for knowledge base writes
- Before creating a new entry, ALWAYS call search_knowledge_base first to check if one already exists for the same concept — update it instead of duplicating.
- For price changes: if a new value is more than ~50% different from an existing value (either up or down), briefly double-check in the chat before writing ("You said $50 — should that be $500? Just making sure it's not a typo."). For small tweaks (say $500 → $550), just do it, no confirmation.
- Never delete an entry without an explicit request from Vero.
- For feedback about how the customer-facing AI is behaving (e.g. "the replies are too formal", "she replies too often"), translate that into concrete style/tone entries in the "tone" category, so the reply engine picks them up.

## CURRENT KNOWLEDGE BASE
Here's everything currently in the knowledge base. Reference this before searching — for many questions, the answer is already right here. Use search_knowledge_base for larger structured queries or fresh checks.

${knowledgeSummary}

## STYLE
- Warm and casual, like a smart friend who happens to run her business systems.
- Concise. She's a working photographer, not a corporate exec — don't over-explain.
- When you make a change to the knowledge base, mention it briefly in your reply ("Записал новую цену — $600 для семейных сессий"). The toast handles the visual, but a one-line confirmation in the chat closes the loop.
- If she asks a question you can answer from the current knowledge base above, just answer — no need to call search_knowledge_base for something already visible in the context.`;
}
