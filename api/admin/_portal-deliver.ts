/**
 * Admin: mark a portal as delivered. This is the release switch: for
 * full-mode portals, api/portal/_gallery-gate.ts serves no photo data at all
 * until gallery_delivered_at is set, so pressing this is what actually
 * publishes the gallery. It also starts the retention countdown and (for
 * portals with an email on file) sends the "your photos are ready" email.
 *
 * POST { password, id, retention_months?, confirmUnpaid?, resend_email? }
 *   → 200 { success, gallery_delivered_at, gallery_expires_at, email }
 *     `email` is { sent, id?, error? }. Delivery still succeeds when the email
 *     fails, because the gallery IS released and un-releasing it over a bounce
 *     would be worse, but the caller is now TOLD, which it never used to be.
 *   → 400 if portal has no drive_url yet
 *
 * With resend_email: true it sends the photos-are-ready email again and
 * touches nothing else. It does NOT re-stamp gallery_delivered_at or the
 * expiry, which is what calling this endpoint twice used to do, and it is
 * refused with 409 on a gallery that was never delivered. Returns 502 when the
 * send itself fails, since sending was the entire point of the request.
 *
 * retention_months defaults to the contract's own retention_months variable,
 * then to 3. That lookup is real now; the previous version of this comment
 * described it while the code never performed it.
 *   → 401 on bad admin password
 *   → 404 if portal not found
 *   → 409 { unpaid_balance, paid_to_date, contract_total_amount, charges_total }
 *         if the contract is signed and not paid off, unless confirmUnpaid is
 *         true. Charges added after the booking count towards what is owed,
 *         so an unpaid parking expense holds the photos exactly like an
 *         unpaid balance does.
 *
 * Pre-conditions:
 *   - drive_url must be set (delivery without a gallery doesn't make sense)
 *   - For full-mode, contract should be signed (warn but don't block: there
 *     is an edge case where Vero delivers before signing for trusted clients)
 *   - A signed contract must be paid off, or the caller must pass
 *     confirmUnpaid (see the guard rail below)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { sendEmail } from '../_auto-reply.js';

/**
 * Add calendar months, the way a person counting months on a calendar does.
 *
 * The previous arithmetic was `months * 30 * 24 * 60 * 60 * 1000`, so "3
 * months" was 90 days and landed two to three days early depending on which
 * months it crossed. The contract says months and the client reads months, so
 * a gallery that dies before the date on the contract is a promise broken by a
 * rounding decision nobody made on purpose.
 *
 * Month-end is the trap: 31 January plus one month has no 31st to land on, and
 * `setMonth` silently rolls forward into March. Clamp to the last day of the
 * target month instead, which is what every calendar app does and what a
 * person means.
 */
export function addCalendarMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

type DeliverPortal = {
  id: string;
  mode: 'simple' | 'full';
  client_display_name: string | null;
  client_email: string | null;
  gallery_password: string;
};

type EmailOutcome = { sent: boolean; id?: string; error?: string };

/**
 * Send the photos-are-ready email and record that it happened.
 *
 * Shared by the first delivery and by a resend, so the two cannot drift into
 * sending different wording, and so both record the same evidence. Never
 * throws: the caller decides what a failure means, and for delivery it means
 * "the gallery is still released, but say so".
 */
