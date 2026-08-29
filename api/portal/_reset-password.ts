import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { getDb } from '../_db.js';
import { hashPortalPassword } from './_password.js';

/**
 * Client portal: complete a password reset.
 *
 * POST { token, password } → 200 { success, email }
 *   → 400 missing fields or password too short
 *   → 401 token unknown, already used, or expired
 *
 * The token IS the authentication — same model as the setup_token in
 * _welcome-complete.ts. Possession of a 32-byte random value that we only ever
 * sent to the address on the account is treated as proof of control of that
 * address.
 *
 * Unlike the request side, this one DOES distinguish failures. Once someone is
 * holding a link there is nothing to protect: a bad token tells an attacker
 * only that the random value they already have is not valid, and a client whose
 * link expired needs to be told that rather than left guessing why nothing
 * happened.
 *
 * The token is single-use — cleared in the same UPDATE that sets the password,
 * so a leaked link in a mail archive cannot be replayed later.
 *
 * Returns the email so the UI can drop the client straight into the portal with
 * their new credentials rather than making them retype it.
 */

const MIN_PASSWORD_LENGTH = 6;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!token || !password) {
    return res.status(400).json({ success: false, error: 'Token and password are required' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }

  try {
    const sql = getDb();

    // Look up by the HASH — the raw token is never stored.
    const rows = (await sql`
      SELECT id, client_email, reset_token_expires_at
      FROM client_portals
      WHERE reset_token_hash = ${sha256(token)}
      LIMIT 1
    `) as Array<{ id: string; client_email: string | null; reset_token_expires_at: string | null }>;

    const portal = rows[0];
    if (!portal) {
      return res.status(401).json({ success: false, error: 'This reset link is no longer valid.' });
    }

    if (
      portal.reset_token_expires_at &&
      new Date(portal.reset_token_expires_at).getTime() < Date.now()
    ) {
      return res
        .status(401)
        .json({ success: false, error: 'This reset link has expired. Request a new one.' });
    }

    // Set the new password and burn the token in one statement, so there is no
    // window where a replayed link could succeed.
    await sql`
      UPDATE client_portals
      SET client_password_hash = ${hashPortalPassword(password)},
          client_password = NULL,
          reset_token_hash = NULL,
          reset_token_expires_at = NULL,
          updated_at = NOW()
      WHERE id = ${portal.id}
    `;

    console.log(`[portal/reset-password] password reset for ${portal.client_email}`);
    return res.status(200).json({ success: true, email: portal.client_email });
  } catch (err) {
    console.error('[portal/reset-password] failed:', err);
    return res.status(500).json({ success: false, error: 'Could not reset the password.' });
  }
}
