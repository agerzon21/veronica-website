/**
 * Admin: generate an AI-powered summary of a conversation so Vero
 * can glance at the top of a thread and immediately know what the
 * customer is asking about, what info's been gathered, whether it's
 * even worth her time, and what her next step should be — without
 * reading the full message history.
 *
 * POST { password, conversationId }
 *   → 200 { success, summary: { classification, asking, gathered, nextStep, tone } }
 *   → 400 missing conversationId
 *   → 401 wrong password
 *   → 404 conversation not found
 *   → 502 upstream OpenAI error
 *
 * `classification` — one of booking-inquiry, existing-client,
 *              general-question, collaboration-offer, spam-or-unrelated,
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

type Classification =
  | 'booking-inquiry'
  | 'existing-client'
  | 'general-question'
  | 'collaboration-offer'
  | 'spam-or-unrelated'
  | 'unclear';

const VALID_CLASSIFICATIONS: readonly Classification[] = [
  'booking-inquiry',
  'existing-client',
  'general-question',
  'collaboration-offer',
  'spam-or-unrelated',
  'unclear',
] as const;

interface Summary {
  classification: Classification;
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

  const systemPrompt = `You are analyzing a conversation between a photography customer and a photographer's inbox (some replies come from the photographer's AI assistant, some from the photographer Vero personally). Produce a compact summary Vero can use to catch up on the thread at a glance AND immediately decide whether it's worth her time.

Return a JSON object with EXACTLY these keys:
- "classification": one string, EXACTLY one of:
    * "booking-inquiry" — real photography client asking about pricing/availability/sessions/weddings
    * "existing-client" — someone Vero is already working with (references a past shoot, a scheduled event, a delivered gallery, or is following up on something Vero personally started)
    * "general-question" — genuine but non-booking (e.g. asking about her camera gear, admiring her work with no ask)
    * "collaboration-offer" — a legitimate creative/brand collab proposal (rare — most "collab" DMs are actually spam)
    * "spam-or-unrelated" — solicitation, sales pitch, agency outreach (web design, SEO, marketing services, "your website is outdated", "we can help you"), crypto/investment, unrelated to photography, or template mass-DM. When in doubt between this and collaboration-offer, prefer this — real collabs are extremely rare.
    * "unclear" — you genuinely cannot tell (e.g. just "hey" with no prior context)
- "asking": one sentence describing what the customer is fundamentally asking for. If unclear, say "General inquiry — nothing specific asked yet." If spam, describe what they're pitching.
- "gathered": array of concrete facts the customer has shared — dates, locations, session types, headcounts, styles they like, constraints, budget mentions, deadlines. Empty array if nothing concrete has been shared yet OR if it's spam (don't extract "facts" from a pitch).
- "nextStep": one sentence — what should Vero do next. For real inquiries: confirm a date, send pricing, ask a specific missing question. For existing clients: reference what they're following up on. For spam: "Ignore — solicitation, not a real inquiry." For general questions: a brief, appropriate acknowledgment. Say "Awaiting customer response" if the ball is in their court.
- "tone": ONE WORD describing the customer's tone. Options: enthusiastic, hesitant, curious, decisive, casual, formal, urgent, price-sensitive, promotional (for spam/agency pitches), unclear.

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

  const classification: Classification =
    typeof parsed.classification === 'string' &&
    (VALID_CLASSIFICATIONS as readonly string[]).includes(parsed.classification)
      ? (parsed.classification as Classification)
      : 'unclear';

  return {
    classification,
    asking: typeof parsed.asking === 'string' ? parsed.asking : 'Nothing specific asked yet.',
    gathered: Array.isArray(parsed.gathered)
      ? parsed.gathered.filter((g): g is string => typeof g === 'string')
      : [],
    nextStep: typeof parsed.nextStep === 'string' ? parsed.nextStep : 'Awaiting customer response',
    tone: typeof parsed.tone === 'string' ? parsed.tone : 'unclear',
  };
}