async function sendDeliveryEmail(
  sql: ReturnType<typeof getDb>,
  portal: DeliverPortal,
  expiresAt: string,
  siteOrigin: string,
): Promise<EmailOutcome> {
  if (!portal.client_email) {
    return { sent: false, error: 'No email address on this booking.' };
  }
  try {
    const sent = await sendEmail({
      to: portal.client_email,
      subject: 'Your photos are ready, from Vero Photography',
      text:
        portal.mode === 'full'
          ? buildFullDeliveryText(portal.client_display_name, expiresAt, siteOrigin, portal.gallery_password)
          : buildSimpleDeliveryText(portal.client_display_name, expiresAt, siteOrigin, portal.gallery_password),
      html:
        portal.mode === 'full'
          ? buildFullDeliveryHtml(portal.client_display_name, expiresAt, siteOrigin, portal.gallery_password)
          : buildSimpleDeliveryHtml(portal.client_display_name, expiresAt, siteOrigin, portal.gallery_password),
    });
    // Recorded separately from the delivery stamp so a resend can update it
    // without touching gallery_delivered_at, which is the release switch and
    // the date the client reads on their own portal.
    await sql`
      update client_portals
      set delivery_email_id = ${sent.id},
          delivery_email_sent_at = now(),
          updated_at = now()
      where id = ${portal.id}
    `;
    return { sent: true, id: sent.id };
  } catch (err) {
    console.error('[admin/portal-deliver] photos-ready email failed:', err);
    return {
      sent: false,
      // The message, not the stack. This reaches a person deciding whether to
      // retype the address or press send again.
      error: err instanceof Error ? err.message : 'The email could not be sent.',
    };
  }
}

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
  const explicitRetention = Number.isFinite(reqRetention) && reqRetention > 0 ? reqRetention : null;
  // Explicit opt-in, sent by the admin UI only after Vero has been shown the
  // outstanding amount and chosen to deliver anyway. Strict === true so a
  // stray 'false' string or a 1 from some future caller cannot wave the
  // guard rail through by accident.
  const confirmUnpaid = req.body?.confirmUnpaid === true;

  try {
    const sql = getDb();
    const rows = (await sql`
      select id, mode, client_display_name, client_email, drive_url, gallery_password, gallery_delivered_at,
             gallery_expires_at, contract_status, contract_total_amount, paid_to_date, contract_variables
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
      gallery_expires_at: string | null;
      contract_status: 'none' | 'pending' | 'signed' | 'void';
      // The contract's own promise about how long the gallery stays up. It is
      // a contract VARIABLE, not a column, which is why the lookup this
      // handler's docstring has always described was never actually here.
      contract_variables: Record<string, string> | null;
      // Postgres numerics arrive as strings, so both need parseFloat before
      // any comparison. '250' < '90' is true as strings.
      contract_total_amount: string | null;
      paid_to_date: string;
    }>;

    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Portal not found' });
    const portal = rows[0];
    if (!portal.drive_url) {
      return res.status(400).json({ success: false, error: 'Cannot deliver: paste a Drive folder URL first.' });
    }

    const siteOrigin =
      process.env.SITE_ORIGIN ||
      (req.headers.host ? `https://${req.headers.host}` : 'https://vero.photography');

    // Sending the photos-are-ready email AGAIN, without re-delivering.
    //
    // Handled before the money guard on purpose: the photos are already
    // released, so refusing to re-send the notification over an unpaid balance
    // would withhold only the client's knowledge of something they can already
    // see. It also must not re-stamp gallery_delivered_at or the expiry, which
    // is exactly what calling this endpoint twice used to do, since it has no
    // already-delivered guard.
    if (req.body?.resend_email === true) {
      if (!portal.gallery_delivered_at) {
        return res.status(409).json({
          success: false,
          error: 'This gallery has not been delivered yet, so there is nothing to re-send.',
        });
      }
      const outcome = await sendDeliveryEmail(sql, portal, portal.gallery_expires_at ?? '', siteOrigin);
      return res.status(outcome.sent ? 200 : 502).json({
        success: outcome.sent,
        error: outcome.sent ? undefined : outcome.error,
        email: outcome,
        gallery_delivered_at: portal.gallery_delivered_at,
        gallery_expires_at: portal.gallery_expires_at,
      });
    }

    // Money guard rail. The contract says images are delivered after full
    // payment, and since the gallery gate landed, this endpoint is the only
    // thing that releases them, so the check belongs here rather than on the
    // Drive URL field.
    //
    // Signed contracts only: a portal with no signed contract has no agreed
    // total to hold anyone to, and simple gallery-only rows never have one.
    // Not a lock either. Photographers do release early (cash handed over at
    // the shoot, a comp gift, a payment plan tracked elsewhere), and Vero is
    // far likelier to have forgotten to log a payment than to be delivering
    // unpaid on purpose, so confirmUnpaid goes straight through.
    const totalAmount =
      portal.contract_total_amount !== null ? parseFloat(portal.contract_total_amount) : null;
    const paidToDate = parseFloat(portal.paid_to_date ?? '0') || 0;

    /**
     * Charges added after the booking (extra time, costs paid on the day) are
     * owed just like the contract total, so the guard rail has to see them or
     * a client gets their photos while the parking is still unpaid.
     *
     * Read in its own statement, and allowed to fail, because migration 035 is
     * applied by hand: on a database without the column the answer is 0, which
     * is exactly how this endpoint behaved before charges existed.
     */
    let chargesTotal = 0;
    try {
      const chargeRows = (await sql`
        select charges_total from client_portals where id = ${id} limit 1
      `) as Array<{ charges_total: string | null }>;
      chargesTotal = parseFloat(chargeRows[0]?.charges_total ?? '0') || 0;
    } catch {
      /* pre-migration-035 database: nothing has been charged */
    }
    const owed = totalAmount !== null ? totalAmount + chargesTotal : null;

    if (
      !confirmUnpaid &&
      portal.contract_status === 'signed' &&
      owed !== null &&
      paidToDate < owed
    ) {
      const outstanding = owed - paidToDate;
      return res.status(409).json({
        success: false,
        error: `Cannot deliver yet: $${outstanding.toFixed(0)} of $${owed.toFixed(0)} is still outstanding. Log the payment, or confirm to deliver anyway.`,
        unpaid_balance: outstanding,
        paid_to_date: paidToDate,
        contract_total_amount: totalAmount,
        charges_total: chargesTotal,
      });
    }

    // The contract says how long the gallery stays up, so the contract decides.
    // An explicit request still wins, for the case where Vero is deliberately
    // giving someone longer. Falling back to 3 only when neither exists.
    //
    // This is the lookup the docstring has always promised and the code never
    // performed: a wedding contract promising six months was delivering three,
    // and nothing anywhere said so.
    const contractRetention = Number(portal.contract_variables?.retention_months);
    const retentionMonths =
      explicitRetention ??
      (Number.isFinite(contractRetention) && contractRetention > 0 ? contractRetention : 3);

    const deliveredAt = new Date().toISOString();
    const expiresAt = addCalendarMonths(new Date(deliveredAt), retentionMonths).toISOString();

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
    // simple-mode clients go to /portal/pass (password-only), so their email
    // also surfaces the password.
    //
    // A send failure still does not fail the request, and that part was always
    // right: the gallery IS delivered in the database, and un-delivering it
    // because an email bounced would be worse. What was wrong is that the
    // failure was written to console.error and then reported as success, on
    // the one email in this system with no stored id, no status lookup and no
    // way to send it again, behind a button that hides itself once pressed.
    //
    // So the outcome is now part of the response, and a success is recorded
    // so the client record can look it up the way it already does the invite.
    const emailOutcome = await sendDeliveryEmail(sql, portal, expiresAt, siteOrigin);

    return res.status(200).json({
      success: true,
      gallery_delivered_at: deliveredAt,
      gallery_expires_at: expiresAt,
      email: emailOutcome,
    });
  } catch (err) {
    console.error('[admin/portal-deliver] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * The full-portal client gets their own login link AND the Gallery Pass link,
 * because those are two different doors: /portal is theirs alone (email +
 * password), while /portal/pass is the one they forward to family and guests
 * without handing over their login. The pass link is the same one-click shape
 * the simple builders below and _share-gallery.ts use.
 *
 * The line about changing the password is verified, not aspirational: the
 * Gallery Pass section of the portal calls /api/portal/gallery-pass with
 * action 'rotate' or 'set', authenticated by the client's own credentials.
 */
function buildFullDeliveryText(
  clientLabel: string | null,
  expiresAt: string,
  siteOrigin: string,
  galleryPassword: string,
): string {
  const greeting = clientLabel ? `Hi ${clientLabel.split(/[&,]/)[0].trim()},` : 'Hi there,';
  const exp = new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const shareUrl = `${siteOrigin}/portal/pass?password=${encodeURIComponent(galleryPassword)}`;
  return `${greeting}

Your photos are ready. You can view and download them at:

${siteOrigin}/portal

Want to share these with family or friends? Anyone with the link below can view the gallery, no account needed.

${shareUrl}

You can change that gallery password any time from your portal, so the link stays yours to control.

The gallery will stay online until ${exp}. Please download and back up your favourites before then.

If you have any questions or want to order prints, just reply to this email.

Warmly,
Veronika`;
}

function buildFullDeliveryHtml(
  clientLabel: string | null,
  expiresAt: string,
  siteOrigin: string,
  galleryPassword: string,
): string {
  const firstName = clientLabel ? clientLabel.split(/[&,]/)[0].trim() : 'there';
  const exp = new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const shareUrl = `${siteOrigin}/portal/pass?password=${encodeURIComponent(galleryPassword)}`;
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${firstName},</p>
<p>Your photos are ready ✨ View them anytime in your portal:</p>
<p style="margin:24px 0;"><a href="${siteOrigin}/portal" style="display:inline-block;padding:14px 28px;background:#c9a96e;color:#fff;text-decoration:none;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-size:13px;">Open My Gallery</a></p>
<p style="font-size:14px;color:#666;">Want to share these with family or friends? Anyone with the link below can view the gallery, no account needed.</p>
<p style="font-size:13px;"><a href="${shareUrl}" style="word-break:break-all;color:#c9a96e;font-family:monospace;font-size:12px;">${shareUrl}</a></p>
<p style="font-size:13px;color:#888;">You can change that gallery password any time from your portal, so the link stays yours to control.</p>
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
  const directUrl = `${siteOrigin}/portal/pass?password=${encodeURIComponent(galleryPassword)}`;
  return `${greeting}

Your photos are ready ✨

Open your gallery (one-click access):
${directUrl}

If that link doesn't work, you can also go to ${siteOrigin}/portal/pass and enter the password manually:

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
  const directUrl = `${siteOrigin}/portal/pass?password=${encodeURIComponent(galleryPassword)}`;
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${firstName},</p>
<p>Your photos are ready ✨</p>
<p style="margin:24px 0;"><a href="${directUrl}" style="display:inline-block;padding:14px 28px;background:#c9a96e;color:#fff;text-decoration:none;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-size:13px;">Open my gallery</a></p>
<p style="font-size:13px;color:#888;margin-top:-8px;">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all;color:#c9a96e;font-family:monospace;font-size:12px;">${directUrl}</span></p>
<p style="font-size:13px;color:#888;">Or, go to <a href="${siteOrigin}/portal/pass" style="color:#c9a96e">${siteOrigin}/portal/pass</a> and enter:<br>Password: <strong style="color:#2d2d2d;font-family:monospace;">${galleryPassword}</strong></p>
<p style="font-size:14px;color:#666;">The gallery will stay online until <strong>${exp}</strong>. Please download and back up your favourites before then.</p>
<p>If you have any questions or want to order prints, just reply to this email.</p>
<p>Warmly,<br><em>Veronika</em></p>
</body></html>`;
}
