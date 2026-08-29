/**
 * Client-initiated password change from inside the authenticated portal.
 *
 * POST { email, current_password, new_password }
 *   → 200 { success: true }              on hit
 *   → 400 on new_password shorter than 6 chars
 *   → 401 on wrong current password
 *   → 405 on non-POST
 *
 * This is what a client uses to swap out a temporary password the admin
 * gave them (via the AccountSection "Set Password" override) for one
 * they'll actually remember. They already know their current password
 * to be able to log in, so requiring it here is a light re-auth to
 * prevent someone with an unlocked browser session from silently
 * changing the account owner's password.
 *
 * Same wrong-auth delay pattern as /api/portal/client to blunt timing
 * attacks. We DON'T leak whether the email exists — a bad email
 * returns the same 401 as a bad password.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkPortalPassword, hashPortalPassword } from './_password.js';
import { getDb } from '../_db.js';

const MIN_PASSWORD_LENGTH = 6;
const WRONG_AUTH_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const currentPassword =
    typeof req.body?.current_password === 'string' ? req.body.current_password.trim() : '';
  const newPassword =
    typeof req.body?.new_password === 'string' ? req.body.new_password.trim() : '';

  if (!email || !currentPassword) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Email and current password required' });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({
      success: false,
      error: 'New password must be different from the current one.',
    });
  }

  try {
    const sql = getDb();
    // Verify credentials against the current password. Same lookup shape
    // as /api/portal/client so behavior stays consistent.
    const rows = (await sql`
      select id, client_password, client_password_hash
      from client_portals
      where mode = 'full'
        and lower(client_email) = ${email}
      limit 1
    `) as Array<{ id: string; client_password: string | null; client_password_hash: string | null }>;

    // Password verified in code, not SQL — it is hashed now. Same 401 and
    // same delay either way so this cannot enumerate client addresses.
    if (
      !rows[0] ||
      !checkPortalPassword(currentPassword, rows[0].client_password_hash, rows[0].client_password).ok
    ) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
    }

    await sql`
      update client_portals
      set client_password_hash = ${hashPortalPassword(newPassword)},
          -- Clear the legacy plaintext for this row. Once a client changes
          -- their password there is no reason to keep a readable copy, and it
          -- shrinks the set of rows the eventual DROP has to wait on.
          client_password = null,
          updated_at = now()
      where id = ${rows[0].id}
    `;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[portal/change-password] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
