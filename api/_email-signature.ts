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
 * Openers of a sign-off block, on a line of their own.
 *
 * Written as whole-line matches so "Thanks for sending those over" in the
 * middle of a sentence is untouched; only a line that is nothing but the word
 * counts.
 */
const SIGN_OFF_OPENER =
  /^(best|best regards|kind regards|warm regards|warmly|thanks|thanks so much|thank you|thx|sincerely|regards|cheers|talk soon|speak soon|с уважением|спасибо|всего доброго|до связи|обнимаю)[,!.]?$/i;

/**
 * Strip a sign-off the MODEL wrote, as opposed to the canonical one.
 *
 * stripTrailingSignature only ever removed an exact copy of Vero's stored
 * signature. That is not what turns up. On 2026-09-18 the model wrote
 * "Best,\nVeronika\nVero Photography\nvero@vero.photography", which is not the
 * canonical "Warmly,\nVeronika\nVero Photography", so nothing was stripped and
 * the real signature was appended underneath it. The customer received a mail
 * signed twice, with Vero's address written into the body of a message that
 * came FROM that address.
 *
 * The prompt now says not to write one, and that is worth having, but a
 * defect in a delivered email is not a style preference and should not rest on
 * the model complying.
 *
 * Narrow on purpose. It wants an opener on its own line, at the very end, with
 * 1 to 3 short lines under it that look like a name, a business and a contact
 * detail: no full stops, nothing long, nothing that reads as a sentence. It
 * never touches the middle of a message, and it never eats the whole thing, so
 * a reply that is only "Thanks," survives intact.
 */
function stripGenericSignOff(text: string): string {
  const lines = text.split('\n');
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  // The opener plus at most three lines under it: anything further back is
  // body text that happens to sit near the end.
  for (let i = end - 1; i >= 0 && i >= end - 4; i--) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (!SIGN_OFF_OPENER.test(line)) continue;
    const tail = lines
      .slice(i + 1, end)
      .map((l) => l.trim())
      .filter((l) => l !== '');
    if (tail.length > 3) continue;
    // A name or a handle, not a sentence. Final punctuation or any real length
    // means this is prose that happened to follow the word "Thanks".
    if (!tail.every((l) => l.length <= 60 && !/[.!?]$/.test(l))) continue;
    const head = lines.slice(0, i).join('\n').replace(/\s+$/, '');
    // Never return an empty body. A one-line "Thanks," IS the message.
    if (!head) continue;
    return head;
  }
  return text;
}

/**
 * Remove any trailing signature from a body: the canonical one (a draft that
 * round-tripped through the composer already signed) or one the AI wrote for
 * itself. Loops because both can stack ("body -- sig" drafted, then signed
 * again). Mid-text occurrences (quoted earlier mail) are deliberately left
 * alone; only the tail is touched.
 */
export function stripTrailingSignature(body: string, signature: string): string {
  let out = normalizeText(body);
  const sig = normalizeText(signature);
  for (let guard = 0; guard < 4; guard++) {
    const before = out;
    if (sig && out.endsWith(sig)) {
      out = out.slice(0, out.length - sig.length).replace(/\s+$/, '');
      // Swallow the sig delimiter a previous append (or the model) left
      // behind: "--", "-", or a lone em/en dash on its own line.
      out = out.replace(/(?:^|\n)[-–—]{1,2}$/, '').replace(/\s+$/, '');
    }
    out = stripGenericSignOff(out).replace(/\s+$/, '');
    // Also runs when the signature is empty, which is Vero deliberately
    // choosing not to sign. Her choosing that does not make a sign-off the
    // model invented for her hers.
    if (out === before) break;
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
