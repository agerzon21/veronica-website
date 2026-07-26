/**
 * Reports on the current IG_ACCESS_TOKEN — is it valid, when does it
 * expire, how many days until expiry. Powers the "Instagram" card in
 * the admin Integrations tab.
 *
 * POST { password }
 *   → 200 { success, status: 'valid'|'expiring'|'expired'|'invalid'|'missing',
 *           expiresAt, daysUntilExpiry, appId, userId }
 *   → 401 on wrong password
 *   → 405 non-POST
 *
 * `status` maps to badge colors in the UI:
 *   valid    → green   (>14 days remaining)
 *   expiring → amber   (3–14 days remaining)
 *   expired  → red     (past expiry, or Meta rejected the token)
 *   invalid  → red     (Meta rejected for a non-expiry reason)
 *   missing  → red     (env var not set at all)
 *
 * Uses Meta's Graph API debug_token endpoint — same one Facebook devs
 * use to introspect their own tokens. Requires an app-access-token to
 * call, which is just `{app_id}|{app_secret}` concatenated. Read-only
 * against Meta's side.
 *
 * Accepts any admin level (admin OR super) — read-only visibility, no
 * mutation. The Refresh action (which DOES mutate the token) is
 * separately gated on super in _instagram-refresh.ts.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';

const EXPIRING_THRESHOLD_DAYS = 14;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, error: auth.error });
  }

  const token = process.env.IG_ACCESS_TOKEN;
  const appId = process.env.IG_APP_ID;
  const appSecret = process.env.IG_APP_SECRET;
  const userId = process.env.IG_USER_ID;

  if (!token) {
    return res.status(200).json({
      success: true,
      status: 'missing',
      expiresAt: null,
      daysUntilExpiry: null,
      appId: appId ?? null,
      userId: userId ?? null,
      message: 'IG_ACCESS_TOKEN env var is not set.',
    });
  }

  // The debug_token endpoint needs an app-access-token to call. That's
  // literally {app_id}|{app_secret} — Meta's shortcut for endpoints
  // that need to be called on behalf of the app itself, not a user.
  //
  // If we don't have the app credentials, we fall back to a lighter
  // "does the token work at all" check by hitting a benign endpoint.
  // Won't give us expiry, but confirms the token is alive.
  if (!appId || !appSecret) {
    return await fallbackTokenCheck(token, res, appId, userId);
  }

  const appAccessToken = `${appId}|${appSecret}`;
  const url =
    `https://graph.facebook.com/v21.0/debug_token` +
    `?input_token=${encodeURIComponent(token)}` +
    `&access_token=${encodeURIComponent(appAccessToken)}`;

  try {
    const debugRes = await fetch(url);
    const debugJson = (await debugRes.json()) as {
      data?: {
        is_valid: boolean;
        expires_at?: number;
        data_access_expires_at?: number;
        error?: { message: string; code: number };
      };
    };

    if (!debugRes.ok || !debugJson.data) {
      console.error('[admin/instagram-status] debug_token failed:', debugJson);
      return res.status(200).json({
        success: true,
        status: 'invalid',
        expiresAt: null,
        daysUntilExpiry: null,
        appId,
        userId: userId ?? null,
        message: 'Meta rejected the token check.',
      });
    }

    const data = debugJson.data;
    if (!data.is_valid) {
      return res.status(200).json({
        success: true,
        status: 'expired',
        expiresAt: null,
        daysUntilExpiry: null,
        appId,
        userId: userId ?? null,
        message: data.error?.message || 'Token is no longer valid.',
      });
    }

    // expires_at is a unix-seconds timestamp; 0 (or missing) means the
    // token never expires. Long-lived Instagram tokens always have a
    // non-zero value here — the 60-day thing.
    const expiresAtUnix = data.expires_at;
    if (!expiresAtUnix) {
      return res.status(200).json({
        success: true,
        status: 'valid',
        expiresAt: null,
        daysUntilExpiry: null,
        appId,
        userId: userId ?? null,
        message: 'Token is valid (no expiration).',
      });
    }

    const expiresAt = new Date(expiresAtUnix * 1000);
    const msUntilExpiry = expiresAt.getTime() - Date.now();
    const daysUntilExpiry = Math.round(msUntilExpiry / (1000 * 60 * 60 * 24));

    let status: 'valid' | 'expiring' | 'expired';
    if (daysUntilExpiry <= 0) {
      status = 'expired';
    } else if (daysUntilExpiry <= EXPIRING_THRESHOLD_DAYS) {
      status = 'expiring';
    } else {
      status = 'valid';
    }

    return res.status(200).json({
      success: true,
      status,
      expiresAt: expiresAt.toISOString(),
      daysUntilExpiry,
      appId,
      userId: userId ?? null,
    });
  } catch (err) {
    console.error('[admin/instagram-status] fetch failed:', err);
    return res.status(500).json({ success: false, error: 'Meta API unreachable' });
  }
}

/**
 * When IG_APP_ID / IG_APP_SECRET aren't set, fall back to a token-alive
 * probe: hit a trivial Graph API endpoint with the token. Gives us
 * valid/invalid but not expiry. Prompts the user to set app creds for
 * the full experience.
 */
async function fallbackTokenCheck(
  token: string,
  res: VercelResponse,
  appId: string | undefined,
  userId: string | undefined,
) {
  try {
    const probe = await fetch(
      `https://graph.instagram.com/me?fields=id&access_token=${encodeURIComponent(token)}`,
    );
    const ok = probe.ok;
    return res.status(200).json({
      success: true,
      status: ok ? 'valid' : 'expired',
      expiresAt: null,
      daysUntilExpiry: null,
      appId: appId ?? null,
      userId: userId ?? null,
      message: ok
        ? 'Token is alive. Set IG_APP_ID + IG_APP_SECRET env vars to see expiry countdown.'
        : 'Token appears rejected by Meta.',
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Meta API unreachable' });
  }
}
