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
 * Append the signature to a plaintext body.
 *
 * Uses the RFC 3676 `-- ` sig delimiter (dash-dash-space-newline), which
 * Gmail / Apple Mail / Outlook recognize and collapse into a "..."
 * toggle. That keeps quoted reply chains readable instead of
 * accumulating a wall of repeated sign-offs.
 *
 * Idempotent: if the body already ends with the signature (Vero pasted
 * it, or a draft round-tripped), it isn't added twice.
 */
export function appendSignatureText(body: string, signature: string): string {
  const trimmedBody = body.replace(/\s+$/, '');
  const trimmedSig = signature.trim();
  if (!trimmedSig) return trimmedBody;
  if (trimmedBody.endsWith(trimmedSig)) return trimmedBody;
  return `${trimmedBody}\n\n-- \n${trimmedSig}`;
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
