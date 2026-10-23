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
import { DEFAULT_DISCOUNT_LABEL } from '../../src/data/discount.js';

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

    // Not found almost always means USED: setting the password clears the
    // token, and the email still holds the link. It said "Reach out to
    // Veronika to get a new one" to a client who already had an account and
    // only needed to sign in (2026-10-15). A resent invite also replaces the
    // token, so the page covers that too. `used` lets it offer the sign-in.
    if (rows.length === 0) {
      return res.status(410).json({
        success: false,
        used: true,
        error: 'This setup link has already been used, or a newer one has been sent since.',
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

    /**
     * Booked as a package (migration 057): every session in it, so the page
     * can show the discount the client was given. Allowed to fail.
     */
    let pkg: { names: string[]; regular: number; price: number } | null = null;
    /**
     * Each session's own discount (migration 058), this booking's or, in a
     * package, every session's: Alex's rule is that a client sees every
     * discount they were given. The package line above is then worked out
     * from the prices AFTER these, so the two never count the same dollars.
     */
    const discounts: Array<{ label: string; off: number; regular: number; session: string | null }> = [];
    try {
      const k = (await sql`select package_id from client_portals where id = ${row.id}`) as Array<{ package_id: string | null }>;
      const members = (await (k[0]?.package_id
        ? sql`
            select session_type, contract_template_key, regular_amount::float8 as regular, contract_total_amount::float8 as price,
                   discount_amount::float8 as discount, discount_label
            from client_portals where package_id = ${k[0].package_id}
            order by event_date asc nulls last, created_at asc
          `
        : sql`
            select session_type, contract_template_key, regular_amount::float8 as regular, contract_total_amount::float8 as price,
                   discount_amount::float8 as discount, discount_label
            from client_portals where id = ${row.id}
          `)) as Array<{
        session_type: string | null;
        contract_template_key: string | null;
        regular: number | null;
        price: number | null;
        discount: number | null;
        discount_label: string | null;
      }>;
      const nameOf = (m: (typeof members)[number]) =>
        (m.session_type || m.contract_template_key || 'Session').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      for (const m of members) {
        // Outside a package the whole gap is the discount, named or not.
        const off = members.length > 1 ? (m.discount ?? 0) : m.discount ?? Math.max((m.regular ?? 0) - (m.price ?? 0), 0);
        if (off > 0 && m.regular) {
          discounts.push({ label: m.discount_label || DEFAULT_DISCOUNT_LABEL, off, regular: m.regular, session: members.length > 1 ? nameOf(m) : null });
        }
      }
      if (members.length > 1) {
        pkg = {
          names: members.map(nameOf),
          regular: members.reduce((sum, m) => sum + (m.regular ?? m.price ?? 0) - (m.discount ?? 0), 0),
          price: members.reduce((sum, m) => sum + (m.price ?? 0), 0),
        };
      }
    } catch {
      /* migration 057/058 not applied: no package and no discount to show */
    }

    return res.status(200).json({
      package: pkg,
      discounts,
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
