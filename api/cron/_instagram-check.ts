/**
 * Daily cron: checks the Instagram token's remaining runway and emails
 * Alex a ready-to-paste new token when we're getting close to the
 * 60-day expiration.
 *
 * Sequence on each run:
 *   1. Ask Meta's debug_token for the current token's expires_at
 *   2. If daysUntilExpiry > WARN_WINDOW_DAYS → do nothing, exit 200
 *   3. If daysUntilExpiry ≤ WARN_WINDOW_DAYS → run the refresh, get
 *      new 60-day token, email it to Alex with paste-into-Vercel
 *      instructions
 *   4. If the refresh itself fails (usually because the token is
 *      already past its window), email Alex with the re-mint
 *      instructions so he knows the automatic path is dead
 *
 * We deliberately don't try to mutate Vercel's env vars ourselves —
 * that path is fragile and would need us to store a Vercel API token
 * on our side. 30 seconds of copy-paste on Alex's phone is fine.
 *
 * Runs daily (Vercel Hobby cron granularity) at 12:00 UTC — early
 * enough that a caught expiration lands in Alex's morning mailbox.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendEmail } from '../_auto-reply.js';

// Fire the warning email once daysUntilExpiry hits this number. 12
// gives us a comfortable buffer over the 60-day refresh window without
// spamming when the runway is still plenty.
const WARN_WINDOW_DAYS = 12;

const ALEX_EMAIL = process.env.ALEX_EMAIL ?? 'agerzon21@gmail.com';

// Direct link to the exact env var Alex needs to edit. The Vercel
// dashboard URL structure is stable; if it ever changes, this string
// is trivially updated. Env-configurable so we don't hard-code the
// project slug forever.
const VERCEL_ENV_LINK =
  process.env.VERCEL_ENV_VAR_LINK ??
  'https://vercel.com/agerzon21/veronica-website/settings/environment-variables';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const token = process.env.IG_ACCESS_TOKEN;
  const appId = process.env.IG_APP_ID;
  const appSecret = process.env.IG_APP_SECRET;

  if (!token) {
    // No token to check → probably a fresh env; email once so someone
    // notices, then exit.
    await notifyOfIssue(
      'Instagram token is missing',
      `IG_ACCESS_TOKEN env var is not set. The Instagram feed on the site will not work until this is populated. See scripts/refresh-instagram-token.mjs for the re-mint flow.`,
    );
    return res.status(200).json({ ok: true, action: 'notified-missing' });
  }

  // Step 1 — check current expiry. Requires app credentials for the
  // proper debug_token call. Falls back to "just try to refresh" if
  // app creds aren't set.
  let daysUntilExpiry: number | null = null;
  if (appId && appSecret) {
    daysUntilExpiry = await queryDaysUntilExpiry(token, appId, appSecret);
  }

  // Not close enough to worry yet → done.
  if (daysUntilExpiry !== null && daysUntilExpiry > WARN_WINDOW_DAYS) {
    return res.status(200).json({
      ok: true,
      action: 'no-op',
      daysUntilExpiry,
    });
  }

  // Step 2 — inside the warn window (or unknown expiry). Try the
  // refresh; email the new token on success, or the re-mint pointer
  // on failure.
  try {
    const refreshRes = await fetch(
      `https://graph.instagram.com/refresh_access_token` +
        `?grant_type=ig_refresh_token` +
        `&access_token=${encodeURIComponent(token)}`,
    );

    if (!refreshRes.ok) {
      const body = await refreshRes.text();
      await notifyOfIssue(
        'Instagram token refresh FAILED — manual re-mint required',
        `The daily refresh cron tried to renew the Instagram token but Meta rejected the call. This usually means the token is already past its 60-day window and can no longer be auto-refreshed.

Meta response (status ${refreshRes.status}):
${body}

To fix: open the Meta app dashboard (developers.facebook.com → vero-photography-feed → Instagram → Generate access tokens) and mint a fresh token, then paste it into Vercel:
${VERCEL_ENV_LINK}`,
      );
      return res
        .status(200)
        .json({ ok: false, action: 'refresh-failed', status: refreshRes.status });
    }

    const { access_token: newToken, expires_in } = (await refreshRes.json()) as {
      access_token: string;
      expires_in: number;
    };
    const newExpiryDays = Math.round(expires_in / 86400);

    await sendRotationEmail({
      newToken,
      newExpiryDays,
      currentDaysRemaining: daysUntilExpiry,
    });

    return res.status(200).json({
      ok: true,
      action: 'refreshed-and-emailed',
      newExpiryDays,
    });
  } catch (err) {
    console.error('[cron/instagram-check] refresh failed:', err);
    await notifyOfIssue(
      'Instagram token cron threw an error',
      `The daily refresh cron threw an unexpected error before it could complete:

${err instanceof Error ? err.stack ?? err.message : String(err)}

You may need to run scripts/refresh-instagram-token.mjs manually to be safe.`,
    );
    return res.status(500).json({ ok: false, action: 'threw' });
  }
}

async function queryDaysUntilExpiry(
  token: string,
  appId: string,
  appSecret: string,
): Promise<number | null> {
  try {
    const appAccessToken = `${appId}|${appSecret}`;
    const url =
      `https://graph.facebook.com/v21.0/debug_token` +
      `?input_token=${encodeURIComponent(token)}` +
      `&access_token=${encodeURIComponent(appAccessToken)}`;
    const debugRes = await fetch(url);
    if (!debugRes.ok) return null;
    const debugJson = (await debugRes.json()) as {
      data?: { is_valid: boolean; expires_at?: number };
    };
    if (!debugJson.data?.is_valid || !debugJson.data?.expires_at) return null;
    const msUntilExpiry = debugJson.data.expires_at * 1000 - Date.now();
    return Math.round(msUntilExpiry / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

interface RotationEmailArgs {
  newToken: string;
  newExpiryDays: number;
  currentDaysRemaining: number | null;
}

async function sendRotationEmail(args: RotationEmailArgs) {
  const { newToken, newExpiryDays, currentDaysRemaining } = args;
  const runwayLine =
    currentDaysRemaining !== null
      ? `The current token had ~${currentDaysRemaining} days left; we've refreshed it early so you have plenty of runway.`
      : `The current token was inside the warning window (${WARN_WINDOW_DAYS} days) so we refreshed it.`;

  const text = `Time to rotate the Instagram token.

${runwayLine}

The refreshed token is valid for ${newExpiryDays} days. Paste it into Vercel to activate:

  ${VERCEL_ENV_LINK}

Steps:
  1. Open the link above
  2. Edit IG_ACCESS_TOKEN, paste the new value below, save
  3. Trigger a redeploy (Deployments → ⋯ → Redeploy)

New token:
${newToken}
`;

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;">
  <div style="max-width:560px;margin:32px auto;background:#fff;padding:32px;border:1px solid #eaeaea;">
    <div style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#c9a96e;font-weight:500;margin-bottom:8px;">
      Vero Photography · Instagram Integration
    </div>
    <h1 style="font-size:22px;font-weight:300;margin:0 0 16px;color:#222;">Time to rotate the Instagram token</h1>
    <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 16px;">
      ${runwayLine}
    </p>
    <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 20px;">
      The refreshed token is valid for <strong>${newExpiryDays} days</strong>.
    </p>

    <div style="border-left:3px solid #c9a96e;padding:12px 16px;background:#fdf9f0;margin:0 0 20px;">
      <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8a6e35;font-weight:500;margin-bottom:6px;">
        New token
      </div>
      <code style="display:block;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:12px;color:#333;word-break:break-all;line-height:1.5;">${escapeHtml(
        newToken,
      )}</code>
    </div>

    <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 8px;font-weight:500;">Steps:</p>
    <ol style="font-size:14px;line-height:1.7;color:#444;margin:0 0 24px;padding-left:20px;">
      <li>Open Vercel env vars: <a href="${VERCEL_ENV_LINK}" style="color:#c9a96e;">${VERCEL_ENV_LINK}</a></li>
      <li>Edit <code style="background:#f4f4f4;padding:2px 6px;border-radius:2px;font-size:12px;">IG_ACCESS_TOKEN</code>, paste the token above, save</li>
      <li>Trigger a redeploy (Deployments → ⋯ → Redeploy)</li>
    </ol>

    <p style="font-size:12px;color:#999;line-height:1.5;margin:24px 0 0;border-top:1px solid #eee;padding-top:16px;">
      This email is sent automatically ~${WARN_WINDOW_DAYS} days before the Instagram token expires so you never
      have to remember. If you ever want to rotate manually before then, use the "Refresh Token" button in
      the Integrations tab of /admin.
    </p>
  </div>
</body>
</html>`;

  await sendEmail({
    to: ALEX_EMAIL,
    subject: '[Vero Admin] Rotate Instagram token',
    text,
    html,
  });
}

async function notifyOfIssue(subject: string, body: string) {
  try {
    await sendEmail({
      to: ALEX_EMAIL,
      subject: `[Vero Admin] ${subject}`,
      text: body,
      html: `<pre style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap;word-break:break-word;">${escapeHtml(
        body,
      )}</pre>`,
    });
  } catch (err) {
    console.error('[cron/instagram-check] failed to send notification email:', err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
