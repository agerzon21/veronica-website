/**
 * Admin: manually kick the gallery-sync cron. Same handler the
 * schedule runs — this endpoint just gives admins a "sync now"
 * button in the UI instead of waiting up to an hour for the next
 * scheduled tick.
 *
 * POST { password }
 *   → 200 { success, ...sync result }
 *   → 401 wrong password
 *   → 500 sync failed (the sync handler surfaces its own errors)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';
import gallerySync from '../cron/_gallery-sync.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  // Delegate straight to the cron handler. It does its own res.json
  // reply, so we're done after this call.
  //
  // Inject ?trigger=manual so the guard writes a cron_runs row with
  // trigger='manual' — otherwise this in-app sync would masquerade
  // as a scheduled Vercel Cron run in the history.
  req.query = { ...req.query, trigger: 'manual' };
  return gallerySync(req, res);
}
