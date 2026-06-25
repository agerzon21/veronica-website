/**
 * Admin: get full detail for a single portal, including payment entries.
 *
 * POST { password, id }
 *   → 200 { success, portal, payments }
 *   → 401 on bad admin password
 *   → 404 if no portal with that id
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

type PortalRow = {
  id: string;
  mode: 'simple' | 'full';
  session_type: string | null;
  partner_1_first_name: string | null;
  partner_2_first_name: string | null;
  partner_1_full_name: string | null;
  partner_2_full_name: string | null;
  client_display_name: string | null;
  client_email: string | null;
  client_password: string | null;
  event_date: string | null;
  gallery_password: string;
  gallery_enabled: boolean;
  drive_url: string | null;
  gallery_delivered_at: string | null;
  gallery_expires_at: string | null;
  contract_status: 'none' | 'pending' | 'signed' | 'void';
  contract_template_key: string;
  contract_body: string | null;
  contract_variables: Record<string, string> | null;
  contract_signed_at: string | null;
  contract_signed_pdf_url: string | null;
  contract_total_amount: string | null;
  contract_retainer_amount: string | null;
  paid_to_date: string;
  payment_plan_enabled: boolean;
  setup_token: string | null;
  setup_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentRow = {
  id: string;
  amount: string;
  method: string | null;
  note: string | null;
  paid_at: string;
  created_at: string;
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
      select id, mode, session_type,
             partner_1_first_name, partner_2_first_name,
             partner_1_full_name, partner_2_full_name,
             client_display_name, client_email, client_password, event_date,
             gallery_password, gallery_enabled, drive_url,
             gallery_delivered_at, gallery_expires_at,
             contract_status, contract_template_key, contract_body, contract_variables,
             contract_signed_at, contract_signed_pdf_url,
             contract_total_amount, contract_retainer_amount, paid_to_date,
             payment_plan_enabled,
             setup_token, setup_token_expires_at,
             created_at, updated_at
      from client_portals
      where id = ${id}
      limit 1
    `) as PortalRow[];
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Portal not found' });
    }
    const r = rows[0];

    const payments = (await sql`
      select id, amount, method, note, paid_at, created_at
      from payment_entries
      where client_portal_id = ${id}
      order by paid_at desc, created_at desc
    `) as PaymentRow[];

    return res.status(200).json({
      success: true,
      portal: {
        ...r,
        contract_total_amount: r.contract_total_amount ? parseFloat(r.contract_total_amount) : null,
        contract_retainer_amount: r.contract_retainer_amount ? parseFloat(r.contract_retainer_amount) : null,
        paid_to_date: parseFloat(r.paid_to_date),
        // We never return the raw blob URL — only whether a signed PDF
        // exists. Clients access it via the signed download endpoint.
        contract_signed_pdf_available: !!r.contract_signed_pdf_url,
        contract_signed_pdf_url: undefined,
        // Onboarding state for the admin Account section. Surfaces
        // whether the client has finished welcome (set_a_password) vs
        // is still pending an invite.
        client_has_password: !!r.client_password,
        client_password: undefined,
      },
      payments: payments.map((p) => ({
        id: p.id,
        amount: parseFloat(p.amount),
        method: p.method,
        note: p.note,
        paid_at: p.paid_at,
        created_at: p.created_at,
      })),
    });
  } catch (err) {
    console.error('[admin/portal-detail] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
