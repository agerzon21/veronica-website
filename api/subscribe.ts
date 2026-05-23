/**
 * Newsletter / exit-intent signup endpoint.
 *
 * POST { email: string }
 *   → 200 { success: true, alreadySubscribed?: boolean }
 *   → 400 { error: 'Invalid email' }
 *   → 405                                                  (non-POST)
 *
 * Generates a unique 10% discount code per email, stores the subscriber in
 * Neon, and fires a one-time welcome email with the code. If the email is
 * already in the table (unique constraint), we return success silently
 * without sending a duplicate email — prevents discount-code farming.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_db.js';
import { sendWelcomeEmail } from './_welcome-email.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateDiscountCode(): string {
  // 8 hex chars → ~4 billion combinations. Even with hundreds of subscribers,
  // collision probability is microscopic. Format: VERO-A4B2C8F1.
  const random = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0')
    .toUpperCase();
  return `VERO-${random}`;
}

type ExistingRow = { discount_code: string | null };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const source =
    typeof req.body?.source === 'string' ? req.body.source.trim() : 'exit_intent_popup';

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email' });
  }

  try {
    const sql = getDb();

    // Try insert. ON CONFLICT lets us handle the duplicate-email case cleanly
    // in a single round trip — no race condition between SELECT and INSERT.
    const discountCode = generateDiscountCode();
    const inserted = (await sql`
      insert into subscribers (email, source, discount_code)
      values (${email}, ${source}, ${discountCode})
      on conflict (email) do nothing
      returning discount_code
    `) as ExistingRow[];

    if (inserted.length === 0) {
      // Already subscribed — do NOT re-fire the welcome email (anti-abuse).
      return res.status(200).json({ success: true, alreadySubscribed: true });
    }

    // Fresh signup — fire the welcome email. Don't block the response on the
    // email send; if SMTP fails the subscriber still exists and we can resend
    // manually. Log failures for visibility.
    sendWelcomeEmail({ email, discountCode })
      .then((info) => {
        console.log('[subscribe] welcome email sent:', {
          messageId: info.messageId,
          to: info.accepted,
        });
      })
      .catch((err) => {
        console.error('[subscribe] welcome email failed:', err);
      });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[subscribe] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
