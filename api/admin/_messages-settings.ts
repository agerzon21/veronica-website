/**
 * Admin: read or update the email signature appended to outbound
 * replies sent from the Messages panel.
 *
 * POST { password }
 *   → 200 { success, signatureText, signatureHtml }
 * POST { password, save: true, signatureText, signatureHtml }
 *   → 200 { success, signatureText, signatureHtml }   (after saving)
 *   → 400 invalid payload / unsafe HTML
 *   → 401 wrong password
 *
 * Admin-level (not super) — this is Vero's own sign-off, and she should
 * be able to change it without going through Alex.
 *
 * Stored in system_state under the keys seeded by migration 017. An
 * empty string is a legitimate value meaning "no signature"; only a
 * missing row falls back to the hardcoded default in _email-signature.ts.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { loadSignature, SIGNATURE_KEY_TEXT, SIGNATURE_KEY_HTML } from '../_email-signature.js';

const MAX_SIGNATURE_LEN = 4000;

/**
 * The signature is injected verbatim into every outbound email, so it
 * is the one admin-editable field that becomes markup in someone else's
 * inbox. Vero is trusted, but a pasted snippet from a "free email
 * signature generator" can easily carry a tracking script or a remote
 * iframe — which would tank deliverability and leak her recipients to a
 * third party. Reject the dangerous constructs rather than silently
 * stripping them, so she can see what was wrong and fix it.
 */
const UNSAFE_HTML = [
  { pattern: /<\s*script\b/i, label: '<script> tags' },
  { pattern: /<\s*iframe\b/i, label: '<iframe> tags' },
  { pattern: /<\s*object\b/i, label: '<object> tags' },
  { pattern: /<\s*embed\b/i, label: '<embed> tags' },
  { pattern: /[\s/]on\w+\s*=/i, label: 'inline event handlers (onclick, onload, …)' },
  { pattern: /javascript\s*:/i, label: 'javascript: URLs' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  try {
    if (req.body?.save !== true) {
      const current = await loadSignature();
      return res.status(200).json({
        success: true,
        signatureText: current.text,
        signatureHtml: current.html,
      });
    }

    const signatureText = req.body?.signatureText;
    const signatureHtml = req.body?.signatureHtml;
    if (typeof signatureText !== 'string' || typeof signatureHtml !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'signatureText and signatureHtml must both be strings',
      });
    }
    if (signatureText.length > MAX_SIGNATURE_LEN || signatureHtml.length > MAX_SIGNATURE_LEN) {
      return res.status(400).json({
        success: false,
        error: `Signature too long (max ${MAX_SIGNATURE_LEN} characters)`,
      });
    }

    const unsafe = UNSAFE_HTML.find((u) => u.pattern.test(signatureHtml));
    if (unsafe) {
      return res.status(400).json({
        success: false,
        error: `Signature HTML can't contain ${unsafe.label}.`,
      });
    }

    const sql = getDb();
    await sql`
      INSERT INTO system_state (key, updated_at, value)
      VALUES (${SIGNATURE_KEY_TEXT}, NOW(), ${signatureText})
      ON CONFLICT (key) DO UPDATE SET updated_at = NOW(), value = EXCLUDED.value
    `;
    await sql`
      INSERT INTO system_state (key, updated_at, value)
      VALUES (${SIGNATURE_KEY_HTML}, NOW(), ${signatureHtml})
      ON CONFLICT (key) DO UPDATE SET updated_at = NOW(), value = EXCLUDED.value
    `;

    console.log('[admin/messages-settings] signature updated');
    return res.status(200).json({ success: true, signatureText, signatureHtml });
  } catch (err) {
    console.error('[admin/messages-settings] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
