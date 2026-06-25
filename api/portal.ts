/**
 * Dispatcher for /api/portal/* routes.
 *
 * Vercel's Hobby plan caps serverless functions at 12. To stay under
 * that, all portal endpoints share this one function and route on the
 * `action` query param. The `vercel.json` rewrite maps the last URL
 * segment into ?action=... so client code can still hit clean URLs.
 *
 * The actual handlers live in _-prefixed sibling files under ./portal/
 * — those don't get deployed as standalone functions but ARE bundled
 * with this one at build time when imported.
 *
 * Routes (the rewrite handles all of these):
 *   POST /api/portal/client             → ./portal/_client.ts
 *   POST /api/portal/gallery            → ./portal/_gallery.ts
 *   POST /api/portal/gallery-pass       → ./portal/_gallery-pass.ts
 *   POST /api/portal/sign-contract      → ./portal/_sign-contract.ts
 *   POST /api/portal/download-contract  → ./portal/_download-contract.ts
 *   POST /api/portal/welcome            → ./portal/_welcome.ts
 *   POST /api/portal/welcome-complete   → ./portal/_welcome-complete.ts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import clientHandler from './portal/_client.js';
import galleryHandler from './portal/_gallery.js';
import galleryPassHandler from './portal/_gallery-pass.js';
import signContractHandler from './portal/_sign-contract.js';
import downloadContractHandler from './portal/_download-contract.js';
import welcomeHandler from './portal/_welcome.js';
import welcomeCompleteHandler from './portal/_welcome-complete.js';
import shareGalleryHandler from './portal/_share-gallery.js';

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
  'share-gallery': shareGalleryHandler,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  if (!action || !HANDLERS[action]) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  return HANDLERS[action](req, res);
}
