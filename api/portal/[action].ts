/**
 * Dispatcher for /api/portal/* routes.
 *
 * Vercel's Hobby plan caps serverless functions at 12. To stay under
 * that, all portal endpoints share this one function and route on the
 * `action` query param (which the catch-all `[action].ts` filename
 * populates from the last URL segment).
 *
 * The actual handlers live in _-prefixed sibling files — those don't
 * get deployed as standalone functions but ARE bundled with this one
 * at build time when imported.
 *
 * Routes:
 *   POST /api/portal/client             → _client.ts
 *   POST /api/portal/gallery            → _gallery.ts
 *   POST /api/portal/gallery-pass       → _gallery-pass.ts
 *   POST /api/portal/sign-contract      → _sign-contract.ts
 *   POST /api/portal/download-contract  → _download-contract.ts
 *   POST /api/portal/welcome            → _welcome.ts
 *   POST /api/portal/welcome-complete   → _welcome-complete.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import clientHandler from './_client.js';
import galleryHandler from './_gallery.js';
import galleryPassHandler from './_gallery-pass.js';
import signContractHandler from './_sign-contract.js';
import downloadContractHandler from './_download-contract.js';
import welcomeHandler from './_welcome.js';
import welcomeCompleteHandler from './_welcome-complete.js';

const HANDLERS: Record<
  string,
  (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown
> = {
  client: clientHandler,
  gallery: galleryHandler,
  'gallery-pass': galleryPassHandler,
  'sign-contract': signContractHandler,
  'download-contract': downloadContractHandler,
  welcome: welcomeHandler,
  'welcome-complete': welcomeCompleteHandler,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  if (!action || !HANDLERS[action]) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  return HANDLERS[action](req, res);
}
