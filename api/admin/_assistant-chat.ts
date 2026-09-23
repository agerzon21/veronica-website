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
 *      answer back. Sending goes through api/_reply-delivery.ts, the
 *      same path as the Messages panel's Send button, so threading,
 *      signature and idempotency are identical. Approval is ENFORCED IN
 *      CODE: looksLikeSendApproval (api/_house-style.ts) reads Vero's
 *      own words for this turn, and nothing else can authorise a send.
 *      The model's confirmed=true flag is now advisory only. It used to
 *      be the entire gate, and on 2026-09-18 the model read an edit
 *      request as approval and mailed a paying customer.
 *   3. ANSWERS "HOW DO I…" QUESTIONS about the admin panel itself, from
 *      ai_context rows with source='system'. Those are written by Alex,
 *      are excluded from the customer-facing prompt (migration 018), and
 *      are protected from edit/delete here — otherwise the assistant
 *      could be talked into deleting its own documentation.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { coreRulesForAssistant } from '../_reply-core-rules.js';
import OpenAI from 'openai';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { deliverReply } from '../_reply-delivery.js';
import { portalContextBlock } from '../_ai-reply.js';
import { stripSubjectHeader, scrubSubjectLines } from '../_subject-strip.js';
import { paymentFactsForAdmin } from '../../src/data/payment-handles.js';
import {
  CONTRACT_TEMPLATES,
  CONTRACT_TYPE_ORDER,
} from '../../src/data/contract-template.js';
import {
  applyHouseStyle,
  findCustomerNameIn,
  legacyRuleKey,
  looksLikeSendApproval,
  looksLikeStandingRule,
  ruleKey,
  WRITING_RULES_CATEGORY,
} from '../_house-style.js';

const MODEL = 'gpt-4o-mini';
const MAX_TOOL_ROUNDS = 8;
/**
 * Transcripts are keyed by `slot`, which is already a UNIQUE text column, so
 * scoping a chat to one conversation needs no schema change: it is just a
 * different string. A conversation gets `conv:<uuid>`; anything else, including
 * every existing client that sends no conversationId, gets the shared thread.
 *
 * The shared one is named 'general' rather than 'default' so the name says what
 * it is now that it is no longer the only one. Migration, applied by hand:
 *   UPDATE assistant_chats SET slot = 'general' WHERE slot = 'default';
 */
/**
 * A turn the UI can render: real text, not a bare tool call or tool result.
 * Shared by the history read and the send response so the transcript the client
 * shows live is the same one it gets back after a reload.
 */
function isDisplayableTurn(m: { role: string; content?: unknown }): boolean {
  // The role check lives HERE, not at the call sites. It was at one call site
  // and not the other, so the send response happily returned tool RESULTS as
  // chat turns: a raw read_thread dump of the customer's email, and the literal
  // {"success":true,"action":"draft_updated",...} payload, both rendered as
  // assistant bubbles. Reload looked fine because the history filter still had
  // its own role check.
  if (m.role !== 'user' && m.role !== 'assistant') return false;
  return typeof m.content === 'string' && m.content.length > 0;
}

/**
 * The last thing the assistant actually said out loud, before this turn.
 *
 * The send gate needs it: a bare "yes" or "да" means send only when the
 * question on the table was "shall I send this". Tool-call turns carry no
 * prose and are skipped, so what comes back is the text Vero was looking at
 * when she typed her answer.
 */
function lastAssistantTextOf(messages: StoredMessage[]): string {
  const said: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    // Stop at the previous user turn: anything older answered a different
    // question and cannot be what she is saying yes to.
    if (m.role === 'user') break;
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) {
      // One reply can span several assistant turns (the rewrite, then a short
      // follow-up), and the offer to send can be in either.
      said.unshift(m.content);
    }
  }
  return said.join('\n');
}

/**
 * Prose that reads as "I wrote that down", in both languages the panel
 * speaks. Used only to decide whether to POINT OUT that nothing was written;
 * see the note where it is used for why over-matching is harmless.
 */
