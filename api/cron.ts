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
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import instagramCheckHandler from './cron/_instagram-check.js';

const HANDLERS: Record<
  string,
  (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown
> = {
  'instagram-check': instagramCheckHandler,
};

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
