/**
 * Look up a portal by its one-time setup token.
 *
 * POST { token }
 *   → 200 { success, ...summary }    valid + not expired
 *   → 410                            token used or expired
 *
 * The setup_token IS the auth — possession of a 32-byte token is treated
 * as proof of ownership of the email address it was sent to. The summary
 * is what the client sees on the welcome page before they pick a password.
 *
 * No PII beyond what's already in the invite email is returned — display
 * name, event details. We don't return the contract body here; the
 * full contract appears post-login on the portal proper.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';

type Row = {
  id: string;
  client_display_name: string | null;
  client_email: string;
  session_type: string | null;
  event_date: string | null;
  contract_total_amount: string | null;
  contract_retainer_amount: string | null;
  setup_token_expires_at: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    return res.status(400).json({ success: false, error: 'token required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      select id, client_display_name, client_email, session_type, event_date,
             contract_total_amount, contract_retainer_amount, setup_token_expires_at
      from client_portals
      where setup_token = ${token}
        and mode = 'full'
      limit 1
    `) as Row[];

    if (rows.length === 0) {
      return res.status(410).json({
        success: false,
        error: 'This setup link is no longer valid. Reach out to Veronika to get a new one.',
      });
    }

    const row = rows[0];
    if (row.setup_token_expires_at && new Date(row.setup_token_expires_at).getTime() < Date.now()) {
      return res.status(410).json({
        success: false,
        error: 'This setup link has expired. Reach out to Veronika to get a new one.',
      });
    }

    return res.status(200).json({
      success: true,
      client_display_name: row.client_display_name,
      client_email: row.client_email,
      session_type: row.session_type,
      event_date: row.event_date,
      contract_total_amount: row.contract_total_amount ? parseFloat(row.contract_total_amount) : null,
      contract_retainer_amount: row.contract_retainer_amount ? parseFloat(row.contract_retainer_amount) : null,
    });
  } catch (err) {
    console.error('[portal/welcome] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
