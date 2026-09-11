/**
 * Vero's email signature — loaded from system_state, appended to
 * outbound mail sent from the admin panel.
 *
 * Lives in the DB rather than a constant so Veronika can edit it from
 * the Messages tab without a deploy. Seeded by migration 017 with the
 * same wording the contact-form auto-reply already uses, so mail sent
 * from the panel reads identically to what clients already receive.
 *
 * Only applied to the EMAIL channel. Instagram DMs get no signature —
 * signing a DM reads as automated, and the handle is already visible.
 *
 * Failure posture: a missing or unreadable signature must never block a
 * send. Every accessor degrades to the hardcoded fallback and logs.
 * Vero losing her sign-off is a cosmetic problem; a reply that doesn't
 * go out is a real one.
 */

import { getDb } from './_db.js';

export const SIGNATURE_KEY_TEXT = 'email_signature_text';
export const SIGNATURE_KEY_HTML = 'email_signature_html';

/**
 * Used when the DB rows are missing entirely (migration not applied, or
 * someone deleted the keys). Matches migration 017's seed values.
 */
const FALLBACK_TEXT = 'Warmly,\nVeronika\nVero Photography';
const FALLBACK_HTML =
  '<p style="margin:24px 0 0;">Warmly,<br><em>Veronika</em></p>' +
  '<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;' +
  'text-transform:uppercase;color:#c9a96e;margin:8px 0 0;">Vero Photography</p>';

export interface EmailSignature {
  text: string;
  html: string;
}

/**
 * Read the current signature. Returns the fallback (never throws) if the
 * rows are missing or the DB is unreachable.
 */
export async function loadSignature(): Promise<EmailSignature> {
  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT key, value FROM system_state
      WHERE key IN (${SIGNATURE_KEY_TEXT}, ${SIGNATURE_KEY_HTML})
    `) as Array<{ key: string; value: string | null }>;

    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    // An empty-string value is a deliberate "no signature" choice by
    // Vero and must be respected — only null/undefined falls back.
    const text = byKey.get(SIGNATURE_KEY_TEXT);
    const html = byKey.get(SIGNATURE_KEY_HTML);
    return {
      text: text ?? FALLBACK_TEXT,
      html: html ?? FALLBACK_HTML,
    };
  } catch (err) {
    console.error('[email-signature] load failed, using fallback:', err);
    return { text: FALLBACK_TEXT, html: FALLBACK_HTML };
  }
}

/**
 * Normalize text for signature comparison and outbound plaintext: CRLF to
 * LF, and strip trailing whitespace from every line. The AI writes its
 * sign-offs with Markdown's two-trailing-space line breaks ("Warmly,  \n"),
 * which is invisible in any mail client but defeated the old exact
 * endsWith check — that mismatch is how a client received the signature
 * twice. Per-line trailing whitespace carries no meaning in email text,
 * so normalizing the whole outbound body is safe.
 */
const normalizeText = (s: string): string =>
  s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+$/, ''))
    .join('\n')
    .replace(/\s+$/, '');

/**
 * Remove any trailing copy of the signature from a body — the AI writing
 * its own sign-off, or a draft that round-tripped through the composer
 * already signed. Loops because both can stack ("body -- sig" drafted,
 * then signed again). Mid-text occurrences (quoted earlier mail) are
 * deliberately left alone; only the tail is touched.
 */
export function stripTrailingSignature(body: string, signature: string): string {
  let out = normalizeText(body);
  const sig = normalizeText(signature);
  if (!sig) return out;
  for (let guard = 0; guard < 4 && out.endsWith(sig); guard++) {
    out = out.slice(0, out.length - sig.length).replace(/\s+$/, '');
    // Swallow the sig delimiter a previous append (or the model) left
    // behind: "--", "-", or a lone em/en dash on its own line.
    out = out.replace(/(?:^|\n)[-–—]{1,2}$/, '').replace(/\s+$/, '');
  }
  return out;
}

/**
 * Append the signature to a plaintext body.
 *
 * Uses the RFC 3676 `-- ` sig delimiter (dash-dash-space-newline), which
 * Gmail / Apple Mail / Outlook recognize and collapse into a "..."
 * toggle. That keeps quoted reply chains readable instead of
 * accumulating a wall of repeated sign-offs.
 *
 * Idempotent the robust way: any trailing copy of the signature is
 * stripped first (see stripTrailingSignature), then the canonical block
 * is appended exactly once.
 */
export function appendSignatureText(body: string, signature: string): string {
  const sig = normalizeText(signature);
  const base = stripTrailingSignature(body, sig);
  if (!sig) return base;
  if (!base) return sig;
  return `${base}\n\n-- \n${sig}`;
}

/**
 * Build the HTML body for an outbound reply: the plaintext body rendered
 * as escaped HTML with line breaks preserved, followed by the signature
 * block.
 *
 * The composer is a plain textarea — Vero types text, not markup — so
 * this ESCAPES her input. Without that, a client whose name contains
 * `<` or an ampersand in a URL would produce broken or (worse)
 * injectable markup in the delivered email.
 */
export function buildReplyHtml(body: string, signatureHtml: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, '<br>'))
    .filter((p) => p.trim().length > 0)
    .map((p) => `<p style="margin:0 0 14px;">${p}</p>`)
    .join('\n');

  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,',
    'Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#2d2d2d;">',
    paragraphs,
    signatureHtml.trim(),
    '</div>',
  ].join('\n');
}
