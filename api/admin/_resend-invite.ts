/**
 * Admin: regenerate the setup token and email a fresh invite to the
 * client. Used when the original email got lost / went to spam / the
 * token expired.
 *
 * POST { password, id }
 *   → 200 { success }
 *   → 401 on bad admin password
 *   → 404 if portal not found
 *   → 409 if portal is not full-mode (no invite makes sense)
 *   → 409 if client already finished onboarding (has password)
 *
 * Why we block resending once they've finished setup: at that point
 * they don't need an invite, they need a password reset, which is a
 * separate path (admin can override the password via portal-update).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { sendEmail } from '../_auto-reply.js';

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

type Row = {
  id: string;
  mode: 'simple' | 'full';
  client_display_name: string | null;
  client_email: string | null;
  client_password: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!id) return res.status(400).json({ success: false, error: 'id required' });

  try {
    const sql = getDb();
    const rows = (await sql`
      select id, mode, client_display_name, client_email, client_password
      from client_portals where id = ${id} limit 1
    `) as Row[];
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Portal not found' });
    const portal = rows[0];
    if (portal.mode !== 'full' || !portal.client_email) {
      return res.status(409).json({ success: false, error: 'This portal does not use the invite flow.' });
    }
    if (portal.client_password) {
      return res.status(409).json({
        success: false,
        error: 'Client has already set a password. Use the password-override option instead.',
      });
    }

    const newToken = generateToken();
    const newExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await sql`
      update client_portals
      set setup_token = ${newToken},
          setup_token_expires_at = ${newExpiry},
          updated_at = now()
      where id = ${id}
    `;

    try {
      const siteOrigin =
        process.env.SITE_ORIGIN ||
        (req.headers.host ? `https://${req.headers.host}` : 'https://vero.photography');
      const inviteUrl = `${siteOrigin}/portal/welcome?token=${newToken}`;
      await sendEmail({
        to: portal.client_email,
        subject: 'Your client portal is ready — Vero Photography',
        text: buildInviteText(portal.client_display_name, inviteUrl),
        html: buildInviteHtml(portal.client_display_name, inviteUrl),
      });
    } catch (err) {
      console.error('[admin/resend-invite] email send failed:', err);
      return res.status(500).json({ success: false, error: 'Token was regenerated, but the email failed to send. Try again.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/resend-invite] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

function buildInviteText(clientLabel: string | null, inviteUrl: string): string {
  const greeting = clientLabel ? `Hi ${clientLabel.split(/[&,]/)[0].trim()},` : 'Hi there,';
  return `${greeting}

Your client portal with Vero Photography is ready. Click the link below to confirm your booking details and pick a password:

${inviteUrl}

This link is valid for 14 days.

Inside, you'll be able to review and sign your contract, track your balance, and (once it's ready) view your photo gallery.

Looking forward to working with you,
Veronika`;
}

function buildInviteHtml(clientLabel: string | null, inviteUrl: string): string {
  const firstName = clientLabel ? clientLabel.split(/[&,]/)[0].trim() : 'there';
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${firstName},</p>
<p>Your client portal is ready. Click below to confirm your booking details and pick a password:</p>
<p style="margin:24px 0;"><a href="${inviteUrl}" style="display:inline-block;padding:14px 28px;background:#c9a96e;color:#fff;text-decoration:none;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-size:13px;">Set up your portal</a></p>
<p style="font-size:14px;color:#666;">This link is valid for 14 days. If the button doesn't work, paste this URL into your browser:<br><span style="word-break:break-all;color:#c9a96e;">${inviteUrl}</span></p>
<p>Inside you'll be able to review and sign your contract, track your balance, and (once it's ready) view your photo gallery.</p>
<p>Looking forward to working with you,<br><em>Veronika</em></p>
</body></html>`;
}
