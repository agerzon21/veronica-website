/**
 * Admin: list all client portals. Also doubles as the LOGIN endpoint —
 * the admin dashboard calls this on sign-in and again on manual refresh.
 *
 * POST { email?, password }
 *   → If `email` is present: treated as a LOGIN. We validate the
 *     email+password pair (loginAdmin) — this is what enforces the
 *     two-factor secret at sign-in. Correct pair returns 200 with the
 *     portal list + level; wrong pair returns 401 "Incorrect email or
 *     password".
 *   → If `email` is absent: treated as a post-login REFRESH. Password
 *     alone is validated (requireAdmin) as the bearer token.
 *
 *   → 200 { success, level, portals: [...] }
 *   → 401 on bad credentials
 *
 * Returns a flattened summary per portal — enough for the admin dashboard
 * table to show name, contract status, paid-vs-total, gallery status,
 * event date. Detail view will fetch full record separately.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { loginAdmin, requireAdmin, createAdminSession } from '../_admin-auth.js';

type Row = {
  id: string;
  mode: 'simple' | 'full';
  session_type: string | null;
  client_display_name: string | null;
  client_email: string | null;
  event_date: string | null;
  contract_status: 'none' | 'pending' | 'signed' | 'void';
  contract_signed_at: string | null;
  contract_total_amount: string | null;
  paid_to_date: string;
  drive_url: string | null;
  gallery_delivered_at: string | null;
  gallery_expires_at: string | null;
  gallery_password: string;
  gallery_enabled: boolean;
  setup_token: string | null;
  created_at: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // If `email` is present in the body, treat this as the LOGIN call
  // and enforce email+password. Otherwise this is a post-login refresh
  // and the password alone suffices as the bearer token.
  const email = typeof req.body?.email === 'string' ? req.body.email : null;
  const auth = email
    ? await loginAdmin(email, req.body?.password)
    : await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  // On a LOGIN (email present) mint a session token, if this resolved to a real
  // admin_users row. The panel stores that instead of the raw password, which
  // is what makes a reload survivable — today it keeps the password in React
  // state and loses it on refresh.
  //
  // Env-var logins get no token (there is no user row to attach one to) and
  // keep working exactly as before. That is the fallback that makes this
  // migration lockout-proof.
  let sessionToken: string | null = null;
  if (email && auth.userId) {
    try {
      sessionToken = await createAdminSession(
        auth.userId,
        typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      );
    } catch (err) {
      // Never fail a valid login because session creation failed — the caller
      // falls back to sending the password, which still authenticates.
      console.error('[admin/portals] could not create session:', err);
    }
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      select id, mode, session_type, client_display_name, client_email, event_date,
             contract_status, contract_signed_at, contract_total_amount, paid_to_date,
             drive_url, gallery_delivered_at, gallery_expires_at,
             gallery_password, gallery_enabled, setup_token, created_at
      from client_portals
      order by
        coalesce(event_date, created_at::date) desc,
        created_at desc
    `) as Row[];

    return res.status(200).json({
      success: true,
      level: auth.level,
      // null for env-var logins; the client keeps using the password then.
      session_token: sessionToken,
      portals: rows.map((r) => ({
        id: r.id,
        mode: r.mode,
        session_type: r.session_type,
        client_display_name: r.client_display_name,
        client_email: r.client_email,
        event_date: r.event_date,
        contract_status: r.contract_status,
        contract_signed_at: r.contract_signed_at,
        contract_total_amount: r.contract_total_amount ? parseFloat(r.contract_total_amount) : null,
        paid_to_date: parseFloat(r.paid_to_date),
        drive_url: r.drive_url,
        gallery_delivered_at: r.gallery_delivered_at,
        gallery_expires_at: r.gallery_expires_at,
        gallery_password: r.gallery_password,
        gallery_enabled: r.gallery_enabled,
        // True only if the client hasn't completed onboarding (setup_token
        // still set). UI surfaces this as a "Pending invite" pill.
        pending_invite: !!r.setup_token,
        created_at: r.created_at,
      })),
    });
  } catch (err) {
    console.error('[admin/portals] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
