/**
 * Runs the Instagram long-lived token refresh, returns the new token.
 *
 * POST { password }
 *   → 200 { success, token, expiresInDays }
 *   → 401 on wrong password
 *   → 403 if password is admin-level (super required — this is the
 *         same as clearing gallery deletes, since it's a credential
 *         rotation)
 *   → 502 on Meta rejection (e.g. current token already expired,
 *         in which case a full re-mint via Meta's app dashboard is
 *         required — the admin UI surfaces that error explicitly)
 *   → 405 non-POST
 *
 * The refresh call resets the 60-day expiration clock; as long as we
 * fire this within the current 60-day window, the integration stays
 * alive forever. Once the returned token is pasted into Vercel and a
 * redeploy fires, the new token takes over.
 *
 * We do NOT auto-update Vercel here. The env var mutation path via
 * Vercel's API is multi-step and fragile (see the auto-refresh
 * discussion in scripts/refresh-instagram-token.mjs). The admin UI
 * flow is: click Refresh → we return the new token → user pastes
 * into Vercel → redeploy. 5 seconds, 100% reliable.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin, requireSuper } from '../_admin-auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, error: auth.error });
  }
  const superCheck = requireSuper(auth.level);
  if (!superCheck.ok) {
    return res.status(superCheck.status).json({ success: false, error: superCheck.error });
  }

  const currentToken = process.env.IG_ACCESS_TOKEN;
  if (!currentToken) {
    return res.status(500).json({
      success: false,
      error: 'IG_ACCESS_TOKEN env var is not set on the server.',
    });
  }

  try {
    const refreshRes = await fetch(
      `https://graph.instagram.com/refresh_access_token` +
        `?grant_type=ig_refresh_token` +
        `&access_token=${encodeURIComponent(currentToken)}`,
    );

    if (!refreshRes.ok) {
      const errBody = await refreshRes.text();
      console.error(
        `[admin/instagram-refresh] Meta refresh ${refreshRes.status}: ${errBody}`,
      );
      return res.status(502).json({
        success: false,
        error:
          'Meta rejected the refresh. Token may be past its 60-day window — a full re-mint via the Meta app dashboard is required.',
        meta: errBody,
      });
    }

    const { access_token, expires_in } = (await refreshRes.json()) as {
      access_token: string;
      expires_in: number;
    };

    return res.status(200).json({
      success: true,
      token: access_token,
      expiresInDays: Math.round(expires_in / 86400),
    });
  } catch (err) {
    console.error('[admin/instagram-refresh] fetch failed:', err);
    return res.status(500).json({ success: false, error: 'Meta API unreachable' });
  }
}
