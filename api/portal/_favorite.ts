/**
 * Add or remove a photo from the client's favorites list.
 *
 * POST { email, password, photo_id, action: 'add' | 'remove' }
 *   → 200 { success, favorite_photo_ids: string[] }
 *   → 400 on bad payload
 *   → 401 on wrong email/password
 *   → 405 on non-POST
 *
 * Same re-auth pattern as the other mutating portal endpoints
 * (gallery-pass, sign-contract) — email + password verified against
 * `client_portals` on every call. No session token yet; when we add
 * one it'll replace this shape uniformly.
 *
 * Duplicate adds and missing-value removes both no-op cleanly via
 * array_append / array_remove on the Postgres side, so the client
 * doesn't need to know the current state before firing.
 *
 * Favorites are stored on the `client_portals.favorite_photo_ids`
 * TEXT[] column — Drive file IDs, one per hearted photo. Empty
 * array is the default state.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';

const WRONG_AUTH_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Action = 'add' | 'remove';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password =
    typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  const photoId = typeof req.body?.photo_id === 'string' ? req.body.photo_id.trim() : '';
  const action = req.body?.action as Action | undefined;

  if (!email || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Email and password required' });
  }
  if (!photoId) {
    return res.status(400).json({ success: false, error: 'photo_id required' });
  }
  if (action !== 'add' && action !== 'remove') {
    return res.status(400).json({ success: false, error: 'action must be add or remove' });
  }

  try {
    const sql = getDb();

    // Verify the client + fetch their id in one shot. Same shape as
    // /api/portal/client so behavior is consistent.
    const rows = (await sql`
      select id from client_portals
      where mode = 'full'
        and lower(client_email) = ${email}
        and client_password = ${password}
      limit 1
    `) as Array<{ id: string }>;

    if (rows.length === 0) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Incorrect email or password' });
    }

    const portalId = rows[0].id;

    // array_append + array_remove are dedupe-safe (append via array_cat
    // + filter to avoid duplicates; remove is a no-op if the value
    // isn't present). Wrapped in coalesce so a NULL column becomes an
    // empty array first.
    const updated =
      action === 'add'
        ? ((await sql`
            update client_portals
            set favorite_photo_ids = (
              select coalesce(
                array_agg(distinct x order by x),
                '{}'
              )
              from unnest(coalesce(favorite_photo_ids, '{}') || array[${photoId}]) as x
            ),
                updated_at = now()
            where id = ${portalId}
            returning favorite_photo_ids
          `) as Array<{ favorite_photo_ids: string[] }>)
        : ((await sql`
            update client_portals
            set favorite_photo_ids = array_remove(
              coalesce(favorite_photo_ids, '{}'),
              ${photoId}
            ),
                updated_at = now()
            where id = ${portalId}
            returning favorite_photo_ids
          `) as Array<{ favorite_photo_ids: string[] }>);

    return res.status(200).json({
      success: true,
      favorite_photo_ids: updated[0]?.favorite_photo_ids ?? [],
    });
  } catch (err) {
    console.error('[portal/favorite] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
