/**
 * Admin: generate an AI-powered summary of a conversation so Vero
 * can glance at the top of a thread and immediately know what the
 * customer is asking about, what info's been gathered, and what her
 * next step should be — without reading the full message history.
 *
 * POST { password, conversationId }
 *   → 200 { success, summary: { asking, gathered, nextStep, tone } }
 *   → 400 missing conversationId
 *   → 401 wrong password
 *   → 404 conversation not found
 *   → 502 upstream OpenAI error
 *
 * `asking` — one sentence: what the customer is fundamentally asking for
 * `gathered` — array of specific facts the customer has shared (dates,
 *              locations, session types, headcounts, styles they like,
 *              constraints, etc.) — empty array if nothing specific yet
 * `nextStep` — one sentence: what Vero should do next (confirm date,
 *              send package options, ask a specific missing question)
 * `tone` — one word describing the customer's energy (enthusiastic,
 *          hesitant, price-sensitive, casual, urgent, formal)
 *
 * We don't cache summaries in the DB for MVP — regenerated on demand.
 * If Vero regens the summary on every conversation open + we get a
 * lot of traffic this could add up (~$0.005 per summary with GPT-4o-mini),
 * but at expected volume it's negligible. Later we can cache in a new
 * `conversation_summary` column keyed off the latest message's id so
 * we skip regenerating when nothing's changed.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

const MODEL = 'gpt-4o-mini';

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

interface Summary {
  asking: string;
  gathered: string[];
  nextStep: string;
  tone: string;
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

  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT direction, sender, body, sent_at
      FROM messages
      WHERE conversation_id = ${conversationId}
      ORDER BY sent_at ASC
      LIMIT 100
    `) as MessageRow[];

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation has no messages',
      });
    }

    const summary = await generateSummary(rows);
    return res.status(200).json({ success: true, summary });
  } catch (err) {
    console.error('[admin/messages-summary] handler failed:', err);
    return res.status(502).json({ success: false, error: 'Summary generation failed' });
  }
}

async function generateSummary(messages: MessageRow[]): Promise<Summary> {
  const client = getOpenAI();

  // Format the transcript for the model. Label sides clearly so the
  // model doesn't get confused about which side is the customer.
  const transcript = messages
    .map((m) => {
      const role =
        m.direction === 'inbound'
          ? 'Customer'
          : m.sender === 'ai'
            ? 'AI Assistant'
            : 'Vero';
      return `${role}: ${m.body}`;
    })
    .join('\n\n');

  const systemPrompt = `You are analyzing a conversation between a photography customer and a photographer's inbox (some replies come from the photographer's AI assistant, some from the photographer Vero personally). Produce a compact summary Vero can use to catch up on the thread at a glance.

Return a JSON object with EXACTLY these keys:
- "asking": one sentence describing what the customer is fundamentally asking for. If unclear, say "General inquiry — nothing specific asked yet."
- "gathered": array of concrete facts the customer has shared — dates, locations, session types, headcounts, styles they like, constraints, budget mentions, deadlines. Empty array if nothing concrete has been shared yet.
- "nextStep": one sentence — what should Vero do next. Confirm a date? Send pricing? Ask a specific missing question? Say "Awaiting customer response" if the ball is in their court.
- "tone": ONE WORD describing the customer's tone. Options: enthusiastic, hesitant, curious, decisive, casual, formal, urgent, price-sensitive, unclear.

Reply with ONLY the JSON object — no preamble, no markdown code fences, no explanation.

Facts and dates should be short — "Aug 12, 2026" not "the 12th of August 2026". If the customer said "next weekend" don't try to convert it — write it as they said it.`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: transcript },
    ],
    max_tokens: 400,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
  const parsed = JSON.parse(raw) as Partial<Summary>;

  return {
    asking: typeof parsed.asking === 'string' ? parsed.asking : 'Nothing specific asked yet.',
    gathered: Array.isArray(parsed.gathered)
      ? parsed.gathered.filter((g): g is string => typeof g === 'string')
      : [],
    nextStep: typeof parsed.nextStep === 'string' ? parsed.nextStep : 'Awaiting customer response',
    tone: typeof parsed.tone === 'string' ? parsed.tone : 'unclear',
  };
}
