/**
 * Admin: on-demand translate an arbitrary text into a target language.
 * Used by the inbox UI to translate customer messages to Vero's
 * preferred language when she clicks "Translate" next to a message,
 * and by the composer to translate her reply before sending.
 *
 * POST { password, text, targetLang }
 *   → 200 { success, translated, detectedLang }
 *   → 400 missing fields
 *   → 401 wrong password
 *   → 502 upstream OpenAI error
 *
 * Also returns the detected source language of the input so the UI
 * can label ("translated from English") without a second roundtrip.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';
import { translateText, detectLanguage } from '../_ai-translate.js';

const MAX_TEXT_LEN = 4000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  if (!text.trim()) {
    return res.status(400).json({ success: false, error: 'text is required' });
  }
  if (text.length > MAX_TEXT_LEN) {
    return res.status(400).json({ success: false, error: `text too long (max ${MAX_TEXT_LEN})` });
  }

  const targetLang =
    typeof req.body?.targetLang === 'string' ? req.body.targetLang.trim().toLowerCase() : '';
  if (!/^[a-z]{2}$/.test(targetLang)) {
    return res.status(400).json({
      success: false,
      error: 'targetLang must be a 2-letter ISO-639-1 code (en, ru, es, ...)',
    });
  }

  try {
    // Fire both in parallel — detection is fast, no reason to serialize.
    const [translated, detectedLang] = await Promise.all([
      translateText(text, targetLang),
      detectLanguage(text),
    ]);
    return res.status(200).json({
      success: true,
      translated,
      detectedLang,
    });
  } catch (err) {
    console.error('[admin/messages-translate] handler failed:', err);
    return res.status(502).json({ success: false, error: 'Translation failed' });
  }
}
