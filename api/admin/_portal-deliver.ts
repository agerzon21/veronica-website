/**
 * Admin: mark a portal as delivered. Starts the gallery retention
 * countdown and (for full-mode portals with an email) sends the
 * "your photos are ready" email.
 *
 * POST { password, id, retention_months? (defaults to template's retention_months, then 3) }
 *   → 200 { success, gallery_delivered_at, gallery_expires_at }
 *   → 400 if portal has no drive_url yet
 *   → 401 on bad admin password
 *   → 404 if portal not found
 *
 * Pre-conditions:
 *   - drive_url must be set (delivery without a gallery doesn't make sense)
 *   - For full-mode, contract should be signed (warn but don't block —
 *     edge case where Vero delivers before signing for trusted clients).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { sendEmail } from '../_auto-reply.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!id) return res.status(400).json({ success: false, error: 'id required' });

  const reqRetention = Number(req.body?.retention_months);
  const retentionMonths = Number.isFinite(reqRetention) && reqRetention > 0 ? reqRetention : 3;

  try {
    const sql = getDb();
    const rows = (await sql`
      select id, mode, client_display_name, client_email, drive_url, gallery_password, gallery_delivered_at
      from client_portals
      where id = ${id}
      limit 1
    `) as Array<{
      id: string;
      mode: 'simple' | 'full';
      client_display_name: string | null;
      client_email: string | null;
      drive_url: string | null;
      gallery_password: string;
      gallery_delivered_at: string | null;
    }>;

    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Portal not found' });
    const portal = rows[0];
    if (!portal.drive_url) {
      return res.status(400).json({ success: false, error: 'Cannot deliver: paste a Drive folder URL first.' });
    }

    const deliveredAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + retentionMonths * 30 * 24 * 60 * 60 * 1000).toISOString();

    await sql`
      update client_portals
      set gallery_delivered_at = ${deliveredAt},
          gallery_expires_at = ${expiresAt},
          gallery_enabled = true,
          updated_at = now()
      where id = ${id}
    `;

    // Email the client if we have an address. Full-mode clients go to
    // /portal (email + password login they set up at welcome time);
    // simple-mode clients go to /portal/pass (password-only), so we
    // also surface the password in their email. We don't fail the
    // request if the email send fails — the gallery IS delivered in
    // the DB, the email is the notification on top.
    if (portal.client_email) {
      try {
        const siteOrigin =
          process.env.SITE_ORIGIN ||
          (req.headers.host ? `https://${req.headers.host}` : 'https://vero.photography');
        await sendEmail({
          to: portal.client_email,
          subject: 'Your photos are ready — Vero Photography',
          text:
            portal.mode === 'full'
              ? buildFullDeliveryText(portal.client_display_name, expiresAt, siteOrigin)
              : buildSimpleDeliveryText(portal.client_display_name, expiresAt, siteOrigin, portal.gallery_password),
          html:
            portal.mode === 'full'
              ? buildFullDeliveryHtml(portal.client_display_name, expiresAt, siteOrigin)
              : buildSimpleDeliveryHtml(portal.client_display_name, expiresAt, siteOrigin, portal.gallery_password),
        });
      } catch (err) {
        console.error('[admin/portal-deliver] photos-ready email failed:', err);
      }
    }

    return res.status(200).json({
      success: true,
      gallery_delivered_at: deliveredAt,
      gallery_expires_at: expiresAt,
    });
  } catch (err) {
    console.error('[admin/portal-deliver] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

function buildFullDeliveryText(clientLabel: string | null, expiresAt: string, siteOrigin: string): string {
  const greeting = clientLabel ? `Hi ${clientLabel.split(/[&,]/)[0].trim()},` : 'Hi there,';
  const exp = new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `${greeting}

Your photos are ready. You can view and download them at:

${siteOrigin}/portal

The gallery will stay online until ${exp}. Please download and back up your favourites before then.

If you have any questions or want to order prints, just reply to this email.

Warmly,
Veronika`;
}

function buildFullDeliveryHtml(clientLabel: string | null, expiresAt: string, siteOrigin: string): string {
  const firstName = clientLabel ? clientLabel.split(/[&,]/)[0].trim() : 'there';
  const exp = new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${firstName},</p>
<p>Your photos are ready ✨ View them anytime in your portal:</p>
<p style="margin:24px 0;"><a href="${siteOrigin}/portal" style="display:inline-block;padding:14px 28px;background:#c9a96e;color:#fff;text-decoration:none;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-size:13px;">Open My Gallery</a></p>
<p style="font-size:14px;color:#666;">The gallery will stay online until <strong>${exp}</strong>. Please download and back up your favourites before then.</p>
<p>If you have any questions or want to order prints, just reply to this email.</p>
<p>Warmly,<br><em>Veronika</em></p>
</body></html>`;
}

function buildSimpleDeliveryText(
  clientLabel: string | null,
  expiresAt: string,
  siteOrigin: string,
  galleryPassword: string,
): string {
  const greeting = clientLabel ? `Hi ${clientLabel.split(/[&,]/)[0].trim()},` : 'Hi there,';
  const exp = new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `${greeting}

Your photos are ready ✨

View your gallery here:
${siteOrigin}/portal/pass

Password: ${galleryPassword}

The gallery will stay online until ${exp}. Please download and back up your favourites before then.

If you have any questions or want to order prints, just reply to this email.

Warmly,
Veronika`;
}

function buildSimpleDeliveryHtml(
  clientLabel: string | null,
  expiresAt: string,
  siteOrigin: string,
  galleryPassword: string,
): string {
  const firstName = clientLabel ? clientLabel.split(/[&,]/)[0].trim() : 'there';
  const exp = new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${firstName},</p>
<p>Your photos are ready ✨</p>
<p style="margin:24px 0;"><a href="${siteOrigin}/portal/pass" style="display:inline-block;padding:14px 28px;background:#c9a96e;color:#fff;text-decoration:none;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-size:13px;">Open my gallery</a></p>
<p style="font-size:14px;color:#666;">Password: <strong style="color:#2d2d2d;font-family:monospace;">${galleryPassword}</strong></p>
<p style="font-size:14px;color:#666;">The gallery will stay online until <strong>${exp}</strong>. Please download and back up your favourites before then.</p>
<p>If you have any questions or want to order prints, just reply to this email.</p>
<p>Warmly,<br><em>Veronika</em></p>
</body></html>`;
}
