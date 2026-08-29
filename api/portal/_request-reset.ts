import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes, createHash } from 'node:crypto';
import { getDb } from '../_db.js';
import { sendEmail } from '../_auto-reply.js';

/**
 * Client portal: request a password reset link.
 *
 * POST { email } → 200 { success: true }  — ALWAYS, see below.
 *
 * This became necessary the moment passwords were hashed (migration 025). Before
 * that, Vero could read a client's password out of the admin panel and just tell
 * them. Now nobody can, so without this the only recovery is her manually
 * overriding the password — which means the client has to reach her first.
 *
 * ── The response is deliberately identical whether the email matches or not ──
 *
 * A "no account with that email" message turns this endpoint into a way to test
 * whether any given address is one of Vero's clients. Her client list is
 * private — who is getting married, and when — so this always returns the same
 * 200 and the same generic copy. The only signal is whether an email arrives.
 *
 * The same reasoning is why there is no timing shortcut: the work done for an
 * unknown address is close enough to the work done for a known one that the
 * response time does not leak the answer either.
 *
 * ── Only the hash of the token is stored ──
 *
 * A database leak should not hand over working reset links. We store
 * SHA-256(token); the raw token exists only in the email. SHA-256 rather than
 * scrypt is correct here and not an inconsistency with _password.ts: this is a
 * 32-byte random value with no entropy to brute-force, unlike a human password,
 * and it needs a fast lookup by exact value.
 */

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  // The uniform response. Returned on every path below, including failures —
  // an internal error must not become a signal either.
  const uniform = () => res.status(200).json({ success: true });

  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, client_display_name, client_email
      FROM client_portals
      WHERE mode = 'full' AND lower(client_email) = ${email}
      LIMIT 1
    `) as Array<{ id: string; client_display_name: string | null; client_email: string | null }>;

    const portal = rows[0];
    if (!portal || !portal.client_email) {
      console.log(`[portal/request-reset] no portal for ${email} — returning uniform 200`);
      return uniform();
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    await sql`
      UPDATE client_portals
      SET reset_token_hash = ${sha256(token)},
          reset_token_expires_at = ${expiresAt},
          updated_at = NOW()
      WHERE id = ${portal.id}
    `;

    const siteOrigin =
      process.env.SITE_ORIGIN ||
      (req.headers.host ? `https://${req.headers.host}` : 'https://vero.photography');
    const resetUrl = `${siteOrigin}/portal/reset?token=${token}`;
    const name = portal.client_display_name || 'there';

    await sendEmail({
      to: portal.client_email,
      subject: 'Reset your portal password — Vero Photography',
      text:
        `Hi ${name},\n\n` +
        `Someone asked to reset the password for your Vero Photography client portal.\n\n` +
        `Set a new password here (the link works for one hour):\n${resetUrl}\n\n` +
        `If this wasn't you, you can ignore this email — your password has not changed.\n\n` +
        `— Vero Photography`,
      html:
        `<p>Hi ${name},</p>` +
        `<p>Someone asked to reset the password for your Vero Photography client portal.</p>` +
        `<p><a href="${resetUrl}">Set a new password</a> — the link works for one hour.</p>` +
        `<p>If this wasn't you, you can ignore this email; your password has not changed.</p>` +
        `<p>— Vero Photography</p>`,
    });

    console.log(`[portal/request-reset] reset link sent to ${email}`);
    return uniform();
  } catch (err) {
    // Still a uniform 200. An error here would otherwise distinguish "this
    // address exists and the send failed" from "this address is unknown".
    console.error('[portal/request-reset] failed:', err);
    return uniform();
  }
}
