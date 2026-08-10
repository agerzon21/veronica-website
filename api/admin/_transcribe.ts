/**
 * Admin: audio → text transcription via OpenAI Whisper.
 *
 * Called by the admin chat composers (Assistant + Messages) to convert
 * a recorded audio blob into text. Replaces the browser's native
 * SpeechRecognition API, which was fundamentally flaky on iOS Safari:
 *   - First-use permission prompt swallowed pointerup events
 *   - onresult often never fired on ru-RU
 *   - No reliable error surface — "nothing happens" was the norm
 *
 * Whisper solves all three: one HTTP request, ~$0.006/min, works
 * reliably across every browser that supports MediaRecorder (which is
 * everything current).
 *
 * POST — multipart/form-data with:
 *   - password: admin bearer (form field)
 *   - language: 'ru' | 'en' | undefined (form field, optional hint)
 *   - file: the audio blob (mp4/webm/ogg/wav — Whisper accepts any)
 *
 *   → 200 { success, transcript }
 *   → 400 no file / no password
 *   → 401 wrong password
 *   → 502 upstream Whisper error
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI, { toFile } from 'openai';
import Busboy from 'busboy';
import { requireAdmin } from '../_admin-auth.js';

// Vercel serverless function config — allow larger request bodies
// since audio blobs can be ~1MB for a 30s clip.
export const config = {
  api: {
    bodyParser: false,
    // 10MB cap — 30s of decent-quality audio is well under this; a
    // higher cap risks runaway uploads eating our function memory.
    sizeLimit: '10mb',
  },
};

const MODEL = 'whisper-1';
// Cap what we'll send to Whisper. 30s of speech is more than any
// reasonable single dictation — if Vero exceeds this she should
// pause + tap the mic again for the next segment.
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

let cachedClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (cachedClient) return cachedClient;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY env var missing');
  cachedClient = new OpenAI({ apiKey: key });
  return cachedClient;
}

interface ParsedForm {
  password: string | null;
  language: string | null;
  audio: { buffer: Buffer; filename: string; mimeType: string } | null;
}

function parseMultipart(req: VercelRequest): Promise<ParsedForm> {
  return new Promise((resolve, reject) => {
    const result: ParsedForm = { password: null, language: null, audio: null };
    // Cast because Vercel's IncomingMessage types are a superset of what busboy wants.
    const bb = Busboy({ headers: req.headers as any, limits: { fileSize: MAX_AUDIO_BYTES } });

    bb.on('field', (name, value) => {
      if (name === 'password') result.password = value;
      else if (name === 'language') result.language = value;
    });

    bb.on('file', (name, stream, info) => {
      if (name !== 'file') {
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      let truncated = false;
      stream.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_AUDIO_BYTES) {
          truncated = true;
          return;
        }
        chunks.push(chunk);
      });
      stream.on('limit', () => {
        truncated = true;
      });
      stream.on('end', () => {
        if (truncated) {
          reject(new Error('Audio file exceeds size limit'));
          return;
        }
        result.audio = {
          buffer: Buffer.concat(chunks),
          filename: info.filename || 'audio.webm',
          mimeType: info.mimeType || 'audio/webm',
        };
      });
    });

    bb.on('finish', () => resolve(result));
    bb.on('error', (err) => reject(err));
    req.pipe(bb);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let form: ParsedForm;
  try {
    form = await parseMultipart(req);
  } catch (err) {
    console.error('[admin/transcribe] multipart parse failed:', err);
    return res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Bad request',
    });
  }

  const auth = await requireAdmin(form.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  if (!form.audio || form.audio.buffer.length === 0) {
    return res.status(400).json({ success: false, error: 'No audio uploaded' });
  }

  try {
    const client = getOpenAI();
    // toFile wraps the Buffer as an OpenAI-ready File-like object with
    // filename + type metadata (Whisper uses the extension to sniff
    // the format).
    const file = await toFile(form.audio.buffer, form.audio.filename, {
      type: form.audio.mimeType,
    });

    // Language hint: Whisper auto-detects, but passing a hint bumps
    // accuracy and speed. Only pass known values.
    const lang = form.language === 'ru' || form.language === 'en' ? form.language : undefined;

    const result = await client.audio.transcriptions.create({
      file,
      model: MODEL,
      language: lang,
      // 'text' returns a plain string in `text`; 'verbose_json' gives
      // segment timings — we don't need those, so save the bytes.
      response_format: 'json',
    });

    const transcript = typeof result.text === 'string' ? result.text.trim() : '';
    return res.status(200).json({ success: true, transcript });
  } catch (err) {
    console.error('[admin/transcribe] whisper call failed:', err);
    return res.status(502).json({
      success: false,
      error: err instanceof Error ? err.message : 'Transcription failed',
    });
  }
}
