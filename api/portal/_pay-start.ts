/**
 * Client portal: start a card payment.
 *
 * POST { email, password, kind: 'retainer' | 'balance' }
 *   → 200 { success, url }   a Stripe hosted Checkout URL to redirect to
 *   → 400 if there is nothing to pay
 *   → 401 on wrong email/password
 *   → 503 if card payments are not configured yet
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the amount is computed HERE, from the
 * database, and never read from the request. A client could otherwise post
 * `amount: 1` and settle a three thousand dollar wedding. The browser says
 * WHICH payment it is making, never how much it is worth.
 *
 * Authentication is the same email plus password the portal already proves on
 * every request. There is no session to hijack because there is no session:
 * each request carries the credentials, so this endpoint is exactly as
 * protected as the one that shows the balance in the first place.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { checkPortalPassword } from './_password.js';
import { createCheckoutSession, isStripeConfigured } from '../_stripe.js';

const WRONG_AUTH_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Row = {
  id: string;
  client_display_name: string | null;
  client_email: string | null;
  client_password_hash: string | null;
  session_type: string | null;
  contract_total_amount: string | null;
  contract_retainer_amount: string | null;
  paid_to_date: string;
  charges_total: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!isStripeConfigured()) {
    // 503, not 500: nothing is broken, the feature is simply not switched on.
    return res.status(503).json({
      success: false,
      error: 'Card payments are not available yet.',
    });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  const kind = req.body?.kind === 'retainer' ? 'retainer' : 'balance';

  if (!email || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Email and password required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      select id, client_display_name, client_email, client_password_hash,
             session_type, contract_total_amount, contract_retainer_amount,
             paid_to_date, charges_total
      from client_portals
      where lower(client_email) = ${email} and mode = 'full'
      limit 1
    `) as Row[];

    const row = rows[0];
    // Same shape as _client.ts: the delay and the identical message make a
    // wrong password and an unknown address indistinguishable, so this cannot
    // be used to discover which addresses have bookings.
    if (!row || !checkPortalPassword(password, row.client_password_hash).ok) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Incorrect email or password' });
    }

    const total = row.contract_total_amount !== null ? parseFloat(row.contract_total_amount) : null;
    if (total === null) {
      return res.status(400).json({
        success: false,
        error: 'There is no amount set on this booking yet.',
      });
    }
    const charges = parseFloat(row.charges_total ?? '0') || 0;
    const paid = parseFloat(row.paid_to_date ?? '0') || 0;
    const retainer =
      row.contract_retainer_amount !== null ? parseFloat(row.contract_retainer_amount) : 0;

    /**
     * What is actually owed right now.
     *
     * The balance is the same arithmetic the other eight places use: total plus
     * charges minus paid, floored at zero. Never total minus paid, which
     * silently drops every charge.
     *
     * The retainer is what is left of the retainer specifically, so a client
     * who has already paid part of it is asked for the remainder rather than
     * the whole thing again. Capped at the outstanding balance so a retainer
     * larger than what is left can never overcharge.
     */
    const outstanding = Math.max(total + charges - paid, 0);
    const amount =
      kind === 'retainer' ? Math.min(Math.max(retainer - paid, 0), outstanding) : outstanding;

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error:
          kind === 'retainer'
            ? 'The retainer is already paid.'
            : 'There is nothing outstanding on this booking.',
      });
    }

    const origin =
      process.env.SITE_ORIGIN ||
      (req.headers.host ? `https://${req.headers.host}` : 'https://vero.photography');

    // Echoed back only when the caller had it, so this can never be used to
    // turn the button on for someone who was not given the opt-in.
    const preview = req.body?.preview === true ? '&cards=1' : '';

    const who = row.client_display_name || 'your session';
    const label =
      kind === 'retainer'
        ? `Retainer for ${who}`
        : `Balance for ${who}`;

    const session = await createCheckoutSession({
      portalId: row.id,
      kind,
      amount,
      clientEmail: row.client_email,
      description: label,
      // The portal reads its own state on load, so returning to it is enough
      // for the client to see the payment reflected. The query flag only
      // decides which message they land on.
      // The preview opt-in has to survive the round trip. Without it the
      // client returns from Stripe to a portal with no card button, which
      // during testing looks exactly like the payment breaking something.
      // Harmless once the mode is 'on', where the flag is ignored anyway.
      successUrl: `${origin}/portal?paid=1${preview}`,
      cancelUrl: `${origin}/portal?paid=0${preview}`,
    });

    return res.status(200).json({ success: true, url: session.url, amount });
  } catch (err) {
    console.error('[portal/pay-start] failed:', err);
    return res.status(500).json({ success: false, error: 'Could not start the payment.' });
  }
}
