/**
 * Manage the Gallery Pass for a Client Portal — rotate / enable / disable /
 * set custom. Re-authenticates on every call against the client's email +
 * password (no session token in this MVP — credentials live only in the
 * page's React state, never persisted).
 *
 * POST { email, password, action, customPassword? }
 *   action: 'rotate' | 'enable' | 'disable' | 'set'
 *   customPassword: required when action='set'
 *
 *   → 200 { success, gallery_password, gallery_enabled }
 *   → 401                                                  on wrong creds
 *   → 400                                                  on malformed body
 *   → 409                                                  on collision (caller's customPassword already taken)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';

const WRONG_AUTH_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Omit visually-confusable chars (I, O, 0, 1, L) so guests who read the
// password aloud at the reception don't fumble it. 8 chars from a 32-char
// alphabet ≈ 40 bits — well over a trillion possibilities, plenty for our
// brute-force protection + uniqueness constraint.
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const randomGalleryPassword = (): string => {
  let s = '';
  for (let i = 0; i < 8; i++) {
    s += PASSWORD_ALPHABET[Math.floor(Math.random() * PASSWORD_ALPHABET.length)];
  }
  return s;
};

// Returns a generated gallery password that doesn't collide with any
// existing one. The DB has a UNIQUE constraint on gallery_password so a
// race-condition collision would just throw on insert/update — but we
// prefer to find a free one cleanly up front. Bounded retries because if
// the table is somehow full of every 8-char password (it won't be), we
// want a thrown error rather than an infinite loop.
async function generateUniquePassword(
  sql: ReturnType<typeof getDb>,
): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidate = randomGalleryPassword();
    const collision = (await sql`
      select 1 from client_portals where gallery_password = ${candidate} limit 1
    `) as Array<{ '?column?': number }>;
    if (collision.length === 0) return candidate;
  }
  throw new Error('Could not generate a unique gallery password after 10 attempts');
}

type Action = 'rotate' | 'enable' | 'disable' | 'set';
const VALID_ACTIONS: readonly Action[] = ['rotate', 'enable', 'disable', 'set'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password =
    typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  const action = req.body?.action as Action | undefined;
  const customPassword =
    typeof req.body?.customPassword === 'string'
      ? req.body.customPassword.trim()
      : null;

  if (!email || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Email and password required' });
  }

  if (!action || !VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ success: false, error: 'Invalid action' });
  }

  if (action === 'set' && (!customPassword || customPassword.length < 4)) {
    return res
      .status(400)
      .json({ success: false, error: 'Custom password must be at least 4 characters' });
  }

  try {
    const sql = getDb();

    // 1. Authenticate
    const auth = (await sql`
      select id from client_portals
      where mode = 'full'
        and lower(client_email) = ${email}
        and client_password = ${password}
      limit 1
    `) as Array<{ id: string }>;

    if (auth.length === 0) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Incorrect email or password' });
    }
    const portalId = auth[0].id;

    // 2. Compute new state per action
    let newPassword: string | null = null;
    let newEnabled: boolean | null = null;

    if (action === 'rotate') {
      newPassword = await generateUniquePassword(sql);
    } else if (action === 'enable') {
      newEnabled = true;
    } else if (action === 'disable') {
      newEnabled = false;
    } else if (action === 'set') {
      // Check the user-chosen password isn't already in use by someone else.
      const collision = (await sql`
        select 1 from client_portals
        where gallery_password = ${customPassword!} and id <> ${portalId}
        limit 1
      `) as Array<{ '?column?': number }>;
      if (collision.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'That password is already in use. Try a different one.',
        });
      }
      newPassword = customPassword!;
    }

    // 3. Persist
    if (newPassword !== null && newEnabled !== null) {
      await sql`
        update client_portals
        set gallery_password = ${newPassword},
            gallery_enabled = ${newEnabled},
            updated_at = now()
        where id = ${portalId}
      `;
    } else if (newPassword !== null) {
      await sql`
        update client_portals
        set gallery_password = ${newPassword},
            updated_at = now()
        where id = ${portalId}
      `;
    } else if (newEnabled !== null) {
      await sql`
        update client_portals
        set gallery_enabled = ${newEnabled},
            updated_at = now()
        where id = ${portalId}
      `;
    }

    // 4. Return the now-current state
    const after = (await sql`
      select gallery_password, gallery_enabled
      from client_portals
      where id = ${portalId}
    `) as Array<{ gallery_password: string; gallery_enabled: boolean }>;

    return res.status(200).json({
      success: true,
      gallery_password: after[0].gallery_password,
      gallery_enabled: after[0].gallery_enabled,
    });
  } catch (err) {
    console.error('[portal/gallery-pass] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