const CLAIM_PHRASES: RegExp[] = [
  /\b(updated|recorded|saved|noted|logged|added)\b/i,
  /\bhas been (updated|recorded|saved|added|changed)\b/i,
  /\bI(?:'ve| have) (updated|recorded|saved|noted|added)\b/i,
  /(обновил|записал|сохранил|добавил|внёс|внес)/i,
];

const GENERAL_SLOT = 'general';
/**
 * What the shared thread was called before it had siblings. Migration 029
 * renames it, but reads fall back to it so the deploy does not have to wait for
 * the migration: until it runs, the general thread still finds its 392
 * messages under the old name instead of looking empty.
 */
const LEGACY_GENERAL_SLOT = 'default';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Slots to read from, most specific first. */
function readSlots(slot: string): string[] {
  return slot === GENERAL_SLOT ? [GENERAL_SLOT, LEGACY_GENERAL_SLOT] : [slot];
}

function resolveSlot(conversationId: unknown): string {
  return typeof conversationId === 'string' && UUID_RE.test(conversationId)
    ? `conv:${conversationId.toLowerCase()}`
    : GENERAL_SLOT;
}

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
/**
 * 400 was tuned for one shared rope holding every conversation at once. A
 * per-conversation thread does not need anything like that, and 66 of them at
 * 400 would be several megabytes of jsonb for nothing. The general thread keeps
 * the larger budget because it genuinely is the long one.
 */
const MAX_HISTORY_STORED_GENERAL = 400;
const MAX_HISTORY_STORED_CONVERSATION = 120;

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
  // Everything after the cut was one enormous tool sequence. Rather than send
  // something malformed, fall back to the most recent user turns only: dropping
  // the whole window was throwing away what Vero had just told the assistant,
  // which is the exact failure she reports as "it forgot what I said".
  if (start >= messages.length) {
    return messages.filter((m) => m.role === 'user').slice(-Math.min(limit, 8));
  }
  return messages.slice(start);
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
  /**
   * For a draft write, the exact text that was stored.
   *
   * The panel needs this separately from the chat prose. The assistant answers
   * Vero in HER language and writes the draft inside that same message in the
   * CUSTOMER's language, so the turn is mixed. Translating the whole turn, as
   * the panel used to, meant an English answer being rendered back into
   * Russian for a reader whose panel was already in English. Only the draft
   * ever needs translating, and only when it is not already in her language.
   */
  draft_text?: string;
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
  const slot = resolveSlot(req.body?.conversationId);
  const maxStored =
    slot === GENERAL_SLOT ? MAX_HISTORY_STORED_GENERAL : MAX_HISTORY_STORED_CONVERSATION;

  try {
    const sql = getDb();

    if (action === 'history') {
      const rows = (await sql`
        SELECT slot, messages FROM assistant_chats WHERE slot = ANY(${readSlots(slot)})
      `) as Array<{ slot: string; messages: StoredMessage[] }>;
      const messages =
        rows.find((r) => r.slot === slot)?.messages ?? rows[0]?.messages ?? [];
      // Filter down to just user + assistant text turns for the UI —
      // tool_calls / tool responses / system prompt are noise.
      const displayable = messages.filter(
        (m) => isDisplayableTurn(m),
      );
      return res.status(200).json({ success: true, messages: displayable });
    }

    if (action === 'reset') {
      await sql`
        INSERT INTO assistant_chats (slot, messages)
        VALUES (${slot}, '[]'::jsonb)
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
      SELECT slot, messages FROM assistant_chats WHERE slot = ANY(${readSlots(slot)})
    `) as Array<{ slot: string; messages: StoredMessage[] }>;
    const priorMessages: StoredMessage[] =
      existing.find((r) => r.slot === slot)?.messages ?? existing[0]?.messages ?? [];

    // Load the full ai_context table into the system prompt so the
    // assistant has instant reference for everything it knows,
    // without needing to burn a tool call for basic questions. The
    // search_knowledge_base tool is still available for structured
    // lookups by category.
    // Names currently in the inbox. Cheap, and it is what the guard in
    // executeToolCall matches labels against.
    const contactNames = (
      (await sql`
        SELECT DISTINCT contact_name FROM conversations
        WHERE contact_name IS NOT NULL AND contact_name <> ''
      `) as Array<{ contact_name: string }>
    ).map((r) => r.contact_name);

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

    // Resolve the open conversation so the prompt can name it. Only when the
    // request is scoped to one; the general thread has no open conversation.
    let openConversation: {
      id: string;
      name: string;
      customerLang: 'ru' | 'en' | null;
      portalBlock: string | null;
      digest: string;
    } | null =
      null;
    if (slot !== GENERAL_SLOT) {
      const convId = slot.slice('conv:'.length);
      const [row] = (await sql`
        SELECT id, contact_name, contact_handle, external_user_id
        FROM conversations WHERE id = ${convId} LIMIT 1
      `) as Array<{
        id: string;
        contact_name: string | null;
        contact_handle: string | null;
        external_user_id: string | null;
      }>;
      if (row) {
        openConversation = {
          id: row.id,
          // Falls through the same chain list_conversations and read_thread
          // already use. An email thread whose contact_name was never filled
          // in still has an address, and an address is a far better answer
          // than the words "this customer": the model handed Vero a draft
          // addressed to "[Client's Name]" while the name was in the thread
          // it was holding.
          name: row.contact_name || row.contact_handle || row.external_user_id || 'this customer',
          // Stated in the prompt as a fact, so the model knows the target
          // language BEFORE writing rather than by being bounced by the
          // tool guard after.
          customerLang: await customerLanguage(sql, row.id),
          // Portal state the thread does not contain — this is how the
          // assistant can help write "your portal invite is in your inbox"
          // right after Vero creates the portal. See portalContextBlock.
          portalBlock: await portalContextBlock(sql, row.id),
          digest: await threadDigest(sql, row.id),
        };
      }
    }
    const systemPrompt = buildSystemPrompt(contextRows, language, openConversation);

    // Assemble the message list we'll send to OpenAI.
    // Always leads with the fresh system prompt (regenerated each
    // turn so it reflects the current ai_context table), then all
    // prior turns, then the new user turn.
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      // The prompt itself goes through house style before the model reads it.
      // This file's own instructions were full of em dashes, and a model copies
      // the punctuation it is shown whatever the words say.
      { role: 'system', content: applyHouseStyle(systemPrompt) },
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
    /**
     * Tool errors that Vero has to be shown regardless of what the model says
     * about them. Tagged by tool so the chat line can name the right failure:
     * a note that was not saved and an email that was not sent are very
     * different pieces of news.
     */
    const toolFailures: Array<{ tool: string; error: string }> = [];
    const dbWrites: DbWrite[] = [];
    /**
     * Sends completed during THIS request, shared with executeToolCall.
     *
     * One approval authorises one send. The tool loop below runs up to
     * MAX_TOOL_ROUNDS times on a single message from Vero, so without a cap
     * "send it" would license eight sends, and a model that decides the first
     * one failed is entirely capable of trying again.
     */
    const sendsThisRequest = { n: 0 };

    // Write the thread once here, holding nothing but Vero's message, before
    // any model call happens.
    //
    // The transcript used to be saved in a single statement AFTER the whole
    // tool loop, so anything that stopped the loop threw her turn away: a tool
    // error, an OpenAI timeout, or simply the 60s function limit on a turn
    // with several tool rounds. What she saw was the assistant forgetting an
    // instruction she had definitely given, in the same conversation. Her
    // words now survive the request that carried them, whatever happens next.
    const persistThread = async (turns: StoredMessage[]): Promise<StoredMessage[]> => {
      const thread = trimHistory([...priorMessages, ...turns], maxStored);
      const json = JSON.stringify(thread);
      await sql`
        INSERT INTO assistant_chats (slot, messages)
        VALUES (${slot}, ${json}::jsonb)
        ON CONFLICT (slot) DO UPDATE
          SET messages = ${json}::jsonb, updated_at = NOW()
      `;
      return thread;
    };
    await persistThread(newlyPersistedMessages);

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

      // Chat prose passes no tool, so the subject guard has to run on the
      // DISPLAYED text too — the model presents drafts inside its bubbles,
      // and a "Subject:" there reads exactly like the rule not working,
      // whatever the actual draft row says.
      const shownContent = msg.content
        ? applyHouseStyle(scrubSubjectLines(msg.content))
        : msg.content;

      // Record the assistant's turn (whether it's a tool-call turn
      // or a final text turn) so the persisted history includes it.
      newlyPersistedMessages.push({
        role: 'assistant',
        content: shownContent ?? null,
        tool_calls: msg.tool_calls,
      });
      openaiMessages.push(msg);

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        // No tool call → this is the final answer, exit the loop.
        finalReply = shownContent ?? '';
        break;
      }

      // Execute each tool call and record the response.
      for (const toolCall of msg.tool_calls) {
        const toolResult = await executeToolCall(sql, toolCall, dbWrites, contactNames, {
          // Ground truth, resolved from the slot before the model ran. Never a
          // tool parameter: see record_client_facts.
          openConversationId: slot === GENERAL_SLOT ? null : slot.slice('conv:'.length),
          userMessage,
          lastAssistantText: lastAssistantTextOf(priorMessages),
          sends: sendsThisRequest,
          // The draft she was offered last turn, plus anything written this
          // turn before the tool ran. That is the whole of what she can
          // possibly have read.
          shownText: [
            lastAssistantTextOf(priorMessages),
            ...newlyPersistedMessages
              .filter((m) => m.role === 'assistant' && typeof m.content === 'string')
              .map((m) => m.content as string),
          ].join('\n'),
        });
        // A knowledge write that failed must be VISIBLE. The model gets the
        // error back and is told to relay it, but a model that just claimed
        // "saved!" is also capable of glossing over the failure — and did:
        // Vero was told a note was saved when nothing was written. This
        // surfaces the failure as its own chat line no matter what the model
        // says about it.
        //
        // send_reply is on this list for the same reason, and it is the more
        // important of the two. A blocked send must not be narratable: the
        // model that talked itself into calling the tool is the last thing
        // that should get to decide how the refusal is described, or whether
        // Vero hears about it at all. This warning mechanism is the only
        // reason the failed note save was ever noticed; the send path is
        // exactly what lacked it.
        if (
          toolCall.type === 'function' &&
          (toolCall.function.name === 'upsert_knowledge' ||
            toolCall.function.name === 'delete_knowledge' ||
            toolCall.function.name === 'send_reply') &&
          toolResult &&
          typeof toolResult === 'object' &&
          'error' in toolResult
        ) {
          toolFailures.push({
            tool: toolCall.function.name,
            error: String((toolResult as { error: unknown }).error),
          });
        }
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

    // Backstop: Vero gave a standing instruction and the model did not save it.
    //
    // This is the failure she has hit over and over. The refine block above
    // tells the model to rewrite the draft and then stop, and it obeys that
    // literally: the turn ends with the rewrite and nothing is written down, so
    // the same correction has to be given again tomorrow. Worse, it often says
    // "noted, I've saved that" while having called no tool at all.
    //
    // So the code saves it instead of hoping. Narrow by design: only when the
    // message reads as a standing rule (see looksLikeStandingRule) and no
    // knowledge write succeeded this turn. What it captures is announced in the
    // chat and is editable in the Context tab, so a wrong catch costs one line
    // and one click.
    let capturedRule: string | null = null;
    if (
      looksLikeStandingRule(userMessage) &&
      !dbWrites.some((w) => w.type !== 'deleted' && w.category !== 'draft')
    ) {
      const key = ruleKey(userMessage).slice(0, 120);
      // A rule naming a customer is not a rule. ai_context is loaded whole into
      // the prompt that answers EVERY customer, so "reply to Anna and keep it
      // short" would put Anna's name in front of everyone else. This is the
      // same guard executeToolCall applies to model-chosen labels, using the
      // same list of names currently in the inbox.
      //
      // The veto used to be a bare substring match, so a client called Sue
      // silently vetoed any rule containing "issue". It is a word-boundary
      // match now, and when it does fire it says so in the log: a rule that
      // vanishes with no chat line and no trace is indistinguishable from the
      // save bug Alex reported, and that ambiguity cost a day.
      const namesACustomer = findCustomerNameIn(userMessage, contactNames);
      if (namesACustomer) {
        console.warn(
          `[assistant-chat] standing rule not captured: it names a customer (${namesACustomer}). ` +
            `Message: ${userMessage.slice(0, 160)}`,
        );
      }

      if (key && !namesACustomer) {
        try {
          // Read first, then insert or update. An ON CONFLICT clause needs a
          // unique index to arbitrate on, and migrations are applied by hand
          // AFTER a deploy, so for the window between the two there is no such
          // index: every turn would have inserted another copy, and those
          // copies would then make migration 034 unrunnable.
          //
          // Matched by KEY rather than by label, which is not the same thing
          // once a rule can be sitting under an older form of its own key. See
          // findWritingRule: it looks for today's key, then for a row whose own
          // content keys to the same rule today, then for the old form of this
          // rule's key, and that middle pass is the relabel migration this
          // change ships instead of a migration file.
          //
          // It excludes source='system' rows, which matters more here than it
          // looks. This path had no source check at all, so a rule Vero typed
          // could overwrite a piece of Alex's documentation outright if their
          // labels happened to meet, and a lookup that reaches further makes
          // that likelier rather than less likely.
          const existingRule = await findWritingRule(sql, userMessage);
          const content = applyHouseStyle(userMessage);
          // SET label is the self-migration. A row found under an older key
          // comes back carrying the current one, so it is found the ordinary
          // way from then on and the old form dies out as rules get restated.
          const relabelled = existingRule
            ? ((await sql`
                UPDATE ai_context
                SET label = ${key}, content = ${content}, active = TRUE, updated_at = NOW()
                WHERE id = ${existingRule.id} AND source <> 'system'
                RETURNING id
              `) as Array<{ id: string }>)
            : [];
          if (relabelled.length === 0) {
            // Either there was no row, or the one we found went away between
            // the two statements. Insert rather than report a save that did not
            // happen: Vero has been told "saved" over a write that failed
            // before, and that is the bug this backstop exists to end.
            await sql`
              INSERT INTO ai_context (category, label, content, source, active)
              VALUES (${WRITING_RULES_CATEGORY}, ${key}, ${content}, 'chatbot', TRUE)
            `;
          }
          capturedRule = content;
          dbWrites.push({
            type: relabelled.length > 0 ? 'updated' : 'created',
            category: WRITING_RULES_CATEGORY,
            label: key,
            content_summary: language === 'ru' ? 'Правило сохранено' : 'Rule saved',
          });
        } catch (err) {
          console.error('[assistant-chat] rule backstop failed:', err);
        }
      }
    }

    // Drop a trailing "I've updated the draft" turn.
    //
    // The prompt asks for the rewrite and then silence, and the model mostly
    // complies but still tacks on a one-line confirmation. In a 390px column
    // beside a toast saying the same thing and a Reply tab already showing the
    // result, that is three announcements of one event. Enforced here rather
    // than left to the prompt, because the prompt does not reliably hold.
    //
    // Bounded on purpose: only after a draft write, only when an earlier turn
    // carried the actual rewrite, and only if the trailing turn is short. A
    // long final turn is saying something else and is kept. Dropped from what
    // is PERSISTED as well as what is returned, so a reload shows the same
    // thing as the live view.
    if (dbWrites.some((w) => w.category === 'draft')) {
      const displayed = newlyPersistedMessages.filter(
        (m) => m.role === 'assistant' && isDisplayableTurn(m),
      );
      const last = displayed.at(-1);
      const earlierHasRewrite = displayed.slice(0, -1).some(
        (m) => typeof m.content === 'string' && m.content.length > 120,
      );
      if (last && earlierHasRewrite && (last.content as string).length < 240) {
        const idx = newlyPersistedMessages.lastIndexOf(last);
        if (idx !== -1) newlyPersistedMessages.splice(idx, 1);
      }
    }

    // Added AFTER the splice above, deliberately, so the one line that proves a
    // rule was written down can never be the short trailing turn that gets
    // dropped. Vero has been told "I've saved that" by a model that saved
    // nothing; this line is only ever printed when a row actually changed.
    if (capturedRule) {
      newlyPersistedMessages.push({
        role: 'assistant',
        content:
          (language === 'ru' ? '📌 Правило сохранено: ' : '📌 Saved rule: ') +
          capturedRule,
      });
    }

    // Tool failures Vero has to see, printed LAST and after the backstop above
    // has had its say.
    //
    // This block used to run before the backstop, so a turn where the model's
    // save failed and the backstop then rescued the rule printed "⚠️ Note NOT
    // saved" and "📌 Saved rule" one after the other, which reads as broken
    // whichever of the two she believes. A knowledge-write failure is
    // therefore suppressed when the rule was rescued: nothing was lost, and
    // there is nothing for her to do.
    //
    // A blocked SEND is never suppressed. It is not a bookkeeping failure, it
    // is the assistant having tried to mail a customer without being told to,
    // and Vero needs to know it happened even on a turn that otherwise went
    // fine. Every failure is rendered, not just the first: two failures used
    // to show as one.
    const sendBlocks = toolFailures.filter((f) => f.tool === 'send_reply');
    const writeBlocks = capturedRule ? [] : toolFailures.filter((f) => f.tool !== 'send_reply');
    for (const f of sendBlocks) {
      newlyPersistedMessages.push({
        role: 'assistant',
        content:
          (language === 'ru' ? '⚠️ Письмо НЕ отправлено: ' : '⚠️ Email NOT sent: ') + f.error,
      });
    }
    for (const f of writeBlocks) {
      newlyPersistedMessages.push({
        role: 'assistant',
        content:
          (language === 'ru' ? '⚠️ Заметка НЕ сохранена: ' : '⚠️ Note NOT saved: ') + f.error,
      });
    }

    // Persist the thread, bounded. Vero keeps far more scrollback than
    // the model is given, but not an unbounded amount.
    const updatedThread = await persistThread(newlyPersistedMessages);

    // Every assistant turn this send produced, not just the last one.
    //
    // A turn that carries a tool call usually carries prose too — the rewritten
    // draft, typically — and the response only ever returned `finalReply`, the
    // turn AFTER the tool ran. So the rewrite was stored but never rendered,
    // and only appeared once a reload re-read the transcript, which looked like
    // the messages had reordered themselves.
    //
    // Same predicate as the history filter, via one helper, so the live view
    // and the reloaded view cannot drift apart again.
    const assistantTurns = newlyPersistedMessages
      .filter((m) => m.role === 'assistant' && isDisplayableTurn(m))
      .map((m) => ({ role: 'assistant' as const, content: m.content as string }));

    // The newest draft this turn produced, so the panel can offer a
    // translation of THAT rather than of the assistant's whole message.
    const draftText =
      [...dbWrites].reverse().find((w) => w.category === 'draft')?.draft_text ?? null;

    /**
     * IT SAID IT SAVED SOMETHING AND IT DID NOT.
     *
     * A real one, on a real booking: Vero typed "it's now quoted at 500$ not
     * 300$", the assistant answered "The one-hour session pricing has been
     * updated to $500", and record_client_facts was never called. Six other
     * details from the same conversation WERE written, so nothing looked
     * broken; the price simply was not there, and the only way to find out
     * was to read the database.
     *
     * This repo already has the lesson written down from the send-gate
     * incident: a rule the model is asked to follow is not a rule, and a
     * safety-critical claim needs a check in CODE on evidence the model did
     * not author. So the evidence here is dbWrites, which only this handler
     * can append to.
     *
     * THE NOTE CANNOT BE WRONG. It is emitted only when no fact was written
     * this turn, so what it says, that nothing was recorded, is true whatever
     * the prose meant. A phrase list that over-matches therefore costs a
     * correct sentence appearing where it was not strictly needed, and never
     * a false accusation. Only in a conversation slot, because the general
     * assistant has no client to record anything against.
     */
    const claimedToRecord =
      slot !== GENERAL_SLOT &&
      !dbWrites.some((w) => w.category === 'client_facts') &&
      CLAIM_PHRASES.some((re) => re.test(finalReply));

    return res.status(200).json({
      success: true,
      reply: finalReply,
      assistantTurns,
      draftText,
      dbWrites,
      ...(claimedToRecord ? { nothingRecorded: true } : {}),
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
      name: 'record_client_facts',
      description:
        "Write down booking details about THE CLIENT ON THIS THREAD that Vero learned somewhere else: over text, on the phone, in person. Use this whenever she gives you details about this client and asks you to remember them, update the info, or get them ready for a contract. This is NOT the knowledge base: upsert_knowledge is global and shared by every customer, and naming a client in it is refused. These facts belong to this one conversation and appear on its summary and on the New Client form. You do NOT pass a conversation id; the panel is already open on one and the server uses that. Every fact MUST carry the exact words from Vero's own message that it came from, copied verbatim, or the write is refused.",
      parameters: {
        type: 'object',
        properties: {
          facts: {
            type: 'array',
            description: 'One entry per detail. Replaces any earlier fact with the same field.',
            items: {
              type: 'object',
              properties: {
                field: {
                  type: 'string',
                  description:
                    "Which detail this is. Prefer one of: client_name, partner_name, client_email, client_phone, event_date, event_time, event_location, session_type, total_amount, retainer_amount, payment_method, notes. Any other short snake_case name is accepted and shown as-is.",
                },
                value: { type: 'string', description: 'The detail itself, tidied up. English or as written.' },
                quote: {
                  type: 'string',
                  description:
                    "The exact words from VERO'S message this came from, copied character for character. Not a paraphrase. The write is refused if this text is not found in what she just typed.",
                },
              },
              required: ['field', 'value', 'quote'],
            },
          },
          content_summary: {
            type: 'string',
            description:
              'A very short (5-12 word) paraphrase for the toast she sees, IN THE SAME LANGUAGE she is chatting in.',
          },
        },
        required: ['facts', 'content_summary'],
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
      name: 'update_draft',
      description:
        "Replace the pending AI draft for a conversation with an improved version, WITHOUT sending it. Call this whenever you produce a complete, ready-to-send rewrite of the draft Vero is refining, so the Reply tab shows your latest version instead of the original. Do NOT call it while discussing options, offering alternatives, or asking a question — only when the text you are handing over could be sent as-is. NEVER ask permission before calling this; updating an unsent draft is not sending it. This does not send anything and does not touch whatever Vero has typed in her own reply box; use send_reply for sending.",
      parameters: {
        type: 'object',
        properties: {
          conversation_id: { type: 'string', description: 'UUID of the conversation whose draft to replace.' },
          text: {
            type: 'string',
            description:
              "The full replacement draft, in the language the CUSTOMER writes in (not the admin chat language). For email the signature is appended at send time — do not include one.",
          },
          content_summary: {
            type: 'string',
            description: "Short summary of what changed, in the admin chat's language.",
          },
          language_mismatch_confirmed: {
            type: 'boolean',
            description:
              'ONLY set true when the text is deliberately not in the customer\'s language AND Vero explicitly approved that. Never set it to get past the language check.',
          },
        },
        required: ['conversation_id', 'text', 'content_summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_reply',
      description:
        "Send a reply to a customer on whichever channel the conversation uses (Instagram or email, handled automatically). ONLY call this after showing Vero the draft and getting her explicit approval in the chat. Never call it in the same turn you first propose a draft. The message is sent as Vero herself, not as the AI. Approval is checked in code against Vero's own most recent message: if she did not say to send it, this tool refuses and nothing is sent, whatever you pass in `confirmed`. An edit request, a question, or a complaint is not approval. Once per instruction from her, too: a second call in the same turn is refused.",
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
              'Must be true. Set this only after Vero has seen this exact text and explicitly approved sending it. Setting it does not authorise anything on its own: the server checks her actual words. Treat it as your statement that you believe she approved, not as the approval.',
          },
          content_summary: {
            type: 'string',
            description: "Short summary for the toast, in the admin chat's language.",
          },
          language_mismatch_confirmed: {
            type: 'boolean',
            description:
              'ONLY set true when the text is deliberately not in the customer\'s language AND Vero explicitly approved that. Never set it to get past the language check.',
          },
        },
        required: ['conversation_id', 'text', 'confirmed', 'content_summary'],
      },
    },
  },
];

/**
 * Which language a piece of text is written in, by script. Mirrors
 * src/components/translationDirection.ts, which the Translate button already
 * trusts for the same job. Null when there are too few letters to say.
 */
function detectLang(text: string): 'ru' | 'en' | null {
  const cyr = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  if (cyr + lat < 20) return null;
  return cyr > lat ? 'ru' : 'en';
}

/**
 * The language the CUSTOMER writes in, read from their own inbound messages.
 *
 * Exists because prompt instructions were not enough. Both reply tools said
 * "in the language the CUSTOMER writes in" in their descriptions, and the
 * model still rewrote an English draft into Russian — Vero gave her change
 * list in Russian, the chat was running in Russian, and the session's
 * gravity beat one line of tool description. An English-speaking test client
 * then received a reply in Russian. Language is now a fact computed here and
 * ENFORCED at the tool layer, not a request made of the model.
 *
 * Quoted reply chains are stripped ("> ..." lines and everything after the
 * "On ... wrote:" marker), because an email from a Russian speaker usually
 * carries Vero's English underneath it, and counting the quote would call
 * the customer bilingual in exactly the wrong direction.
 */
async function customerLanguage(
  sql: ReturnType<typeof getDb>,
  conversationId: string,
): Promise<'ru' | 'en' | null> {
  const rows = (await sql`
    SELECT body FROM messages
    WHERE conversation_id = ${conversationId}
      AND direction = 'inbound'
    ORDER BY sent_at DESC
    LIMIT 5
  `) as Array<{ body: string }>;
  const own = rows
    .map((r) =>
      r.body
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('>'))
        .join('\n')
        // Everything after a quote marker is the older message, not them.
        .split(/\bOn .{4,80} wrote:|W dniu .{4,80} napisa|\u0431\u0440.? \u043F\u043E\u0434\u043F\u0438\u0441/)[0]
        .slice(0, 800),
    )
    .join('\n');
  return detectLang(own);
}

