/**
 * Shared OpenAI-based helpers for language detection + translation.
 * Used by /api/admin/messages-translate (customer message translation
 * for the inbox) and can be extended to composer translate-before-send
 * without duplicating OpenAI plumbing.
 *
 * We use GPT-4o-mini for both — fast, cheap (< $0.001 per translation),
 * strong on the major languages Vero encounters (English, Russian,
 * Spanish, occasionally others). If we start seeing quality issues for
 * a specific language we can bump to gpt-4o.
 */

import OpenAI from 'openai';

const MODEL = 'gpt-4o-mini';

// Human-readable language names for common codes so prompts can name
// the target language clearly. Callers pass ISO-639-1 codes; if the
// code isn't in this map, the prompt just uses the code directly.
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  uk: 'Ukrainian',
  pl: 'Polish',
  tr: 'Turkish',
};

let cachedClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (cachedClient) return cachedClient;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY env var missing');
  cachedClient = new OpenAI({ apiKey: key });
  return cachedClient;
}

/**
 * Translate `text` into the target language. Returns just the
 * translation — no explanations, no wrapping. If the text is already
 * in the target language, GPT-4o-mini usually returns it unchanged,
 * which is what we want (caller can compare == input to detect
 * "already in target").
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
  const targetName = LANGUAGE_NAMES[targetLang] ?? targetLang;
  const client = getOpenAI();
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a professional translator. Translate the user's message into ${targetName}. Return ONLY the translation — no quotes, no explanation, no preamble. Preserve emojis, punctuation, and line breaks. If the text is already in ${targetName}, return it unchanged. Never editorialize.`,
      },
      { role: 'user', content: text },
    ],
    // 800 clipped real content: the longest assistant turn in production is
    // 2825 chars, and Russian output runs longer than the English input, so a
    // translated draft could stop mid-sentence with nothing to signal it.
    max_tokens: 2500,
    temperature: 0.2, // low for translation consistency
  });
  const choice = response.choices[0];
  if (choice?.finish_reason === 'length') {
    console.warn('[ai-translate] output hit the token cap and was truncated', {
      inputChars: text.length,
      targetLang,
    });
  }
  return choice?.message?.content?.trim() ?? text;
}

/**
 * Detect the ISO-639-1 language code of `text`. Returns 'unknown' if
 * detection fails. Used mostly to decide whether to auto-translate on
 * inbox load (skip if it's already Vero's preferred language).
 */
export async function detectLanguage(text: string): Promise<string> {
  const client = getOpenAI();
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content:
          'Detect the language of the user\'s message. Reply with ONLY the ISO-639-1 two-letter language code (e.g. "en", "ru", "es"). No quotes, no explanation, no punctuation.',
      },
      { role: 'user', content: text },
    ],
    max_tokens: 6,
    temperature: 0,
  });
  const raw = response.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
  // Accept only proper 2-letter codes; anything else falls back.
  return /^[a-z]{2}$/.test(raw) ? raw : 'unknown';
}
