/**
 * Complete the setup flow: client picks a password.
 *
 * POST { token, password }
 *   → 200 { success, email }   on success — UI uses email to auto-login
 *   → 400                      password too short / missing
 *   → 410                      token used or expired
 *
 * Atomically sets the password and clears the setup token so the link
 * can't be used twice.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hashPortalPassword } from './_password.js';
import { getDb } from '../_db.js';

const MIN_PASSWORD_LENGTH = 6;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  // TRIMMED, and trimmed BEFORE the length check.
  //
  // Login trims (api/portal/_client.ts:75) and so does the change-password
  // form, but these two set-a-password paths stored the raw value. A password
  // ending in a space — a paste, or a mobile keyboard adding one after
  // autocomplete — was therefore hashed WITH the space and compared WITHOUT it,
  // so it could never sign in. The client sees "Incorrect email or password"
  // for the password they just chose.
  //
  // Trimming before the length check also closes the follow-on: six spaces used
  // to satisfy a six-character minimum, hash successfully, and leave an account
  // no input can ever unlock.
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';

  if (!token) {
    return res.status(400).json({ success: false, error: 'token required' });
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }

  try {
    const sql = getDb();
    // Single statement: update only if the token matches AND isn't expired.
    // RETURNING gives us the email so the client UI can auto-login.
    const rows = (await sql`
      update client_portals
      set client_password_hash = ${hashPortalPassword(password)},
          -- Explicitly null, not merely unset: a brand-new client should never
          -- have a plaintext password row at all.
          setup_token = null,
          setup_token_expires_at = null,
          updated_at = now()
      where setup_token = ${token}
        and mode = 'full'
        and (setup_token_expires_at is null or setup_token_expires_at > now())
      returning client_email
    `) as Array<{ client_email: string }>;

    if (rows.length === 0) {
      return res.status(410).json({
        success: false,
        error: 'This setup link is no longer valid. Reach out to Veronika to get a new one.',
      });
    }

    return res.status(200).json({ success: true, email: rows[0].client_email });
  } catch (err) {
    console.error('[portal/welcome-complete] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