/**
 * A compact transcript of the open conversation, injected into the system
 * prompt rather than left behind the read_thread tool.
 *
 * With only the tool, answering "did we ever talk to this person?" required
 * the model to DECIDE to read the thread it was standing in — and instead it
 * pattern-matched "this person" to a name lookup and asked Vero who she
 * meant, in the middle of the conversation in question. Facts beat
 * instructions: with the transcript already in context, there is nothing to
 * ask.
 *
 * Bodies are truncated and the middle of long threads elided to keep the
 * token cost sane; read_thread still exists for full bodies. Drafts are
 * excluded — they were never said.
 */
async function threadDigest(
  sql: ReturnType<typeof getDb>,
  conversationId: string,
): Promise<string> {
  const rows = (await sql`
    SELECT direction, sender, body, sent_at
    FROM messages
    WHERE conversation_id = ${conversationId} AND status <> 'draft'
    ORDER BY sent_at ASC
  `) as Array<{
    direction: 'inbound' | 'outbound';
    sender: 'contact' | 'ai' | 'human';
    body: string;
    sent_at: string;
  }>;
  if (rows.length === 0) return '(no messages on record)';
  const fmt = (m: (typeof rows)[number]) => {
    const who = m.direction === 'inbound' ? 'Customer' : m.sender === 'ai' ? 'AI' : 'Vero';
    const body = m.body.length > 220 ? `${m.body.slice(0, 220)}…` : m.body;
    // Neon returns timestamptz as a Date, not a string — .slice on it took
    // down every conversation-scoped assistant turn. Normalize first.
    return `[${new Date(m.sent_at).toISOString().slice(0, 10)}] ${who}: ${body.replace(/\s+/g, ' ')}`;
  };
  const MAX = 12;
  if (rows.length <= MAX) return rows.map(fmt).join('\n');
  const head = rows.slice(0, 2).map(fmt);
  const tail = rows.slice(-10).map(fmt);
  return [...head, `… (${rows.length - 12} earlier messages elided — read_thread has them all)`, ...tail].join('\n');
}

