/**
 * Client Portal auth — email + password access for full client portal.
 *
 * POST { email, password }
 *   → 200 { success, ...full portal payload }    on hit
 *   → 401                                        on wrong email/password
 *   → 405                                        non-POST
 *
 * Two-factor-ish friction: requiring both an email AND a password is what
 * stops clients from casually handing their login to wedding guests. Anyone
 * they want to share photos with goes through the Gallery Pass tab instead.
 *
 * Returns the full client portal payload — contract status, payment info,
 * gallery files (if uploaded), and the manageable Gallery Pass settings.
 * Client-side UI renders progressively based on what's populated.
 *
 * Only `mode='full'` portals can log in here. `mode='simple'` portals have
 * no email/password, so any lookup against them is impossible by design.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { listFolderTree, extractFolderId, type FolderTree } from '../_drive.js';

const WRONG_AUTH_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ClientPortalRow = {
  id: string;
  client_display_name: string | null;
  client_email: string | null;
  drive_url: string | null;
  contract_status: 'none' | 'pending' | 'signed' | 'void';
  contract_signed_at: string | null;
  contract_body: string | null;
  contract_signed_pdf_drive_id: string | null;
  contract_total_amount: string | null;
  contract_retainer_amount: string | null;
  paid_to_date: string;
  payment_plan_enabled: boolean;
  gallery_password: string;
  gallery_enabled: boolean;
  gallery_delivered_at: string | null;
  gallery_expires_at: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password =
    typeof req.body?.password === 'string' ? req.body.password.trim() : '';

  if (!email || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Email and password required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      select id, client_display_name, client_email, drive_url,
             contract_status, contract_signed_at, contract_body, contract_signed_pdf_drive_id,
             contract_total_amount, contract_retainer_amount, paid_to_date, payment_plan_enabled,
             gallery_password, gallery_enabled,
             gallery_delivered_at, gallery_expires_at
      from client_portals
      where mode = 'full'
        and lower(client_email) = ${email}
        and client_password = ${password}
      limit 1
    `) as ClientPortalRow[];

    if (rows.length === 0) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Incorrect email or password' });
    }

    const row = rows[0];

    // Fetch payment installments if a payment plan is enabled.
    let installments: Array<{
      installment_number: number;
      amount: number;
      due_date: string;
      paid_at: string | null;
      paid_amount: number | null;
      payment_method: string | null;
    }> = [];
    if (row.payment_plan_enabled) {
      const inst = (await sql`
        select installment_number, amount, due_date, paid_at, paid_amount, payment_method
        from payment_installments
        where client_portal_id = ${row.id}
        order by installment_number asc
      `) as Array<{
        installment_number: number;
        amount: string;
        due_date: string;
        paid_at: string | null;
        paid_amount: string | null;
        payment_method: string | null;
      }>;
      installments = inst.map((i) => ({
        installment_number: i.installment_number,
        amount: parseFloat(i.amount),
        due_date: i.due_date,
        paid_at: i.paid_at,
        paid_amount: i.paid_amount ? parseFloat(i.paid_amount) : null,
        payment_method: i.payment_method,
      }));
    }

    // Try to list Drive files if gallery is ready. Same fall-through pattern
    // as /api/portal/gallery — a Drive listing failure is non-fatal because
    // the portal page can still show the contract / payment / "Open in Drive"
    // fallback link even without thumbnails.
    let tree: FolderTree = { rootFiles: [], sections: [] };
    let warning: string | undefined;

    if (row.drive_url) {
      const folderId = extractFolderId(row.drive_url);
      if (folderId) {
        try {
          tree = await listFolderTree(folderId);
        } catch (err) {
          console.error('[portal/client] Drive listing failed:', err);
          warning = 'Could not load photo previews — use "View in Drive" below.';
        }
      }
    }

    return res.status(200).json({
      success: true,
      mode: 'full',
      client_name: row.client_display_name,
      client_email: row.client_email,
      drive_url: row.drive_url,
      rootFiles: tree.rootFiles,
      sections: tree.sections,
      warning,

      // Contract
      contract_status: row.contract_status,
      contract_signed_at: row.contract_signed_at,
      contract_body: row.contract_body,
      contract_signed_pdf_drive_id: row.contract_signed_pdf_drive_id,

      // Payment
      contract_total_amount: row.contract_total_amount ? parseFloat(row.contract_total_amount) : null,
      contract_retainer_amount: row.contract_retainer_amount ? parseFloat(row.contract_retainer_amount) : null,
      paid_to_date: parseFloat(row.paid_to_date),
      payment_plan_enabled: row.payment_plan_enabled,
      installments,

      // Gallery Pass (manageable here)
      gallery_password: row.gallery_password,
      gallery_enabled: row.gallery_enabled,

      // Gallery hosting
      gallery_delivered_at: row.gallery_delivered_at,
      gallery_expires_at: row.gallery_expires_at,
    });
  } catch (err) {
    console.error('[portal/client] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
