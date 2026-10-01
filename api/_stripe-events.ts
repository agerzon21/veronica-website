/**
 * Every Stripe event type the webhook does something with.
 *
 * Its own module, rather than living beside the switch it describes, so the
 * admin panel can read it without importing the webhook handler and dragging
 * raw-body and the whole ledger into the admin function bundle with it.
 *
 * Underscore-prefixed, so Vercel does not expose it as an HTTP route and it
 * costs nothing against the twelve function cap.
 *
 * KEEP IT IN STEP with the switch in api/inbox/_stripe-webhook.ts. An event
 * listed here and not handled is a lie in the other direction: the panel would
 * report a healthy subscription for something we silently drop.
 */
export const HANDLED_EVENTS = [
  'checkout.session.completed',
  // The delayed twin. A card captures in one step; anything slower completes
  // the session as 'processing' and settles later carrying only this.
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  // Both refund paths. charge.refunded needs an API call to read the refunds
  // on a modern API version; refund.created carries them itself.
  'charge.refunded',
  'refund.created',
  // A refund that FAILED (a closed card) puts the money back in the balance,
  // so the negative row has to be undone. refund.failed and
  // charge.refund.updated are handled too, but this one is enough.
  'refund.updated',
  // A dispute takes the money immediately and may give it back months later.
  'charge.dispute.created',
  'charge.dispute.closed',
  // The money movements themselves. An inquiry opens a dispute WITHOUT taking
  // the money, and if it escalates, this is the only event that says so.
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
] as const;

export type HandledEvent = (typeof HANDLED_EVENTS)[number];