/**
 * Shared guard for update_draft and send_reply: text that is not in the
 * customer's language does not pass without Vero explicitly saying so.
 */
async function languageMismatch(
  sql: ReturnType<typeof getDb>,
  conversationId: string,
  text: string,
  confirmed: boolean,
): Promise<string | null> {
  if (confirmed) return null;
  const customer = await customerLanguage(sql, conversationId);
  const draft = detectLang(text);
  if (!customer || !draft || customer === draft) return null;
  const names = { ru: 'Russian', en: 'English' } as const;
  return (
    `BLOCKED: this text is in ${names[draft]}, but this customer writes in ${names[customer]}. ` +
    `Rewrite the text in ${names[customer]} and call again. Only if Vero EXPLICITLY says she wants ` +
    `it sent in ${names[draft]} anyway, call again with language_mismatch_confirmed=true. ` +
    `Tell Vero about this in her chat language either way.`
  );
}

/**
 * The stored writing rule that `source` is a restatement of, if there is one.
 *
 * This is the whole of why there is no migration file for the ruleKey fix, so
 * it is worth being explicit about what it replaces.
 *
 * ruleKey used to sort a rule's words and THEN take eight, so a rule was
 * labelled with whichever eight words fell earliest in the alphabet rather than
 * the eight that carry the meaning. Fixing that changes the label of every rule
 * written from then on, and rows carrying the old label would stop matching
 * their own restatements: each one would duplicate exactly once, and two rows
 * saying the same thing dilute each other in the prompt. That is the failure
 * migration 034 exists to end, so shipping the fix on its own would have
 * re-opened it.
 *
 * The usual answer is a migration that relabels the rows in the same deploy.
 * SQL cannot do it. The key is computed in JavaScript from the rule's own
 * words, with a stopword list and a Unicode-aware split, so Postgres has no way
 * to recompute one; the only version that works is a bespoke script Alex runs
 * against production by hand, on the same day, with the deploy half applied.
 *
 * So the LOOKUP absorbs it instead, in three passes, most specific first:
 *
 *   1. a row already labelled with the current key, which is the ordinary case
 *      and the one that must win, because it is the row the UPDATE would
 *      collide with under migration 034's unique index;
 *   2. a row whose OWN CONTENT keys to the same thing today. This is the
 *      relabel migration, done one row at a time and only when something
 *      touches it: it is what finds a rule Alex wrote months ago from a
 *      restatement he types now;
 *   3. a row labelled with the old form of THIS rule's key, which catches rows
 *      whose content has since been edited so that pass 2 no longer recognises
 *      them.
 *
 * Callers write the CURRENT key back onto whatever they find, so a row
 * migrates itself the first time it is touched and the old form dies out on
 * its own. Nothing duplicates, nothing has to be run by hand, and there is no
 * day on which the code and the stored labels have to change over together.
 *
 * source='system' rows are excluded rather than returned and rejected. They are
 * Alex's documentation, they are not restatements of anything Vero said, and no
 * caller here has any business writing to one.
 *
 * Scanning the category is deliberate and cheap: writing_rules is rendered
 * whole into the HOUSE RULES block of every prompt this file builds, so it is
 * small by construction, and this handler already reads the entire ai_context
 * table once per turn.
 */
async function findWritingRule(
  sql: ReturnType<typeof getDb>,
  source: string,
): Promise<{ id: string; label: string } | null> {
  const key = ruleKey(source).slice(0, 120);
  if (!key) return null;
  const legacy = legacyRuleKey(source).slice(0, 120);
  const rows = (await sql`
    SELECT id, label, content FROM ai_context
    WHERE category = ${WRITING_RULES_CATEGORY} AND source <> 'system'
    ORDER BY created_at ASC
  `) as Array<{ id: string; label: string; content: string }>;
  const labelled = (row: { label: string }, want: string) =>
    row.label.toLowerCase() === want.toLowerCase();
  return (
    rows.find((r) => labelled(r, key)) ??
    rows.find((r) => ruleKey(r.content).slice(0, 120) === key) ??
    rows.find((r) => labelled(r, legacy)) ??
    null
  );
}

