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
 *   GET/POST /api/inbox/ig-webhook    → ./inbox/_ig-webhook.ts
 *                                       Instagram DM webhook receiver.
 *                                       GET  handles the one-time
 *                                       subscription handshake; POST
 *                                       handles ongoing message events.
 *   POST     /api/inbox/email-webhook → ./inbox/_email-webhook.ts
 *                                       Resend Inbound webhook receiver.
 *                                       Parses inbound emails and threads
 *                                       them into email conversations in
 *                                       the same admin inbox as IG DMs.
 *
 * The `vercel.json` rewrite maps /api/inbox/X → /api/inbox?action=X
 * to keep the URL structure clean for platform dashboards.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import igWebhookHandler from './inbox/_ig-webhook.js';
import emailWebhookHandler from './inbox/_email-webhook.js';

const HANDLERS: Record<
  string,
  (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown
> = {
  'ig-webhook': igWebhookHandler,
  'email-webhook': emailWebhookHandler,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  if (!action || !HANDLERS[action]) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  return HANDLERS[action](req, res);
}

/**
 * Vercel only reads `export const config` from the TOP-LEVEL function
 * file (this one), not from imported handler modules. The IG webhook
 * and the email webhook both need `bodyParser: false` for raw-body
 * signature verification (X-Hub-Signature-256 on IG, Svix on Resend).
 * Declaring it here applies it to every route dispatched under
 * /api/inbox/*. The individual handler files also declare the same
 * export as documentation — those declarations are inert at runtime
 * but useful for readers who navigate to the handler directly.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};
