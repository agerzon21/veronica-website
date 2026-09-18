/**
 * How clients pay, in one place.
 *
 * These used to live inside ClientPortalView, which meant they existed only in
 * the browser bundle. Every client portal shows them on the Next Step panel,
 * and yet the admin assistant could not answer "what's our Venmo?" because
 * nothing on the server had ever seen them. Vero asking her own assistant a
 * question that is printed on every portal page and being told it does not
 * know is the exact failure this file exists to end.
 *
 * `api/` is allowed to import from `src/data` (it already does for the
 * contract template), so the portal and the assistant now read the same
 * constants. Anything added here reaches both.
 */

/** Zelle is bank-app initiated, so there is no public URL, just the number. */
export const PAYMENT_HANDLES = {
  zelle: '(570) 909-5707',
  venmo: '@Alex-Gerzon',
  cashapp: '$AlexGerzon',
} as const;

/**
 * The same facts as prompt lines.
 *
 * Injected as a HOUSE block rather than stored in ai_context, because a row in
 * that table can be edited or deactivated from the panel and this must not be
 * answerable with "I don't know". The handles are Alex's, not a customer's, so
 * there is no privacy reason to keep them off the server.
 *
 * Written for the INTERNAL assistant. The customer-facing reply engine gets a
 * narrower version below: a stranger in the Instagram inbox has no business
 * being handed payment handles before a contract exists.
 */
export function paymentFactsForAdmin(): string {
  return `## HOW CLIENTS PAY (you know this, never say you don't)
Every signed client portal shows these on its "Next Step" panel, under the
retainer or balance amount. They are the same for every client.
- Venmo: ${PAYMENT_HANDLES.venmo}
- Zelle: ${PAYMENT_HANDLES.zelle} (a phone number, sent from the client's own banking app, there is no link)
- Cash App: ${PAYMENT_HANDLES.cashapp}
The account behind all three is Alex's, which is normal and not worth
explaining to a client. Clients are asked to write "retainer" or "balance" in
the payment comment so it can be matched to a booking. A date is not held
until the retainer arrives, even after the contract is signed.
If Vero asks where a client sends money, or what the Venmo is, answer with the
handle directly. Do not tell her to check the portal: she is asking you
because you are faster than the portal.`;
}

/**
 * The customer-facing line. Deliberately short and gated.
 *
 * The reply engine talks to people who have often not booked anything, so it
 * gets told the methods exist and where they appear, not the handles. Someone
 * with a portal already has the numbers in front of them.
 */
export function paymentFactsForCustomerReplies(): string {
  return `Payment: clients pay by Venmo, Zelle or Cash App, and the exact handles appear in their own client portal once a contract is signed. Never put a payment handle in a message: point them at their portal instead. A date is not held until the retainer arrives.`;
}
