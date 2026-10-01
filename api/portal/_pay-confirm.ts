/**
 * The client's browser, back from Stripe, records its own payment.
 *
 * POST { email, password, session_id }
 *   → 200 { success, status, paid_to_date }
 *     status: 'recorded'  this call put the payment in the ledger
 *             'already'   it was already there (usually the webhook got here first)
 *             'not-paid'  Stripe does not say paid yet (a delayed method)
 *
 * WHY THIS EXISTS. The webhook used to be the only road into the ledger, so a
 * lost delivery (a wrong signing secret, a disabled endpoint, three days of
 * failures) left a client who had paid looking at an unchanged balance and a
 * Pay button, with the return banner promising "it went through". Paying again
 * was the natural next move. Now the page asks this endpoint, which asks
 * STRIPE, and records the payment if Stripe says it is paid.
 *
 * NOTHING HERE IS TAKEN FROM THE URL BUT THE SESSION ID, and that only names
 * which session to look up. Whether it is paid, how much, and whose booking it
 * belongs to all come from Stripe, and the booking must be the one the signed
 * in client owns: a session id copied from someone else's link does nothing.
 *
 * The same recorder as the webhook (api/_checkout-record.ts), keyed on the
 * PaymentIntent, so the two racing each other record the money once.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { checkPortalPassword } from './_password.js';
import { isStripeConfigured, isStripeTestMode, retrieveCheckoutSession } from '../_stripe.js';
import { recordPaidCheckoutSession } from '../_checkout-record.js';

const WRONG_AUTH_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!isStripeConfigured()) {
    return res.status(503).json({ success: false, error: 'Card payments are not available.' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  const sessionId = typeof req.body?.session_id === 'string' ? req.body.session_id.trim() : '';

  if (!email || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Email and password required' });
  }
  // Stripe's own shape, checked before it goes anywhere near a URL path.
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return res.status(400).json({ success: false, error: 'No payment to confirm.' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      select id, client_password_hash
      from client_portals
      where lower(client_email) = ${email} and mode = 'full'
      limit 1
    `) as Array<{ id: string; client_password_hash: string | null }>;
    const row = rows[0];
    if (!row || !checkPortalPassword(password, row.client_password_hash).ok) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Incorrect email or password' });
    }

    const session = await retrieveCheckoutSession(sessionId);

    // Somebody else's session, or one from the other Stripe mode: not ours to
    // record, and no hint either way about what it was.
    if (session.metadata?.portal_id !== row.id) {
      return res.status(404).json({ success: false, error: 'No payment to confirm.' });
    }
    if (typeof session.livemode === 'boolean' && session.livemode === isStripeTestMode()) {
      return res.status(404).json({ success: false, error: 'No payment to confirm.' });
    }

    const result = await recordPaidCheckoutSession(session, {
      source: 'return',
      // The client is back, so the money moved moments ago. The webhook, when
      // it lands, finds this row and changes nothing.
      paidAtSeconds: Math.floor(Date.now() / 1000),
    });

    if (result.status === 'recorded' || result.status === 'already') {
      if (result.status === 'recorded') {
        console.log(`[portal/pay-confirm] recorded ${result.amount} for portal ${row.id} from the return, before the webhook`);
      }
      return res.status(200).json({ success: true, status: result.status, paid_to_date: result.paidToDate });
    }
    if (result.status === 'not-paid') {
      return res.status(200).json({ success: true, status: 'not-paid' });
    }
    return res.status(200).json({ success: false, status: 'unusable', error: 'This payment needs a look from Vero.' });
  } catch (err) {
    console.error('[portal/pay-confirm] failed:', err);
    return res.status(500).json({ success: false, error: 'Could not confirm the payment yet.' });
  }
}
