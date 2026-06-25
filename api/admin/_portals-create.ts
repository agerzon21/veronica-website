/**
 * Admin: create a new client portal.
 *
 * POST {
 *   password,                      // admin password
 *   mode: 'simple' | 'full',
 *   session_type: string,          // e.g. "wedding", "portrait", "family"
 *
 *   // 'full' mode only — required for the contract + portal flow:
 *   client_display_name: string,   // e.g. "Chrisann & Rajiv"
 *   client_email: string,
 *   partner_1_first_name?: string,
 *   partner_2_first_name?: string,
 *   event_date: string (YYYY-MM-DD),
 *   contract_template_key: string, // key from CONTRACT_TEMPLATES (e.g. 'wedding')
 *   variables: Record<string, string>, // wedding template variables
 *   contract_total_amount: number,
 *   contract_retainer_amount: number,
 *
 *   // both modes:
 *   gallery_password: string,      // unique
 * }
 *
 *   → 200 { success, portal_id, setup_token }  invite email is sent to client_email
 *   → 401 on bad admin password
 *   → 409 if gallery_password collides
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { sendEmail } from '../_auto-reply.js';
import {
  CONTRACT_TEMPLATES,
  fillTemplate,
  pruneEmptyOptionalSections,
} from '../../src/data/contract-template.js';

function generateToken(): string {
  // 32 bytes → 64 hex chars. Plenty of entropy for a single-use setup link.
  return randomBytes(32).toString('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const body = req.body ?? {};
  const mode = body.mode === 'simple' ? 'simple' : 'full';
  const sessionType = typeof body.session_type === 'string' ? body.session_type.trim() : '';
  const galleryPassword = typeof body.gallery_password === 'string' ? body.gallery_password.trim() : '';

  if (!sessionType) {
    return res.status(400).json({ success: false, error: 'session_type is required' });
  }
  if (!galleryPassword) {
    return res.status(400).json({ success: false, error: 'gallery_password is required' });
  }

  // Mode-specific validation
  let clientDisplayName: string | null = null;
  let clientEmail: string | null = null;
  let partner1: string | null = null;
  let partner2: string | null = null;
  let eventDate: string | null = null;
  let templateKey: string | null = null;
  let totalAmount: number | null = null;
  let retainerAmount: number | null = null;
  let contractBody: string | null = null;
  let setupToken: string | null = null;
  let setupTokenExpiresAt: string | null = null;

  if (mode === 'full') {
    clientDisplayName = typeof body.client_display_name === 'string' ? body.client_display_name.trim() : '';
    clientEmail = typeof body.client_email === 'string' ? body.client_email.trim().toLowerCase() : '';
    partner1 = typeof body.partner_1_first_name === 'string' ? body.partner_1_first_name.trim() : null;
    partner2 = typeof body.partner_2_first_name === 'string' ? body.partner_2_first_name.trim() : null;
    eventDate = typeof body.event_date === 'string' ? body.event_date.trim() : '';
    templateKey = typeof body.contract_template_key === 'string' ? body.contract_template_key.trim() : '';

    if (!clientDisplayName || !clientEmail || !eventDate || !templateKey) {
      return res.status(400).json({
        success: false,
        error: 'client_display_name, client_email, event_date, and contract_template_key are all required for full mode.',
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return res.status(400).json({ success: false, error: 'client_email is not a valid email address.' });
    }

    const spec = CONTRACT_TEMPLATES[templateKey];
    if (!spec) {
      return res.status(400).json({ success: false, error: `Unknown contract template '${templateKey}'.` });
    }

    const variables: Record<string, string> =
      body.variables && typeof body.variables === 'object'
        ? Object.fromEntries(
            Object.entries(body.variables as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]),
          )
        : {};

    totalAmount = Number(body.contract_total_amount);
    retainerAmount = Number(body.contract_retainer_amount);
    if (!Number.isFinite(totalAmount) || totalAmount < 0 || !Number.isFinite(retainerAmount) || retainerAmount < 0) {
      return res.status(400).json({ success: false, error: 'contract_total_amount and contract_retainer_amount must be non-negative numbers.' });
    }
    if (retainerAmount > totalAmount) {
      return res.status(400).json({ success: false, error: 'Retainer cannot exceed total amount.' });
    }

    // Render the template body now so it's frozen at creation time.
    // Anything in `variables` is interpolated; missing variables render
    // as [variable_name] so the contract surfaces a missing field
    // rather than failing silently. We also drop any "optional" section
    // (like ADDITIONAL NOTES) whose content came out empty, so the
    // signed PDF doesn't show a heading with nothing under it.
    const filled = pruneEmptyOptionalSections(fillTemplate(spec.template, variables));
    contractBody = JSON.stringify(filled);

    // Generate the one-time setup token. Expires in 14 days; long enough
    // that an invite email lingering in a client's inbox over a weekend
    // is still valid.
    setupToken = generateToken();
    setupTokenExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  }

  try {
    const sql = getDb();

    // Check gallery_password uniqueness up front so we can return a clean
    // 409 instead of leaking the DB constraint error.
    const collision = (await sql`
      select 1 from client_portals where gallery_password = ${galleryPassword} limit 1
    `) as Array<{ '?column?': number }>;
    if (collision.length > 0) {
      return res.status(409).json({ success: false, error: 'That gallery password is already in use. Pick another.' });
    }

    let portalId: string;
    if (mode === 'full') {
      const inserted = (await sql`
        insert into client_portals (
          mode, session_type,
          partner_1_first_name, partner_2_first_name,
          client_display_name, client_email,
          event_date,
          gallery_password, gallery_enabled,
          contract_status, contract_template_key, contract_body,
          contract_total_amount, contract_retainer_amount, paid_to_date,
          setup_token, setup_token_expires_at
        ) values (
          ${mode}, ${sessionType},
          ${partner1}, ${partner2},
          ${clientDisplayName}, ${clientEmail},
          ${eventDate},
          ${galleryPassword}, true,
          'pending', ${templateKey}, ${contractBody},
          ${totalAmount}, ${retainerAmount}, 0,
          ${setupToken}, ${setupTokenExpiresAt}
        )
        returning id
      `) as Array<{ id: string }>;
      portalId = inserted[0].id;
    } else {
      // Simple mode: a gallery-only delivery (no contract, no login email,
      // no setup token). Optional fields can come in: display name,
      // event date, Drive URL, retention months.
      //
      // If a drive_url is provided at creation, the portal is considered
      // delivered immediately and the gallery hosting countdown starts.
      // This matches Vero's workflow: she creates these AFTER editing,
      // for things like portraits where she wants to hand the gallery
      // straight to the client/guests.
      const simpleDisplayName =
        typeof body.client_display_name === 'string' && body.client_display_name.trim()
          ? body.client_display_name.trim()
          : null;
      // Reused for the email greeting — "Hi {first_name}," reads better
      // than parsing the display name (which now is "Portrait Alex 2026"
      // not "Alex"). Stored in the existing partner_1_first_name column.
      const simpleClientFirstName =
        typeof body.partner_1_first_name === 'string' && body.partner_1_first_name.trim()
          ? body.partner_1_first_name.trim()
          : null;
      const simpleClientEmail =
        typeof body.client_email === 'string' && body.client_email.trim()
          ? body.client_email.trim().toLowerCase()
          : null;
      const simpleEventDate =
        typeof body.event_date === 'string' && body.event_date.trim()
          ? body.event_date.trim()
          : null;
      const simpleDriveUrl =
        typeof body.drive_url === 'string' && body.drive_url.trim()
          ? body.drive_url.trim()
          : null;
      const simpleRetentionMonths =
        Number.isFinite(Number(body.retention_months)) && Number(body.retention_months) > 0
          ? Number(body.retention_months)
          : 3;
      const simpleTotalAmount =
        body.contract_total_amount !== null &&
        body.contract_total_amount !== undefined &&
        Number.isFinite(Number(body.contract_total_amount))
          ? Number(body.contract_total_amount)
          : null;
      const simpleRetainerAmount =
        body.contract_retainer_amount !== null &&
        body.contract_retainer_amount !== undefined &&
        Number.isFinite(Number(body.contract_retainer_amount))
          ? Number(body.contract_retainer_amount)
          : null;

      const deliveredAt = simpleDriveUrl ? new Date().toISOString() : null;
      const expiresAt = simpleDriveUrl
        ? new Date(Date.now() + simpleRetentionMonths * 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const inserted = (await sql`
        insert into client_portals (
          mode, session_type,
          partner_1_first_name,
          client_display_name, client_email,
          event_date,
          gallery_password, gallery_enabled,
          drive_url, gallery_delivered_at, gallery_expires_at,
          contract_status,
          contract_total_amount, contract_retainer_amount, paid_to_date
        ) values (
          ${mode}, ${sessionType},
          ${simpleClientFirstName},
          ${simpleDisplayName}, ${simpleClientEmail},
          ${simpleEventDate},
          ${galleryPassword}, true,
          ${simpleDriveUrl}, ${deliveredAt}, ${expiresAt},
          'none',
          ${simpleTotalAmount}, ${simpleRetainerAmount}, 0
        )
        returning id
      `) as Array<{ id: string }>;
      portalId = inserted[0].id;

      // Auto-send the gallery-ready email if we have both the Drive URL
      // (i.e. the gallery is actually viewable) AND a client email. Same
      // non-blocking semantics as the full-mode invite email below: log
      // a failure, keep the row.
      if (simpleClientEmail && simpleDriveUrl && expiresAt) {
        try {
          const siteOrigin =
            process.env.SITE_ORIGIN ||
            (req.headers.host ? `https://${req.headers.host}` : 'https://vero.photography');
          await sendEmail({
            to: simpleClientEmail,
            subject: 'Your photos are ready — Vero Photography',
            text: buildGalleryReadyText(simpleClientFirstName, siteOrigin, galleryPassword, expiresAt),
            html: buildGalleryReadyHtml(simpleClientFirstName, siteOrigin, galleryPassword, expiresAt),
          });
        } catch (err) {
          console.error('[admin/portals-create] gallery-ready email failed:', err);
        }
      }
    }

    // Send invite email for full-mode portals. Email is non-blocking-ish —
    // we'd rather log a failure than fail the portal creation itself.
    if (mode === 'full' && setupToken && clientEmail) {
      try {
        const siteOrigin =
          process.env.SITE_ORIGIN ||
          (req.headers.host ? `https://${req.headers.host}` : 'https://vero.photography');
        const inviteUrl = `${siteOrigin}/portal/welcome?token=${setupToken}`;
        await sendEmail({
          to: clientEmail,
          subject: 'Your client portal is ready — Vero Photography',
          text: buildInviteText(clientDisplayName, inviteUrl),
          html: buildInviteHtml(clientDisplayName, inviteUrl),
        });
      } catch (err) {
        console.error('[admin/portals-create] invite email failed (portal was still created):', err);
      }
    }

    return res.status(200).json({
      success: true,
      portal_id: portalId,
      setup_token: setupToken,
    });
  } catch (err) {
    console.error('[admin/portals-create] handler failed:', err);
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

function buildGalleryReadyText(
  firstName: string | null,
  siteOrigin: string,
  galleryPassword: string,
  expiresAt: string,
): string {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
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

function buildGalleryReadyHtml(
  firstName: string | null,
  siteOrigin: string,
  galleryPassword: string,
  expiresAt: string,
): string {
  const name = firstName || 'there';
  const exp = new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${name},</p>
<p>Your photos are ready ✨</p>
<p style="margin:24px 0;"><a href="${siteOrigin}/portal/pass" style="display:inline-block;padding:14px 28px;background:#c9a96e;color:#fff;text-decoration:none;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-size:13px;">Open my gallery</a></p>
<p style="font-size:14px;color:#666;">Password: <strong style="color:#2d2d2d;font-family:monospace;">${galleryPassword}</strong></p>
<p style="font-size:14px;color:#666;">The gallery will stay online until <strong>${exp}</strong>. Please download and back up your favourites before then.</p>
<p>If you have any questions or want to order prints, just reply to this email.</p>
<p>Warmly,<br><em>Veronika</em></p>
</body></html>`;
}
