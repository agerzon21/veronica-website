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

    // Mirrors api/contact.ts behavior exactly: await the email send and
    // return 500 if it fails. Vercel serverless suspends the function once
    // res.send() runs — fire-and-forget promises never complete, which is
    // why the previous version's emails silently never went out even though
    // the popup said "You're in". The popup catches non-200 responses and
    // displays an error so the user can retry.
    try {
      const info = await sendWelcomeEmail({ email, discountCode });
      console.log('[subscribe] welcome email sent:', {
        messageId: info.messageId,
        to: info.accepted,
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[subscribe] welcome email failed:', err);
      // Roll back the subscriber insert so the user's retry doesn't hit
      // the unique constraint and get a misleading "already subscribed".
      try {
        await sql`delete from subscribers where email = ${email} and discount_code = ${discountCode}`;
      } catch (rollbackErr) {
        console.error('[subscribe] rollback failed:', rollbackErr);
      }
      return res.status(500).json({ success: false, error: 'Could not send the welcome email. Please try again.' });
    }
  } catch (err) {
    console.error('[subscribe] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
