/**
 * Look up a portal by its one-time setup token.
 *
 * POST { token }
 *   → 200 { success, ...summary }    valid + not expired
 *   → 410                            token used or expired
 *
 * The setup_token IS the auth, possession of a 32-byte token is treated
 * as proof of ownership of the email address it was sent to. The summary
 * is what the client sees on the welcome page before they pick a password.
 *
 * No PII beyond what's already in the invite email is returned, display
 * name, event details. We don't return the contract body here; the
 * full contract appears post-login on the portal proper.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { salesTaxModeOf, type SalesTaxMode } from '../../src/data/sales-tax.js';
import { cardPricingOf, type CardPricing } from '../../src/data/payment-handles.js';
import { greetingName } from '../../src/data/client-greeting.js';

type Row = {
  id: string;
  client_display_name: string | null;
  partner_1_first_name: string | null;
  client_email: string;
  partner_1_full_name: string | null;
  partner_2_full_name: string | null;
  session_type: string | null;
  // The contract TYPE, distinct from session_type. session_type is a display
  // label Vero can type freely (an "Other" booking might read "branding"), so
  // it cannot be trusted to decide wording. This is the key into
  // CONTRACT_TEMPLATES and is what tells the portal whether to say "Event
  // Date" or "Session Date". Legacy rows default to 'wedding'.
  contract_template_key: string | null;
  event_date: string | null;
  contract_variables: Record<string, string> | null;
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
      select id, client_display_name, partner_1_first_name, client_email,
             partner_1_full_name, partner_2_full_name,
             session_type, contract_template_key, event_date, contract_variables,
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

    // event_title was stored in the contract_variables blob at portal
    // creation time. Surface it on the welcome page so the client sees
    // "Chrisann & Rajiv's Wedding" instead of the lowercase keyword
    // "wedding".
    const eventTitle = row.contract_variables?.event_title ?? null;

    /**
     * Two later columns, each read on its own and allowed to fail like
     * everywhere else they are read. A free booking (migration 048) shows no
     * money at all, as in the portal; sales tax (migration 049) lets the page
     * show the taxed total the contract below it states.
     */
    let complimentary = false;
    try {
      const c = (await sql`select complimentary from client_portals where id = ${row.id}`) as Array<{ complimentary: boolean }>;
      complimentary = c[0]?.complimentary === true;
    } catch {
      /* migration 048 not applied */
    }
    let salesTax: SalesTaxMode = 'absorbed';
    try {
      const t = (await sql`select sales_tax from client_portals where id = ${row.id}`) as Array<{ sales_tax: string }>;
      salesTax = salesTaxModeOf(t[0]?.sales_tax);
    } catch {
      /* migration 049 not applied */
    }
    // Who pays the card fee (migration 054), so the card prices the contract
    // below states can be shown beside these.
    let cardPricing: CardPricing = 'single';
    try {
      const c = (await sql`select card_pricing from client_portals where id = ${row.id}`) as Array<{ card_pricing: string }>;
      cardPricing = cardPricingOf(c[0]?.card_pricing);
    } catch {
      /* migration 054 not applied */
    }

    return res.status(200).json({
      success: true,
      client_display_name: row.client_display_name,
      // "Hi Ashley" at the top of the page. The display name is Vero's label.
      greeting_name: greetingName(row.client_display_name, row.partner_1_first_name),
      client_email: row.client_email,
      partner_1_full_name: row.partner_1_full_name,
      partner_2_full_name: row.partner_2_full_name,
      session_type: row.session_type,
      contract_template_key: row.contract_template_key ?? 'wedding',
      event_title: eventTitle,
      event_date: row.event_date,
      contract_total_amount: !complimentary && row.contract_total_amount ? parseFloat(row.contract_total_amount) : null,
      contract_retainer_amount: !complimentary && row.contract_retainer_amount ? parseFloat(row.contract_retainer_amount) : null,
      sales_tax: salesTax,
      card_pricing: cardPricing,
    });
  } catch (err) {
    console.error('[portal/welcome] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
