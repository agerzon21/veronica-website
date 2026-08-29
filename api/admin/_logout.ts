import type { VercelRequest, VercelResponse } from '@vercel/node';
import { destroyAdminSession } from '../_admin-auth.js';

/**
 * Admin: revoke the current session token.
 *
 * POST { password } → 200 { success: true }, always.
 *
 * Deliberately unauthenticated beyond possessing the token itself. Presenting a
 * token is the only thing needed to destroy it, and there is nothing to gain by
 * destroying a token you already hold. Guarding this behind requireAdmin would
 * mean an expired session could not be cleaned up.
 *
 * Always 200: whether the token existed is not worth telling the caller, and a
 * failed sign-out must never leave someone stuck on a screen they think is
 * still authenticated.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = typeof req.body?.password === 'string' ? req.body.password : '';
  if (/^[a-f0-9]{64}$/.test(token)) {
    try {
      await destroyAdminSession(token);
    } catch (err) {
      console.error('[admin/logout] revoke failed:', err);
    }
  }
  return res.status(200).json({ success: true });
}
