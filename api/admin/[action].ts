/**
 * Dispatcher for /api/admin/* routes.
 *
 * Same pattern as api/portal/[action].ts — one function fans out to
 * underscore-prefixed handler files to stay under Vercel's Hobby-plan
 * 12-function ceiling.
 *
 * Routes:
 *   POST /api/admin/portals          → _portals.ts          (list)
 *   POST /api/admin/portals-create   → _portals-create.ts   (create + invite)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import portalsHandler from './_portals.js';
import portalsCreateHandler from './_portals-create.js';

const HANDLERS: Record<
  string,
  (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown
> = {
  portals: portalsHandler,
  'portals-create': portalsCreateHandler,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  if (!action || !HANDLERS[action]) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  return HANDLERS[action](req, res);
}
