/**
 * Dispatcher for /api/cron/* routes — hit by Vercel Cron on a schedule.
 *
 * Same "one dispatcher, many underscore-prefixed handlers" pattern as
 * /api/admin and /api/portal, so we stay under Vercel Hobby's 12
 * serverless-function ceiling as we add more scheduled jobs.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on every
 * invocation. We require CRON_SECRET to be set + the header to match; any
 * curious internet caller hitting these URLs directly gets a 401. See
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 *
 * Registered jobs:
 *   GET  /api/cron/instagram-check → ./cron/_instagram-check.ts
 *                                    (daily; emails Alex if IG token has
 *                                    ≤10 days of runway left)
 *   GET  /api/cron/gallery-sync    → ./cron/_gallery-sync.ts
 *                                    (daily at 2am UTC; reconciles
 *                                    gallery_photos against the Drive
 *                                    Gallery folder — new photos get
 *                                    AI-drafted metadata, removed ones
 *                                    soft-deleted. Vercel Hobby caps
 *                                    crons at once-per-day; admin can
 *                                    also hit /api/admin/gallery-sync-now
 *                                    for immediate sync any time.)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import instagramCheckHandler from './cron/_instagram-check.js';
import gallerySyncHandler from './cron/_gallery-sync.js';
import igAvatarRefreshHandler, { CRON_META as IG_AVATAR_META } from './cron/_ig-avatar-refresh.js';

// Exported so the admin "Run now" endpoint (api/admin/_crons-run-now.ts)
// can look a handler up by name and invoke it in-process, instead of
// firing off a self-fetch that would need to know the deployment URL
// and CRON_SECRET separately. Same source of truth either way.
export const HANDLERS: Record<
  string,
  (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown
> = {
  'instagram-check': instagramCheckHandler,
  'gallery-sync': gallerySyncHandler,
  // No vercel.json cron entry — both Hobby slots are taken. This is chained
  // from instagram-check (which already runs daily and already talks to the
  // Graph API) and is invocable from the admin "Run now" button, which goes
  // through this same HANDLERS map.
  'ig-avatar-refresh': igAvatarRefreshHandler,
};

/**
 * Metadata for jobs that have NO vercel.json cron entry.
 *
 * The admin Crons list reads cron_jobs rows, and the only thing that creates a
 * row is runGuarded — which runs when the job runs. For a scheduled job that is
 * fine: Vercel invokes it and it appears. For a job with no schedule entry it is
 * a deadlock — it cannot appear until it runs, and it can only be run from the
 * list it cannot appear in. ig-avatar-refresh hit exactly that and was invisible
 * in the panel despite being registered and working.
 *
 * _crons-list.ts seeds from this so any such job shows up immediately, with its
 * real enable toggle, Run-now button and run history.
 */
export const UNSCHEDULED_CRON_META = [IG_AVATAR_META] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron] CRON_SECRET env var is missing — refusing to run');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization ?? '';
  if (authHeader !== `Bearer ${expected}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const raw = req.query.job;
  const job = Array.isArray(raw) ? raw[0] : raw;
  if (!job || !HANDLERS[job]) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  return HANDLERS[job](req, res);
}
