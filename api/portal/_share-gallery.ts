/**
 * Send a "you've been invited" gallery link to a third-party email.
 *
 * POST { email, password, target_email }
 *   email + password → re-auth the client (same pattern as the other
 *                      mutating portal endpoints).
 *   target_email     → who to send the invite to.
 *
 *   → 200 { success, remaining_today }
 *   → 401 on bad client credentials
 *   → 400 on bad target email
 *   → 429 if the portal has hit its daily invite limit (5/day)
 *
 * Why the rate limit: clients can paste in any email, and we don't want
 * a careless user to accidentally turn this into a list-blast tool. 5
 * invites per portal per 24h covers the realistic "share with mom +
 * sister + best friend" use case without becoming abusable. Sender
 * reputation matters more than convenience.
 *
 * The invite email tells the recipient WHO invited them (the client's
 * display name) so it doesn't look like cold spam.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { sendEmail } from '../_auto-reply.js';

const INVITE_LIMIT_PER_24H = 5;
const WRONG_AUTH_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type PortalRow = {
  id: string;
  client_display_name: string | null;
  gallery_password: string;
  gallery_enabled: boolean;
  gallery_expires_at: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Two auth modes:
  //   - email + password (full-portal client sharing their own gallery)
  //   - gallery_password only (someone using /portal/pass — they don't
  //     have an account, they just have the password)
  // Either way, the rate limit is per-portal so abuse is bounded
  // regardless of how widely the password gets shared.
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  const galleryPassword =
    typeof req.body?.gallery_password === 'string' ? req.body.gallery_password.trim() : '';
  const targetEmail = typeof req.body?.target_email === 'string' ? req.body.target_email.trim().toLowerCase() : '';

  if (!(email && password) && !galleryPassword) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
  }

  try {
    const sql = getDb();
    const rows = galleryPassword
      ? ((await sql`
          select id, client_display_name, gallery_password, gallery_enabled, gallery_expires_at
          from client_portals
          where gallery_password = ${galleryPassword}
          limit 1
        `) as PortalRow[])
      : ((await sql`
          select id, client_display_name, gallery_password, gallery_enabled, gallery_expires_at
          from client_portals
          where mode = 'full'
            and lower(client_email) = ${email}
            and client_password = ${password}
          limit 1
        `) as PortalRow[]);

    if (rows.length === 0) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return res.status(401).json({
        success: false,
        error: galleryPassword ? 'Gallery password is incorrect' : 'Incorrect email or password',
      });
    }
    const portal = rows[0];

    if (!portal.gallery_enabled) {
      return res.status(409).json({
        success: false,
        error: 'Your gallery pass is currently disabled. Re-enable it to share.',
      });
    }

    // Count how many invites this portal has sent in the past 24h.
    const sentRows = (await sql`
      select count(*) as count
      from gallery_invites
      where client_portal_id = ${portal.id}
        and sent_at > now() - interval '24 hours'
    `) as Array<{ count: string }>;
    const sentToday = parseInt(sentRows[0]?.count ?? '0', 10);
    if (sentToday >= INVITE_LIMIT_PER_24H) {
      return res.status(429).json({
        success: false,
        error: `You've reached the limit of ${INVITE_LIMIT_PER_24H} invites in a 24-hour window. Try again later or share the link directly.`,
      });
    }

    const siteOrigin =
      process.env.SITE_ORIGIN ||
      (req.headers.host ? `https://${req.headers.host}` : 'https://vero.photography');

    try {
      await sendEmail({
        to: targetEmail,
        subject: `${portal.client_display_name ?? 'A friend'} shared a photo gallery with you`,
        text: buildInviteText(portal.client_display_name, siteOrigin, portal.gallery_password, portal.gallery_expires_at),
        html: buildInviteHtml(portal.client_display_name, siteOrigin, portal.gallery_password, portal.gallery_expires_at),
      });
    } catch (err) {
      console.error('[portal/share-gallery] email send failed:', err);
      return res.status(500).json({ success: false, error: 'Could not send the invite. Please try again.' });
    }

    await sql`
      insert into gallery_invites (client_portal_id, target_email)
      values (${portal.id}, ${targetEmail})
    `;

    return res.status(200).json({
      success: true,
      remaining_today: Math.max(INVITE_LIMIT_PER_24H - sentToday - 1, 0),
    });
  } catch (err) {
    console.error('[portal/share-gallery] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

function buildInviteText(
  fromLabel: string | null,
  siteOrigin: string,
  galleryPassword: string,
  expiresAt: string | null,
): string {
  const from = fromLabel ?? 'A friend';
  const directUrl = `${siteOrigin}/portal/pass?password=${encodeURIComponent(galleryPassword)}`;
  const exp = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  return `Hi there,

${from} has shared their photo gallery from Vero Photography with you.

Open the gallery (one-click access):
${directUrl}

If that link doesn't work, you can also go to ${siteOrigin}/portal/pass and enter:
Password: ${galleryPassword}
${exp ? `\nThe gallery will stay online until ${exp}.\n` : ''}
Vero Photography
${siteOrigin}`;
}

function buildInviteHtml(
  fromLabel: string | null,
  siteOrigin: string,
  galleryPassword: string,
  expiresAt: string | null,
): string {
  const from = fromLabel ?? 'A friend';
  const directUrl = `${siteOrigin}/portal/pass?password=${encodeURIComponent(galleryPassword)}`;
  const exp = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi there,</p>
<p><strong>${from}</strong> has shared their photo gallery from Vero Photography with you.</p>
<p style="margin:24px 0;"><a href="${directUrl}" style="display:inline-block;padding:14px 28px;background:#c9a96e;color:#fff;text-decoration:none;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-size:13px;">Open the gallery</a></p>
<p style="font-size:13px;color:#888;margin-top:-8px;">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all;color:#c9a96e;font-family:monospace;font-size:12px;">${directUrl}</span></p>
<p style="font-size:13px;color:#888;">Or, go to <a href="${siteOrigin}/portal/pass" style="color:#c9a96e">${siteOrigin}/portal/pass</a> and enter:<br>Password: <strong style="color:#2d2d2d;font-family:monospace;">${galleryPassword}</strong></p>
${exp ? `<p style="font-size:14px;color:#666;">The gallery will stay online until <strong>${exp}</strong>.</p>` : ''}
<p style="font-size:12px;color:#999;margin-top:32px;">Sent on behalf of ${from} via Vero Photography.</p>
</body></html>`;
}
