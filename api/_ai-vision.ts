/**
 * OpenAI Vision helper — given a public image URL, returns
 * alt / title / description / keywords that match the site's
 * house style (see CLAUDE.md → "Frankenstein the new photos").
 *
 * Used by the gallery sync cron to auto-fill metadata for new
 * photos Vero drops into a Drive folder, so she never has to
 * hand-write descriptions again. The output is stored on
 * gallery_photos as a DRAFT — she reviews + tweaks + publishes
 * from the admin panel.
 *
 * We use GPT-4o-mini because vision is cheap ($0.15 / $0.60 per
 * 1M input/output tokens, images are billed at low-detail rate)
 * and quality is more than sufficient for one-sentence
 * descriptions + a handful of keywords. Expected cost per photo:
 * about $0.001.
 */

import OpenAI from 'openai';

const MODEL = 'gpt-4o-mini';

let cachedClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (cachedClient) return cachedClient;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY env var missing');
  cachedClient = new OpenAI({ apiKey: key });
  return cachedClient;
}

export interface VisionResult {
  slug: string;         // kebab-case, 2-5 words, derived from what's in the photo
  title: string;        // 3-7 words, no "| Vero Photography" suffix (added elsewhere)
  alt: string;          // one short, screen-reader-friendly sentence
  description: string;  // 1-2 sentences, warm/understated tone
  keywords: string[];   // 5-8 keywords from the canonical vocabulary
}

/**
 * Analyze a single photo and produce house-style metadata.
 *
 * `imageUrl` must be a publicly reachable URL (Drive's thumbnail
 * endpoint works — no auth needed on the OpenAI side).
 *
 * `category` biases keyword selection and is always included as
 * the first keyword (per CLAUDE.md).
 *
 * On success returns a fully populated VisionResult. On failure
 * (rate limit, model returned bad JSON, network) throws — the
 * cron catches it and inserts the photo with a placeholder
 * "needs review" description so Vero can fix it manually.
 */
export async function describePhoto(
  imageUrl: string,
  category: 'portraits' | 'weddings' | 'family' | 'maternity',
): Promise<VisionResult> {
  const client = getOpenAI();

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Category: ${category}. Analyze the photo and produce the JSON object.`,
          },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
        ],
      },
    ],
    max_tokens: 400,
    temperature: 0.4,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
  const parsed = JSON.parse(raw) as Partial<VisionResult>;

  // Defensive parse — model MOSTLY returns the right shape but
  // occasionally slips a field, so we coerce + fill defaults so
  // the caller never gets a half-shape.
  const slug = normalizeSlug(typeof parsed.slug === 'string' ? parsed.slug : '');
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const alt = typeof parsed.alt === 'string' ? parsed.alt.trim() : '';
  const description =
    typeof parsed.description === 'string' ? parsed.description.trim() : '';
  const rawKw = Array.isArray(parsed.keywords) ? parsed.keywords : [];
  const keywords = normalizeKeywords(rawKw, category);

  return { slug, title, alt, description, keywords };
}

/**
 * URL-friendly slug: lowercase, alphanumerics + hyphens, no
 * leading/trailing dashes, max 60 chars. Same pattern as
 * journal-shared.slugify.
 */
function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * Cleans up keywords the model returned:
 *   - lowercase + trim
 *   - drop empties, dupes
 *   - ensure the category is always first (per CLAUDE.md rule)
 *   - cap at 10 (loose upper bound; the model is instructed to
 *     return 5-8, this is defense-in-depth)
 */
function normalizeKeywords(
  raw: unknown[],
  category: 'portraits' | 'weddings' | 'family' | 'maternity',
): string[] {
  const cleaned = raw
    .filter((k): k is string => typeof k === 'string')
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0 && k.length <= 40);
  const seen = new Set<string>();
  const out: string[] = [category];
  seen.add(category);
  for (const k of cleaned) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= 10) break;
  }
  return out;
}

// The system prompt is derived directly from the "Frankenstein the
// new photos" section of CLAUDE.md so the AI produces content that
// matches every photo I've hand-styled to date. Any change to the
// house style there should be mirrored here.
const SYSTEM_PROMPT = `You are helping a photographer catalog photos for her portfolio website. You analyze a photo and produce standardized metadata in the exact shape the site expects.

Return a JSON object with these EXACT keys:
- "slug": short kebab-case identifier, 2-5 words, describing what's in the photo (e.g. "sunset-palm-tree-portrait", "bride-groom-first-dance"). URL-safe: only lowercase letters, digits, hyphens. No trailing category name — that's handled elsewhere.
- "title": concise page title, 3-7 words, describing the photo (e.g. "Sunset Portrait Beneath a Palm Tree"). Title Case. Do NOT append "| Vero Photography" — that's auto-added.
- "alt": one short sentence describing what's in the photo, screen-reader-friendly. Factual, not marketing.
- "description": 1-2 sentences. Warm but understated tone. Descriptive of the visual and the feeling.
- "keywords": array of 5-8 lowercase, single- or hyphenated-word tags from the canonical vocabulary below.

STRICT STYLE RULES (never violate):
1. NO LOCATION NAMES anywhere — no "Punta Cana", "Scranton", "Almaty", "beach in Bali", etc. The photographer's business must be portable.
2. NO GENERIC PRAISE WORDS in title/description: avoid "stunning", "beautiful", "captivating", "vibrant", "joyful", "magical", "enchanting", "gorgeous", "breathtaking".
3. NO PEOPLE-NAME REFERENCES in keywords.
4. Match the tone of a warm, understated photography portfolio — factual descriptions of what's in the frame + the feeling, not marketing copy.
5. Alt text is the shortest of the three prose fields; description is the longest but still max 2 sentences.

CANONICAL KEYWORD VOCABULARY (use ONLY these words for keywords, adding fresh ones only when a concept truly isn't covered):

Subject: woman, girl, man, boy, couple, family, mother, father, daughter, son, sisters, friends, bride, groom, newlyweds, pregnant, baby, newborn, horse

Setting: beach, ocean, forest, park, garden, field, studio, interior, kitchen, mountains, glacier, pier, lighthouse, pool

Time/Light: sunset, golden-hour, night, natural-light

Style/Mood: black-and-white, portrait, close-up, aerial, collage, artistic, elegant, romantic, playful, intimate, fashion

Things: flowers, lotus, sunflowers, palm-trees, swimsuit, dress, rings, bouquet, veil, vintage, tropical, autumn, christmas

The category (portraits / weddings / family / maternity) is ALWAYS the first keyword — the caller adds it, don't include it yourself.

Reply with ONLY the JSON object — no preamble, no markdown code fences, no explanation.`;
