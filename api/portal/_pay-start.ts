/**
 * Client portal: start a card payment.
 *
 * POST { email, password, kind: 'retainer' | 'balance' | 'tip', tipAmount?: number }
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
 * A TIP IS THE ONE EXCEPTION, and it is safe for the reason the rule exists.
 * The rule protects against a client paying LESS than they owe. A tip settles
 * nothing, so understating it takes nothing from anyone: the worst a hostile
 * client achieves is tipping less than they meant to. The guard below is
 * therefore about fat fingers rather than fraud, and it is a floor, a ceiling
 * and a rounding, not a lookup. Migration 043 keeps the money out of the
 * balance once it lands.
 *
 * Authentication is the same email plus password the portal already proves on
 * every request. There is no session to hijack because there is no session:
 * each request carries the credentials, so this endpoint is exactly as
 * protected as the one that shows the balance in the first place.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { checkPortalPassword } from './_password.js';
import { createCheckoutSession, isStripeConfigured, isStripeTestMode } from '../_stripe.js';
import { CARD_PAYMENTS_MODE } from '../../src/data/payment-handles.js';

const WRONG_AUTH_DELAY_MS = 750;

/**
 * Floor on a tip, in dollars.
 *
 * Stripe takes 2.9% plus 30 cents, so a 1 dollar tip arrives as 67 cents. That
 * is a poor ratio and it is still the client's call: refusing a dollar somebody
 * meant to give is worse than passing a third of it to Stripe. Below a dollar
 * there is nothing left to pass on, which is where the floor sits.
 */
const TIP_MIN = 1;

/**
 * The ceiling is a FAT FINGER GUARD, not a business rule.
 *
 * It used to be the booking total, which sounds sensible and is not: on a
 * small booking it put every sane tip out of range. A $2 test booking had a
 * ceiling of $5, so typing $10 was refused and the button never enabled. The
 * booking still raises the ceiling on a big job, it just cannot lower it below
 * an amount anybody might genuinely mean.
 */
const TIP_CEILING_FLOOR = 500;
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
  tips_total: string;
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

  /**
   * The kill switch, enforced HERE and not only in the browser.
   *
   * CARD_PAYMENTS_MODE was read by the portal UI alone, so 'off' hid the
   * button without closing the endpoint: a POST with a valid email and
   * password still opened a real Stripe Checkout session. A switch that only
   * removes the button is not a switch, it is a suggestion, and the one moment
   * it matters is the moment something has gone wrong and it gets set to 'off'.
   */
  if (CARD_PAYMENTS_MODE === 'off') {
    return res.status(503).json({
      success: false,
      error: 'Card payments are not available yet.',
    });
  }

  /**
   * The combination that sends a real client to a test checkout.
   *
   * 'on' means every client sees the button. Test keys mean the checkout that
   * opens cannot take their money: a real card is declined on a test session,
   * which reads to the client as their card being refused by this business.
   * That is exactly the failure 'preview' exists to prevent, and it is the
   * state the system lands in if the flag is flipped before the live keys are
   * swapped in, which is the likelier order because the flag is in the repo
   * and the keys are in Vercel.
   *
   * Refused rather than logged. There is no version of this where letting the
   * charge proceed is better than an honest "not available yet".
   */
  if (CARD_PAYMENTS_MODE === 'on' && isStripeTestMode()) {
    console.error(
      '[portal/pay-start] CARD_PAYMENTS_MODE is "on" but STRIPE_SECRET_KEY is a TEST key. ' +
        'Refusing to send a client to a checkout that cannot take their money. ' +
        'Swap the live keys in Vercel, or set the mode back to preview.',
    );
    return res.status(503).json({
      success: false,
      error: 'Card payments are not available yet.',
    });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  const asked = req.body?.kind;
  const kind: 'retainer' | 'balance' | 'tip' =
    asked === 'retainer' ? 'retainer' : asked === 'tip' ? 'tip' : 'balance';

  if (!email || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Email and password required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      select id, client_display_name, client_email, client_password_hash,
             session_type, contract_total_amount, contract_retainer_amount,
             paid_to_date, charges_total,
             coalesce((
               select sum(amount) from payment_entries
               where client_portal_id = client_portals.id
                 and kind = 'tip' and status = 'succeeded'
             ), 0) as tips_total
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
    const tipsTotal = parseFloat(row.tips_total ?? '0') || 0;

    let amount: number;
    if (kind === 'tip') {
      /**
       * The only amount in this file that comes from the browser.
       *
       * Rounded to cents before anything else, because a tip arrives from a
       * text input and 12.005 is a real thing a person types. Then floored and
       * capped. The ceiling is the booking itself: nobody means to tip more
       * than the entire session cost, and a client who genuinely does can send
       * it by any of the other methods, where a human sees the number.
       */
      const raw = Number(req.body?.tipAmount);
      if (!Number.isFinite(raw) || raw <= 0) {
        return res.status(400).json({ success: false, error: 'Choose a tip amount first.' });
      }
      amount = Math.round(raw * 100) / 100;
      if (amount < TIP_MIN) {
        return res.status(400).json({
          success: false,
          error: `The smallest tip we can take by card is $${TIP_MIN}.`,
        });
      }
      const ceiling = Math.max(total + charges, TIP_CEILING_FLOOR);
      if (amount > ceiling) {
        return res.status(400).json({
          success: false,
          error: `The most we can take by card is $${ceiling.toFixed(2)}. Send more than that any other way and it all reaches her.`,
        });
      }
    } else if (kind === 'retainer') {
      amount = Math.min(Math.max(retainer - paid, 0), outstanding);
    } else {
      amount = outstanding;
    }

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
        : kind === 'tip'
          ? `Tip for ${who}`
          : `Balance for ${who}`;

    const session = await createCheckoutSession({
      portalId: row.id,
      kind,
      amount,
      /**
       * Part of the idempotency key: once money lands, a later payment of the
       * same amount must open a NEW session rather than replay this one.
       *
       * For a tip that has to be the TIPS total, not paid_to_date. A tip never
       * moves paid_to_date (migration 043), so keying on it would leave the
       * number identical before and after, and a client tipping the same
       * amount twice inside Stripe's 24 hour idempotency window would be
       * handed back the completed first session. The second tip would silently
       * never happen.
       */
      paidToDate: kind === 'tip' ? tipsTotal : paid,
      clientEmail: row.client_email,
      description: label,
      // The portal reads its own state on load, so returning to it is enough
      // for the client to see the payment reflected. The query flag only
      // decides which message they land on.
      // The preview opt-in has to survive the round trip. Without it the
      // client returns from Stripe to a portal with no card button, which
      // during testing looks exactly like the payment breaking something.
      // Harmless once the mode is 'on', where the flag is ignored anyway.
      // The hash brings a tipper back to the tip, not to the top of a long
      // page they then have to find their place in again.
      successUrl: `${origin}/portal?paid=1${kind === 'tip' ? '&tip=1#thanks' : ''}${preview}`,
      cancelUrl: `${origin}/portal?paid=0${preview}`,
    });

    return res.status(200).json({ success: true, url: session.url, amount });
  } catch (err) {
    console.error('[portal/pay-start] failed:', err);
    return res.status(500).json({ success: false, error: 'Could not start the payment.' });
  }
}
