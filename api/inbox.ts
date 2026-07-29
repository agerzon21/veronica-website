/**
 * Dispatcher for /api/inbox/* routes — the receiving side of the
 * messaging feature. Third-party platforms (Meta / Instagram now,
 * WhatsApp / SMS later) POST message events here.
 *
 * Same "one dispatcher, many underscore-prefixed handlers" pattern as
 * /api/admin, /api/portal, /api/cron so we stay under Vercel Hobby's
 * 12 serverless-function ceiling.
 *
 * Auth: NOT gated at this dispatcher level. Each individual handler
 * validates its own inbound authenticity (webhook signature checks
 * against the platform's shared secret). Webhooks are called by
 * third parties (Meta), not by our users, so there's no session /
 * password to enforce here.
 *
 * Registered handlers:
 *   GET/POST /api/inbox/ig-webhook → ./inbox/_ig-webhook.ts
 *                                    Instagram DM webhook receiver.
 *                                    GET  handles the one-time
 *                                    subscription handshake; POST
 *                                    handles ongoing message events.
 *
 * The `vercel.json` rewrite maps /api/inbox/X → /api/inbox?action=X
 * to keep the URL structure clean for platform dashboards.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import igWebhookHandler from './inbox/_ig-webhook.js';

const HANDLERS: Record<
  string,
  (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown
> = {
  'ig-webhook': igWebhookHandler,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  if (!action || !HANDLERS[action]) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  return HANDLERS[action](req, res);
}
