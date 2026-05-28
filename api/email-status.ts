/**
 * Delivery-status lookup for a sent email.
 *
 * GET /api/email-status?id=<resend-email-id>
 *   → 200 { success: true, status: DeliveryEvent }
 *   → 200 { success: false, status: 'unknown' }   (lookup failed — client keeps polling)
 *   → 400 { success: false }                       (malformed id)
 *
 * The Thank-You page polls this after submitting the contact form so it only
 * shows the green "delivered" state once the recipient's mail server has
 * actually accepted the message — not just when Resend queued it.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDeliveryStatus } from './_auto-reply.js';

// Resend email IDs are UUIDs. Validate before hitting the API so we don't
// forward junk (and don't leak that an arbitrary string was rejected vs not).
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = typeof req.query.id === 'string' ? req.query.id : '';

  if (!ID_RE.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid id' });
  }

  try {
    const status = await getDeliveryStatus(id);
    return res.status(200).json({ success: true, status });
  } catch (err) {
    console.error('[email-status] lookup failed:', err);
    // Soft-fail: report unknown rather than erroring, so the client's poll
    // loop keeps trying until its own timeout instead of giving up early.
    return res.status(200).json({ success: false, status: 'unknown' });
  }
}
