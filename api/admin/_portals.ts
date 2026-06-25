/**
 * Admin: list all client portals.
 *
 * POST { password }
 *   → 200 { success, portals: [...] }
 *   → 401 on bad password
 *
 * Returns a flattened summary per portal — enough for the admin dashboard
 * table to show name, contract status, paid-vs-total, gallery status,
 * event date. Detail view will fetch full record separately.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

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

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

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
