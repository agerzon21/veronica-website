/**
 * Admin: the payment problems the system could not handle on its own, and
 * marking one resolved once a person has dealt with it.
 *
 * POST { password }                → 200 { success, issues[] }
 * POST { password, resolve: key }  → 200 { success, issues[] }   (that one removed)
 *
 * The list is written by api/_payment-alerts.ts, from the Stripe webhook, the
 * daily reconciliation against Stripe, and the checkout return path. Each one
 * was also emailed when it first appeared; this is where it stays visible
 * until somebody says it is handled.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';
import { openPaymentIssues, clearPaymentIssues } from '../_payment-alerts.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const resolve = typeof req.body?.resolve === 'string' ? req.body.resolve.trim() : '';
  if (resolve) await clearPaymentIssues([resolve]);
  return res.status(200).json({ success: true, issues: await openPaymentIssues() });
}
