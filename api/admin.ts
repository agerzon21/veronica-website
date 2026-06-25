/**
 * Dispatcher for /api/admin/* routes.
 *
 * Same pattern as api/portal.ts — one function fans out to
 * underscore-prefixed handler files under ./admin/ to stay under
 * Vercel's Hobby-plan 12-function ceiling. The `vercel.json` rewrite
 * maps /api/admin/X → /api/admin?action=X.
 *
 * Routes:
 *   POST /api/admin/portals          → ./admin/_portals.ts          (list)
 *   POST /api/admin/portals-create   → ./admin/_portals-create.ts   (create + invite)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import portalsHandler from './admin/_portals.js';
import portalsCreateHandler from './admin/_portals-create.js';

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