async function executeToolCall(
  sql: ReturnType<typeof getDb>,
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  dbWrites: DbWrite[],
  /** Contact names in the inbox, used to reject per-customer knowledge rows. */
  knownContactNames: string[] = [],
  /**
   * Everything the send gate needs that is NOT under the model's control.
   *
   * This function used to receive only the model's own arguments, which is
   * why no code on this path could tell an approval from an edit request: the
   * one piece of ground truth, Vero's actual message, was in scope at the call
   * site and was never passed down. Optional only so the signature stays
   * compatible; send_reply refuses outright when it is missing, because a send
   * with no user turn to check against is not a send anyone asked for.
   */
  sendCtx?: {
    userMessage: string;
    lastAssistantText: string;
    sends: { n: number };
    /** Everything the assistant has shown Vero, this turn and the one before. */
    shownText: string;
    /**
     * The conversation the PANEL is open on, resolved from the slot.
     *
     * Not a tool parameter, deliberately. A conversation id the model supplies
     * is a model-authored value, and the whole point of this store is that one
     * client's details never land on another client's record. The server knows
     * which thread it is on before the model says anything; that is the value
     * that gets written.
     */
    openConversationId: string | null;
  },
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

  /**
   * Facts about the client on THIS thread.
   *
   * Three things make this safe to write, and none of them is the model
   * promising it was careful:
   *
   * 1. THE CONVERSATION IS NOT A PARAMETER. It comes from the slot the panel
   *    resolved before the model was called. There is no argument the model
   *    can set that redirects this at another client's record.
   * 2. EVERY FACT CARRIES A QUOTE, AND THE QUOTE IS CHECKED. The span has to
   *    appear in the message Vero actually typed this turn. This is the rule
   *    from reference_prompt_rules_are_not_gates: the send gate failed because
   *    `confirmed: true` was a parameter the model set, so the check has to be
   *    on evidence the model did not author. Her typed message is that
   *    evidence.
   * 3. NOTHING HERE REACHES A CONTRACT. These seed the New Client FORM, which
   *    she reads and edits. The quote travels with the value so the screen can
   *    show both on one line and she can see what became what.
   *
   * The quote check is not a claim that the extraction is RIGHT. A model can
   * quote her correctly and still put the winery's time against the park. It
   * is a claim that the extraction is TRACEABLE, which is what lets a person
   * catch that in one glance instead of reading a contract.
   */
  if (name === 'record_client_facts') {
    const conversationId = sendCtx?.openConversationId ?? null;
    if (!conversationId) {
      return {
        error:
          'This only works with a conversation open. Open the client\'s thread in Messages and ask again there; the general assistant has no thread to attach facts to.',
      };
    }

    const raw = Array.isArray(args.facts) ? args.facts : [];
    if (raw.length === 0) return { error: 'No facts given.' };

    // The haystack is what SHE typed, normalised for whitespace and case only.
    // Nothing the model wrote is in here.
    const norm = (v: string) => v.replace(/\s+/g, ' ').trim().toLowerCase();
    const typed = norm(sendCtx?.userMessage ?? '');
    if (!typed) {
      return { error: 'No message of yours to check these against. Say them in a message first.' };
    }

    const accepted: Array<{ field: string; value: string; quote: string; at: string }> = [];
    const rejected: Array<{ field: string; why: string }> = [];
    const now = new Date().toISOString();

    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const field = typeof r.field === 'string' ? r.field.trim().slice(0, 64) : '';
      const value = typeof r.value === 'string' ? r.value.trim().slice(0, 500) : '';
      const quote = typeof r.quote === 'string' ? r.quote.trim().slice(0, 500) : '';
      if (!field || !value) continue;
      if (!quote) {
        rejected.push({ field, why: 'no quote given' });
        continue;
      }
      if (!typed.includes(norm(quote))) {
        rejected.push({ field, why: 'the quoted words are not in what she typed' });
        continue;
      }
      accepted.push({ field, value, quote, at: now });
    }

    if (accepted.length === 0) {
      return {
        error:
          'Nothing was written down. Every fact has to quote the exact words from her message that it came from, copied character for character. ' +
          (rejected.length ? `Refused: ${rejected.map((x) => `${x.field} (${x.why})`).join(', ')}.` : ''),
      };
    }

    // Latest wins per field, order preserved. Read-modify-write rather than a
    // jsonb merge because the list is short and the merge rule is "same field
    // replaces", which SQL would express far less clearly than this does.
    const [existingRow] = (await sql`
      SELECT client_facts FROM conversations WHERE id = ${conversationId} LIMIT 1
    `) as Array<{ client_facts: unknown }>;
    if (!existingRow) return { error: 'That conversation no longer exists.' };

    const prior = Array.isArray(existingRow.client_facts)
      ? (existingRow.client_facts as Array<Record<string, unknown>>)
      : [];
    const replaced = new Set(accepted.map((f) => f.field));
    const merged = [
      ...prior.filter((f) => typeof f?.field === 'string' && !replaced.has(f.field as string)),
      ...accepted,
    ].slice(-40);

    await sql`
      UPDATE conversations
         SET client_facts = ${JSON.stringify(merged)}::jsonb
       WHERE id = ${conversationId}
    `;

    dbWrites.push({
      type: 'updated',
      category: 'client_facts',
      label: accepted.map((f) => f.field).join(', '),
      content_summary:
        typeof args.content_summary === 'string' && args.content_summary.trim()
          ? args.content_summary.trim()
          : `${accepted.length} detail${accepted.length === 1 ? '' : 's'} recorded`,
    });

    return {
      recorded: accepted.map((f) => ({ field: f.field, value: f.value })),
      ...(rejected.length ? { refused: rejected } : {}),
      note: 'Saved against this conversation only. They show on its summary and seed the New Client form, where you can correct anything before a contract is made.',
    };
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

    // Reject per-customer rows.
    //
    // The dedupe guard below matches on category + label, and labels like
    // "Response example for <name> with a personal touch" embed a customer name
    // plus a freeform phrase, so they never collide and every one inserts. 24 of
    // 26 tone rows were that shape. It matters because ai_context is loaded
    // WHOLE into the prompt that replies to customers, so one customer's name
    // and situation ends up in the context used to answer everyone else.
    //
    // Until now the single shared transcript was an accidental brake: the model
    // could see it had already written a similar row. Per-conversation threads
    // start blind, so each one would mint another. The guard has to exist
    // before the scoping does.
    //
    // Word-boundary matched, not substring matched. As a raw `includes` this
    // rejected any label containing a contact's name as a fragment: a client
    // called Sue made "Common issues" unsavable, with an error message about
    // naming a specific person that would have made no sense to anyone.
    const offendingName = findCustomerNameIn(label, knownContactNames);
    if (offendingName) {
      return {
        error:
          'That label names a specific person, which would put one customer in the context used to answer every other customer. ' +
          'Store the general rule instead: what should be true of EVERY reply, with no names, no one-off details, and no verbatim example. ' +
          'If there is no general rule to draw, do not store anything.',
      };
    }

    // ONE write path, whether or not the model supplied an id.
    //
    // It used to be two, and the id branch dead-ended: an id that matched no
    // row returned "No entry with id <uuid>" and threw the whole write away,
    // with category, label and content all present and all required. That is
    // the reported bug. Alex gave the assistant a hard rule, it tried to save
    // it, it passed a UUID it had invented, and the rule was lost while the
    // model told him it had been written down.
    //
    // The invented UUID is a design fault, not just a hallucination:
    // buildSystemPrompt prints [uuid] on every ordinary knowledge row but
    // renders the HOUSE RULES block content-only, and then instructs the model
    // to save new rules into exactly that category, with a tool whose schema
    // says "if updating, pass id". The prompt asks for an id it never gives.
    // Fixed at both ends: ids are rendered there now, and a stale one here is
    // a hint rather than a dead end.
    //
    // Except for writing rules, where the label is replaced outright by a key
    // derived from the rule's own words. A model asked to save "no long dashes"
    // twice invents two different labels, and both rows survive the (category,
    // label) check below; the reply engine then carries the same order three
    // times over and still breaks it. ruleKey makes restatements collide on
    // purpose.
    //
    // Computed ABOVE the id branch, not inside the no-id one. Migration 034
    // puts a unique index on (category, label) where category='writing_rules',
    // so an id-path write into that category carrying the model's free-text
    // label could violate it. executeToolCall is called unguarded, so the
    // throw escaped to the handler's catch and Vero got a 500 for the whole
    // turn.
    // Empty when this is not a writing rule, and also when the rule's own words
    // are all stopwords and produce no key at all. Both cases fall back to the
    // model's label and to the plain (category, label) match below, because a
    // key that does not exist cannot be searched for.
    const ruleKeyLabel =
      category.toLowerCase() === WRITING_RULES_CATEGORY ? ruleKey(content).slice(0, 120) : '';
    const effectiveLabel = ruleKeyLabel || label;

    let targetId: string | null = null;
    if (providedId) {
      // source='system' rows document how the admin panel works
      // (migration 018). The assistant must not be able to rewrite its
      // own instructions — it would do so cheerfully if Vero said
      // something like "that's wrong, fix it", and the damage would only
      // surface later as confidently wrong answers.
      const [owner] = (await sql`
        SELECT id, source FROM ai_context WHERE id = ${providedId}
      `) as Array<{ id: string; source: string }>;
      if (owner?.source === 'system') {
        return {
          error:
            'That entry documents how the admin panel works and is maintained by Alex. Tell Vero it can\'t be edited here, and to message Alex if it looks wrong.',
        };
      }
      // No row: treat the id as the guess it is and fall through to matching
      // on (category, label), which is what a no-id call would have done.
      targetId = owner?.id ?? null;
      if (!targetId) {
        console.log(
          `[assistant-chat] upsert_knowledge: id ${providedId} matches no row, ` +
            `falling through to (category, label) upsert for ${category}/${effectiveLabel}`,
        );
      }
    }

    // The stored row this rule already lives in, found by its key in either
    // form or by recomputing today's key from the content of the rows
    // themselves. See findWritingRule: it is the relabel migration, done lazily
    // and one row at a time, and it is why this change ships without one.
    const ruleOwner = ruleKeyLabel ? await findWritingRule(sql, content) : null;

    if (!targetId) {
      // Match on (category, label). Those are the model's own identifiers for
      // a fact, so re-teaching the same fact updates it. A genuinely new fact
      // gets a new label and still inserts. Without this it INSERTed
      // unconditionally, so every time Vero re-explained something ("make the
      // replies more tailored") the assistant created ANOTHER row. That is the
      // literal mechanism behind "I've told it this several times and nothing
      // changes": her corrections piled up as duplicates, the model saw the
      // same instruction repeated, and the prompt grew without the behavior
      // changing.
      //
      // source <> 'system' is NOT belt and braces here, it is a hole that was
      // open. The id path checked source and this one did not, so a no-id call
      // whose (category, label) happened to collide with one of Alex's
      // documentation rows silently overwrote it and relabelled it
      // source='chatbot'. The fall-through above routes more traffic into this
      // path, so the two changes are not separable: without this line the
      // fall-through would weaken the system-row protection instead of leaving
      // it alone. delete_knowledge already gets this right.
      //
      // A writing rule is matched by its KEY rather than by this query, because
      // the same rule can be sitting under an older form of that key. Every
      // other category is still a plain (category, label) match: those labels
      // are the model's own words for a fact, not a derived key, and there is
      // nothing to migrate.
      if (ruleKeyLabel) {
        targetId = ruleOwner?.id ?? null;
      } else {
        const existing = (await sql`
          SELECT id FROM ai_context
          WHERE LOWER(category) = LOWER(${category})
            AND LOWER(label) = LOWER(${effectiveLabel})
            AND source <> 'system'
          ORDER BY created_at ASC
          LIMIT 1
        `) as Array<{ id: string }>;
        targetId = existing[0]?.id ?? null;
      }
    }

    // Migration 034 puts a unique index on (category, label) for writing
    // rules, so two rows there cannot share a key. If the id the model handed
    // us points at one row while the rule's own key already belongs to
    // another, updating the first would violate the index, and an unguarded
    // throw here escapes to the handler's catch and returns a 500 for the
    // whole turn. The key wins: it is derived from the rule itself, the id was
    // a guess.
    //
    // findWritingRule returns a row already labelled with the current key
    // before it returns anything else, precisely so that the row which WOULD
    // collide is the one retargeted to. A row it found by the older form of the
    // key, or by recomputing the key from its content, owns no label anyone
    // else wants and is safe to relabel on the way past.
    if (targetId && ruleOwner && ruleOwner.id !== targetId) targetId = ruleOwner.id;

    if (targetId) {
      // active = TRUE matters. The id path used to set category, label,
      // content, source and updated_at, and nothing else, so updating a
      // deactivated row returned success, fired the toast, told Vero it was
      // saved, and left a rule that buildSystemPrompt skips. Silently, with no
      // warning, forever.
      const updated = (await sql`
        UPDATE ai_context
        SET category = ${category}, label = ${effectiveLabel}, content = ${content},
            source = 'chatbot', active = TRUE, updated_at = NOW()
        WHERE id = ${targetId} AND source <> 'system'
        RETURNING id, category, label, content
      `) as Array<{ id: string; category: string; label: string; content: string }>;
      if (updated.length > 0) {
        dbWrites.push({
          type: 'updated',
          category,
          label: effectiveLabel,
          content_summary: contentSummary,
        });
        return { success: true, action: 'updated', entry: updated[0] };
      }
      // The row went away, or turned out to be a system row, between the two
      // statements. Insert rather than report a failure for a write that is
      // still perfectly valid.
    }

    const created = (await sql`
      INSERT INTO ai_context (category, label, content, source, active)
      VALUES (${category}, ${effectiveLabel}, ${content}, 'chatbot', TRUE)
      RETURNING id, category, label, content
    `) as Array<{ id: string; category: string; label: string; content: string }>;
    dbWrites.push({ type: 'created', category, label: effectiveLabel, content_summary: contentSummary });
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

    // Drafts excluded. This reads what was ACTUALLY said, and a draft was never
    // sent. Without the filter the assistant saw every pending draft as an
    // ordinary AI message already in the thread, with no way to tell it was
    // unsent or which one Vero was refining — so on a thread with two drafts it
    // was reasoning about the wrong text before it even called update_draft.
    const msgs = (await sql`
      SELECT direction, sender, channel, body, subject, sent_at
      FROM messages
      WHERE conversation_id = ${conversationId} AND status <> 'draft'
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

  if (name === 'update_draft') {
    const conversationId = String(args.conversation_id ?? '').trim();
    // Subject lines are stripped, not argued with. See _subject-strip.ts.
    const text = applyHouseStyle(stripSubjectHeader(String(args.text ?? '').trim()));
    const contentSummary = String(args.content_summary ?? '').trim() || 'Draft updated';
    if (!conversationId || !text) {
      return { error: 'conversation_id and text are required' };
    }

    const mismatch = await languageMismatch(
      sql,
      conversationId,
      text,
      args.language_mismatch_confirmed === true,
    );
    if (mismatch) return { error: mismatch };

    // Only the pending draft is replaceable. A sent message is a record of what
    // the customer actually received and must never be rewritten under it.
    const updated = (await sql`
      UPDATE messages
      SET body = ${text}
      WHERE id = (
        SELECT id FROM messages
        WHERE conversation_id = ${conversationId}
          AND status = 'draft'
          AND direction = 'outbound'
        -- sent_at, not created_at: it is the platform clock every other messages
        -- query and the partial index use, and the two can diverge.
        ORDER BY sent_at DESC, created_at DESC, id DESC
        LIMIT 1
      )
      RETURNING id
    `) as Array<{ id: string }>;

    if (updated.length === 0) {
      return {
        error:
          'There is no pending draft on that conversation to replace. It may have been sent or discarded already. Show Vero the improved text in the chat instead.',
      };
    }

    dbWrites.push({
      type: 'updated',
      category: 'draft',
      label: 'Draft updated',
      content_summary: contentSummary,
      draft_text: text,
    });
    return { success: true, action: 'draft_updated', message_id: updated[0].id };
  }

  if (name === 'send_reply') {
    const conversationId = String(args.conversation_id ?? '').trim();
    // House style applies to anything that leaves for a customer, and this is
    // the last gate before one does. See api/_house-style.ts.
    const text = applyHouseStyle(String(args.text ?? '').trim());
    const contentSummary = String(args.content_summary ?? '').trim() || 'reply sent';
    if (!conversationId || !text) {
      return { error: 'conversation_id and text are required' };
    }
    // THE APPROVAL GATE. Read Vero's own words. Do not ask the model.
    //
    // FIRST, ahead of the language check, deliberately. A send nobody
    // authorised is refused for that reason and not for a detail of how it was
    // written, the refusal Vero reads says the right thing, and a blocked send
    // costs no database round trip.
    //
    // What used to be here was `if (args.confirmed !== true) return ...`, and
    // its comment called it "a structural speed bump... which makes an
    // accidental send take a deliberate step rather than a plausible next
    // token". It was neither. `confirmed` is a tool parameter the model
    // writes, the schema marks it required and says "must be true", so a well
    // formed call always carries it. It encoded "I am calling this tool", not
    // "Vero approved". On 2026-09-18 the model read "stop messing with the
    // signature, we dont need to include our email" as approval, wrote
    // confirmed: true, this line waved it through because true === true, and a
    // paying customer got an email nobody had authorised.
    //
    // `confirmed` is kept below as one more thing that has to line up, but it
    // is advisory now. The load-bearing check is looksLikeSendApproval, which
    // the model cannot write to, exactly as languageMismatch re-derives the
    // customer's language from the database rather than believing the model
    // about it.
    if (!sendCtx) {
      return {
        error:
          'NOT SENT. No user turn is in scope, so there is no way to verify that Vero approved this. Nothing went to the customer.',
      };
    }
    if (sendCtx.sends.n >= 1) {
      return {
        error:
          'NOT SENT. One send per instruction from Vero. Something has already been sent this turn. ' +
          'Ask her again before sending anything else.',
      };
    }
    const approval = looksLikeSendApproval(sendCtx.userMessage, sendCtx.lastAssistantText);
    if (!approval.ok) {
      // Logged with the reason and the message, because this log is how the
      // accept list gets widened later from what Vero really types, rather
      // than from guesses about what she might.
      console.log(
        `[assistant-chat] send BLOCKED (${approval.why}) convo=${conversationId}: ` +
          `${sendCtx.userMessage.slice(0, 160)}`,
      );
      return {
        error:
          'NOT SENT. Vero has not told you to send it in this turn, so nothing went to the customer. ' +
          'Show her the text and wait for her to say "send it" or "отправь". ' +
          'Do not claim anything was sent, and do not call this tool again until she does.',
      };
    }

    // A second layer, LOG ONLY for now, on purpose.
    //
    // Approval means "send THAT text", and nothing yet checks that the text
    // being sent is the text Vero read. The two pipelines are close but not
    // identical: the send text goes through applyHouseStyle, the displayed
    // text through applyHouseStyle(scrubSubjectLines(...)), so an exact
    // containment test would occasionally miss on a send that is perfectly
    // legitimate. A false block would be a terrible first impression of a new
    // gate, and this one is new. So it watches and says nothing to Vero.
    //
    // Promote it to a hard refusal once a week of these logs is clean. If the
    // log is noisy, the normalisation below is what needs fixing, not the
    // idea.
    const flatten = (s: string) => s.toLowerCase().replace(/\s+/gu, ' ').trim();
    if (!flatten(sendCtx.shownText).includes(flatten(text))) {
      console.log(
        `[assistant-chat] send text was NOT shown to Vero first convo=${conversationId}: ` +
          `${text.slice(0, 160)}`,
      );
    }

    // Advisory, and kept. It is no longer what authorises a send, so it costs
    // nothing, but it is one more thing that has to line up: a call that omits
    // it is a malformed call, and refusing those keeps the tool schema honest.
    if (args.confirmed !== true) {
      return {
        error:
          'Not sent. Vero approved this, but the call did not set confirmed=true. ' +
          'Call again with the exact same text and confirmed=true.',
      };
    }

    const sendMismatch = await languageMismatch(
      sql,
      conversationId,
      text,
      args.language_mismatch_confirmed === true,
    );
    if (sendMismatch) return { error: sendMismatch };

    // Goes through the SAME path as the Messages panel's Send button —
    // threading headers, signature, persist-before-send ordering and
    // channel dispatch all included. See api/_reply-delivery.ts.
    // 'assistant', so this send is identifiable afterwards. Every guard above
    // this line is about preventing an unapproved send; this is the one that
    // makes an unapproved send investigable if one ever gets through again.
    const result = await deliverReply(sql, conversationId, text, { via: 'assistant' });
    if (!result.ok) {
      if (result.status === 409) {
        return {
          error:
            'That exact message was already sent to this person in the last 15 minutes. Tell Vero it looks like a duplicate and ask whether she wants it sent again anyway.',
        };
      }
      return { error: result.error ?? 'Send failed' };
    }
    // Counted only on a real delivery, and counted before anything can call
    // this tool again in the same request.
    sendCtx.sends.n += 1;
    console.log(
      `[assistant-chat] sent reply via co-pilot to conversation=${conversationId} ` +
        `(approval: ${approval.why})`,
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
  /**
   * The conversation the panel is open on, when there is one. Without this the
   * assistant only knows the customer's NAME, from the prompt the panel seeds,
   * and has no id to pass to read_thread / update_draft / send_reply. It would
   * have to go looking, and in practice it just did not bother, so the draft it
   * had rewritten never got written back.
   */
  openConversation?: {
    id: string;
    name: string;
    customerLang: 'ru' | 'en' | null;
    portalBlock: string | null;
    digest: string;
  } | null,
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
  // A third kind: standing instructions about HOW to write, as opposed to
  // facts to cite or panel documentation. They were rendered in the knowledge
  // dump below, under a heading that calls the whole table "DATA, not your
  // identity" and tells the model not to treat it as its own voice. So "never
  // use long dashes" was filed as a fact about Vero rather than an order to
  // the assistant, and it read it that way for months.
  const ruleRows: typeof contextRows = [];
  for (const row of contextRows) {
    if (!row.active) continue;
    if (row.category === WRITING_RULES_CATEGORY) {
      ruleRows.push(row);
      continue;
    }
    if (row.source === 'system') {
      systemRows.push(row);
      continue;
    }
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  }

  // Top of the prompt, above everything else, phrased as orders. The dash rule
  // is hard-coded into the list as well as stored, because it is the one that
  // has been repeated most and the one api/_house-style.ts enforces in code
  // regardless of what this prompt achieves.
  //
  // Each stored rule is rendered WITH its id, exactly like every other
  // knowledge row below. It used to be content only, while the tool schema
  // told the model to pass an id when updating, so when it was told to save a
  // new rule into this category it invented a UUID, the write matched no row,
  // and the rule was thrown away. Roughly four tokens a rule against a prompt
  // already near 17.5k, to remove the cause rather than the symptom.
  const houseRules = [
    'Never use long dashes. No em dashes, no en dashes, ever. Use a comma, a period, a colon, or the word "to" for a range. This applies to what you write to Vero in this chat AND to every draft or reply you write for a customer.',
    ...ruleRows
      .filter((r) => r.content.trim())
      .map((r) => `[${r.id}] ${r.content.trim()}`),
  ];
  const houseRulesBlock = `## HOUSE RULES, learned from Vero's corrections (these outrank everything below)
${houseRules.map((r) => `- ${r}`).join('\n')}

These are standing orders, not facts to cite. They were added because Vero
corrected the same thing more than once. If she gives you another one, save it
with upsert_knowledge under the category "${WRITING_RULES_CATEGORY}" so it
appears in this list next time. That is the ONLY way it survives this chat.
To REPLACE one of the rules above, pass its [id]. To add a new one, pass no id
at all. Never invent an id: if you do not have one in front of you, omit it.`;

  const systemKnowledge =
    systemRows.length === 0
      ? '(Not loaded yet.)'
      : systemRows
          .map((r) => `- **${r.label}**: ${r.content}`)
          .join('\n');
  // Declared in api/_reply-core-rules.ts so this prompt and the reply engine
  // describe the same rules — the assistant cannot push back accurately on a
  // rule it only half knows about.
  const coreRules = coreRulesForAssistant();

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

  // Rendered from the template registry rather than written out by hand, so a
  // new type or a changed required field cannot leave this prompt describing
  // the old set. What the assistant asks a customer for has to match what the
  // admin form will refuse to submit without.
  const bookingTypesBlock = CONTRACT_TYPE_ORDER.map((key) => {
    const spec = CONTRACT_TEMPLATES[key];
    const extras: string[] = [];
    if (spec.couple) extras.push('both partners\' full names');
    for (const f of spec.fields) {
      if (f.required && f.key !== 'event_location') extras.push(f.label.toLowerCase());
    }
    const tail = extras.length ? `also needs ${extras.join(', ')}` : 'needs nothing beyond the basics';
    return `- **${spec.name}**: ${tail}.`;
  }).join('\n');

  const langName = LANGUAGE_NAMES[language];
  // Language-specific concrete examples so the model doesn't default
  // to the wrong tongue when the user's UI has been switched.
  const exampleConfirm =
    language === 'ru'
      ? '"Записал новую цену — $600 для семейных сессий"'
      : '"Saved new price — $600 for family sessions"';

  const openConversationBlock = openConversation
    ? `

## THE CONVERSATION CURRENTLY OPEN
Vero has this thread open and is working on it right now:
- Customer: ${openConversation.name}
- conversation_id: ${openConversation.id}
${
  openConversation.customerLang
    ? `- THIS CUSTOMER WRITES IN ${openConversation.customerLang === 'ru' ? 'RUSSIAN' : 'ENGLISH'}. Every text you pass to update_draft or send_reply MUST be in that language, no matter what language Vero uses with you — she gives instructions in her language, the customer receives replies in theirs. The tools will reject text in the wrong language. If Vero explicitly asks for another language, say you noticed the mismatch and confirm before proceeding.`
    : ''
}

${openConversation.portalBlock ? `\n${openConversation.portalBlock}\n` : ''}
THE THREAD SO FAR (from our records — replies Vero sent OUTSIDE this system,
e.g. directly from Gmail, are not recorded and will not appear here; say so
rather than concluding nothing was sent):
${openConversation.digest}

Use that id directly for read_thread, update_draft and send_reply. Do NOT call
list_conversations to find it and do NOT ask her which conversation she means:
you already know. When she says "the draft", "this reply" or "the message", she
means this conversation — and when she says "this person", "they", "he", "she",
"this customer", or asks whether "we ever talked to them", she means THE
CUSTOMER ABOVE. Never ask who she is referring to; the thread is right there.
Answer history questions from it directly (read_thread has full bodies if you
need more than the digest shows).

When you rewrite the draft for her, call update_draft with this id in the SAME
turn you show her the new version. Do not ask first.

The message that calls update_draft MUST contain the full rewritten reply,
written out in the chat, in the customer's language. Never call update_draft
from an empty message: Vero reads the new version in the chat, and if the only
thing you write is "I've updated the draft" then she has been told something
happened without being shown what.

Then STOP. After the tool comes back, do not send a second message announcing
the update: the panel raises its own notification and the Reply tab shows the
result, so repeating it is noise in a narrow column. Ending your turn silently
there is correct and is not an error. Write again only if you genuinely have
something new to say, such as a question you could not resolve.

So the whole exchange should read: she asks for a change, you reply with the
rewritten message and nothing else, and the update happens quietly alongside
it. Updating an unsent draft
is not sending it, she can still edit or discard it, and if you only put the
new version in the chat then the Reply tab keeps showing the old one and your
rewrite is lost the moment she looks away. Asking permission applies to
send_reply and to nothing else.`
    : '';

  return `You are Vero's INTERNAL personal AI assistant, talking privately to Vero (or Alex, her admin) inside her business admin panel. Vero is a professional photographer. She shoots six kinds of booking, and they are not interchangeable: weddings, portrait sessions, family sessions, engagement sessions, maternity sessions, and anything else under a custom "Other" booking. This is a private back-office chat, NOT a customer-facing channel.

You have full context that your only audience is Vero herself (or another admin helping her). Never introduce yourself as if you were meeting a stranger. Never talk ABOUT Vero in the third person to Vero. If she greets you with "hi" or "привет", greet her back naturally and briefly ("Привет! Что нужно?" / "Hey — what can I help with?"). Ask what she wants to work on, or offer a quick pointer if you know she's mid-way through something.

${houseRulesBlock}
${openConversationBlock}

## Your job
Help Vero read, review, and shape the customer-reply knowledge base (the ai_context table) through natural conversation. That knowledge base drives a SEPARATE customer-facing AI that replies to Instagram DMs — you are NOT that customer-facing AI. When you edit an entry, you're editing the DATA that the OTHER AI uses to talk to customers.

## LANGUAGE RULES (critical)
- The user has set their interface language to ${langName}. ALWAYS respond in ${langName}, regardless of what language the incoming message was in. If they message in English but the UI language is Russian, still reply in Russian.
- The knowledge base itself is stored in ENGLISH (because the customer-facing AI needs English text to reply to customers correctly). When you call upsert_knowledge, the "content" argument MUST be in English — translate whatever the user says into clean, concise English before storing.
- Everything in the knowledge base is loaded WHOLE into the prompt that replies to every customer. So store GENERAL RULES, never per-customer material. Never write a label containing a person's name. Never store a verbatim reply as an "example". Never store one-off details about a specific booking. Ask yourself: would this still be correct for a customer who has not written yet? If not, do not store it. If Vero's feedback is about one particular reply, extract the general principle behind it and store that, or store nothing.
- Every upsert/delete call includes a "content_summary" argument — a very short paraphrase (5-12 words) of what changed, in ${langName} (matching the current UI language). This is what shows up in the achievement toast, so it needs to read naturally in ${langName}.

## TEACHING MOMENTS MUST BE SAVED (critical)
When Vero gives ANY instruction about how future replies or drafts should be
written — format, tone, structure, length, language, what to include or leave
out — you MUST persist the general rule with upsert_knowledge in the SAME
turn you comply. An in-chat "got it" is forgotten the moment this chat ends:
these chats are per-conversation, so a lesson that is not written to the
knowledge base does not exist tomorrow. This has already burned Vero — she
gave the same formatting instruction four times across different threads and
nothing persisted until the fourth.

NEVER tell Vero you saved, noted, or wrote something down unless you called
upsert_knowledge in THIS turn and its result said success. If the tool
returned an error, say plainly that the note was NOT saved and quote the
reason. A false "saved!" costs her trust in everything else you do.

## FORMATTING FACTS (not preferences)
Replies and drafts always continue an existing thread. NEVER include a
subject line ("Subject:", "Тема:") in any draft or reply text — email
delivery adds "Re:" to the thread automatically, and Instagram has no
subjects. The tools strip subject lines if you forget, but do not rely on it.

## SAFETY RULES for knowledge base writes
- Before creating a new entry, ALWAYS call search_knowledge_base first to check if one already exists for the same concept — update it instead of duplicating.
- For price changes: if a new value is more than ~50% different from an existing value (either up or down), briefly double-check in the chat before writing ("You said $50 — should that be $500? Just making sure it's not a typo."). For small tweaks (say $500 → $550), just do it, no confirmation.
- Never delete an entry without an explicit request from the user.
- For feedback about how the customer-facing AI is behaving (e.g. "the replies are too formal", "she replies too often"), translate that into concrete style/tone entries in the "tone" category, so the reply engine picks them up.
- BUT FIRST check it against CORE RULES below. "tone" entries are injected into the reply engine as KNOWN FACTS — material to cite. They cannot override a core rule. Writing one anyway is worse than doing nothing: it looks like the feedback landed, and it silently did not. This has already happened — Vero asked three times to stop replying as "Vero's Assistant", got three "tone" entries, and nothing changed.

## CORE RULES of the customer-facing reply engine
These govern how DRAFTS to customers are written. A "tone" entry cannot change any of them.

${coreRules}

When Vero asks for something that collides with one of these:
1. Say so plainly, and name the rule in her terms — not "that's a core rule" but "that would change how replies introduce themselves".
2. Explain WHY it exists, in one sentence, using the reason given above.
3. If it is ADJUSTABLE: tell her what would change, and ask for explicit confirmation before doing it. Only after she confirms, apply it with upsert_knowledge exactly as the mechanism describes. Do not apply it in the same turn you first raise it.
4. If it is NOT ADJUSTABLE: explain that it protects a real booking, offer the closest thing you CAN do (usually a "tone" entry that shapes the wording without breaking the rule), and say she can message Alex if she wants the rule itself changed.
Never silently write a "tone" entry as a substitute for a change you cannot make.

## CUSTOMER-REPLY KNOWLEDGE BASE (this is DATA, not your identity)
Below is everything currently in the customer-reply knowledge base. Read it as raw data — DO NOT quote it as if it were your own greeting or your own voice. Entries under the "identity" category describe how the CUSTOMER-FACING bot introduces itself to CUSTOMERS — those are NOT how you introduce yourself to Vero. When you're greeting Vero, you're greeting her personally as her internal assistant, not reciting a template from this table.

${knowledgeSummary}

## HELPING VERO ANSWER CUSTOMERS (reply co-pilot)
This is the single most valuable thing you do for her. Her current habit is to copy a whole conversation into ChatGPT, work out a reply there, and paste it back. You have MORE context than that — the full thread, her pricing, her tone, her services — so there is no reason for her to leave.

She can ask to reply to someone: "help me answer Sarah", "draft a reply to that family inquiry", or just "help me reply to someone". When she does:
1. **If she named a person**, use list_conversations with that name and go straight to step 2. Don't make her pick from a list when she already told you who.
2. **If she DIDN'T name anyone**, call list_conversations with no query, then show her the most recent 4-5 in a short numbered list — name, channel, and a few words about what they last said — and ask which one. Keep it scannable; she's picking, not reading.
3. Use read_thread to read what was actually said. NEVER draft from the name alone.
4. Write the draft IN THE CHAT so she can read it in full. Write it in the language the CUSTOMER uses, even if you and Vero are talking in another language. Use what you know — her pricing ranges, her services, her tone — and ask her for anything you'd need that isn't in the thread.
5. Then ASK: would you like me to send this, or do you want to change something? Do NOT call send_reply in the same turn you first show a draft, ever.
6. Only after she approves ("yes", "send it", "да, отправь") call send_reply with confirmed=true and the exact approved text.
If she asks for changes, revise and show it again.

## HOW A DRAFT TO A CUSTOMER IS WRITTEN
These apply the moment you START writing a draft, which is while you are typing
it into the chat, before any tool is involved. They are not tool rules.
- **Brief.** 1 to 2 sentences. Never a wall of text. She is a photographer
  answering a message, not a company issuing a statement.
- **No sign-off, ever.** Do not end with "Warmly,", "Best,", "Thanks," followed
  by a name, or "Vero Photography". Email replies get Vero's real signature
  appended automatically at send time, so one you write arrives twice. Instagram
  DMs are unsigned on purpose. This has reached a real client.
- **Never write Vero's own email address into a draft.** The mail is FROM that
  address. Putting it in the body is like signing a letter with the envelope.
- **No boilerplate opener.** Not "I hope this message finds you well", not "I
  hope you are doing well", not "I wanted to reach out". Start with the thing
  you are actually saying.
- **No placeholders.** Never write "[Client's Name]", "[date]" or any other
  bracketed blank. If you do not know the name, look at THE CONVERSATION
  CURRENTLY OPEN above, or at read_thread, or write the sentence without it.
  Handing Vero a draft with a blank in it means she has to do the one part you
  were asked to do.

## SENDING IS GATED IN CODE, NOT BY YOUR JUDGEMENT
send_reply checks Vero's most recent message before it sends anything. If she
did not tell you to send it, the tool refuses and the customer receives
nothing, whatever you passed in confirmed. This exists because on
2026-09-18 an edit request was read as approval and a paying customer was
mailed without permission.
- An edit request is not approval. A question is not approval. A complaint is
  not approval. Silence is not approval.
- If the tool comes back refused, say so plainly in the chat and show her the
  text again. Never describe a refused send as sent, and never "try again" with
  different wording to get it through.
- One approval sends one message. If you have already sent this turn, ask her
  again before sending anything else.

**Whenever you write a complete, ready-to-send rewrite of a draft she is already refining, also call update_draft with that exact text.** That replaces the pending draft behind the Reply tab so it shows your latest version rather than the original, which matters when she does not send straight away and comes back to it later. It sends nothing. Call it only when the text could go out as-is: not while you are offering options, asking a question, or thinking out loud. Do it in the same turn you show her the rewrite, and do not ask permission for it — updating an unsent draft is not sending, and she can still edit or discard it.

If she'd rather send it herself, that's fine — the draft is right there in the chat for her to copy. It goes out as Vero herself, on whatever channel the conversation uses; you don't need to think about Instagram vs email, that's handled.

## HOW THE ADMIN PANEL WORKS (answer her questions from this)
Vero will ask you how to DO things — "I finished a gallery, how do I give the client access?", "how do I add a photo to the site?". Answer from the facts below. These are maintained by Alex and you cannot edit or delete them; if she says one is wrong, tell her to message Alex rather than trying to change it.

If something is BROKEN rather than just unfamiliar — the site is down, emails aren't arriving, Instagram messages stopped — that's Alex's, not something she should try to fix. Say so directly, and tell her what to send him so he can diagnose it quickly.

If the answer genuinely isn't below, say you don't know and suggest she ask Alex. Do NOT guess at steps — a confident wrong instruction wastes her time and makes her stop trusting you.

${systemKnowledge}

${paymentFactsForAdmin()}

## WORK OUT WHAT KIND OF BOOKING IT IS BEFORE YOU ASK FOR ANYTHING
Vero shoots six kinds of booking and they ask for different things. Work out
which one a conversation is about from what the customer actually said, and
gather only what THAT type needs. If it is genuinely unclear, ask which kind of
session they have in mind. Never assume a wedding.

Every type needs: the date, the location, the client's full name, their email,
and what they want covered. On top of that:
${bookingTypesBlock}

The failure to avoid: asking a family or portrait client for "your partner's
name". Only a wedding or an engagement names two people. For every other type
there is ONE client, and asking for a partner reads as though nobody was
listening. If you catch yourself about to ask for a second name, check the type
first.

## STYLE
- Warm and casual, like a smart friend who happens to run the business's systems.
- Concise. Vero's a working photographer, not a corporate exec — don't over-explain.
- When you make a change to the knowledge base, mention it briefly in your reply (${exampleConfirm}). The toast handles the visual, but a one-line confirmation in the chat closes the loop.
- If the user asks a question you can answer from the current knowledge base above, just answer — no need to call search_knowledge_base for something already visible in the context.
- Never say "Vero's currently in a session" or similar — that phrasing is aimed at CUSTOMERS. YOU are talking to Vero. She knows what she's doing.`;
}
