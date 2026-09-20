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
 * Whether clients can pay by card yet, in three states rather than two.
 *
 * ONE constant, read by both prompt builders below and by the client portal,
 * so the day card payments go live the assistant stops telling people the old
 * answer. That failure is silent and outward facing: the customer-facing reply
 * engine tells strangers in the Instagram inbox how this business takes money,
 * and it would carry on saying "Venmo, Zelle or Cash App" to every new lead for
 * as long as nobody remembered this file.
 *
 *   'off'      nobody sees a card button. The state before a Stripe account
 *              exists at all.
 *
 *   'preview'  the button renders ONLY when the URL carries ?cards=1. This
 *              exists because the middle of the work is genuinely dangerous:
 *              the Stripe keys are TEST keys while there are real bookings
 *              with real outstanding balances, so a client tapping the button
 *              would reach a test checkout and have their real card declined,
 *              which is worse than having no button at all. A real client will
 *              never add a query parameter they were not given.
 *
 *   'on'       everyone. Only correct once the Stripe account is activated and
 *              the LIVE keys are in place, because this state plus test keys
 *              is exactly the failure 'preview' exists to prevent.
 *
 * The assistant treats anything other than 'off' as "cards exist", since by
 * the time we are testing them Vero should not be told they are impossible.
 */
export type CardPaymentsMode = 'off' | 'preview' | 'on';

export const CARD_PAYMENTS_MODE: CardPaymentsMode = 'off';

/** True when cards are real for ordinary clients. */
export const CARD_PAYMENTS_ENABLED = (CARD_PAYMENTS_MODE as CardPaymentsMode) === 'on';

/**
 * Should THIS page render the card button?
 *
 * Takes the query string rather than reading window, so it is testable and so
 * it cannot explode during a server render.
 */
export function cardPaymentsVisible(search = ''): boolean {
  const mode = CARD_PAYMENTS_MODE as CardPaymentsMode;
  if (mode === 'on') return true;
  if (mode !== 'preview') return false;
  try {
    return new URLSearchParams(search).get('cards') === '1';
  } catch {
    return false;
  }
}

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
- Cash App: ${PAYMENT_HANDLES.cashapp}${
    CARD_PAYMENTS_MODE === 'on'
      ? `
- Credit or debit card: the client pays from their own portal, there is no
  handle to give out. Card payments appear in the payments list automatically
  and must not be deleted, because the money really moved.`
      : CARD_PAYMENTS_MODE === 'preview'
        ? `
- Credit or debit card: BEING TESTED, not live for clients yet. If Vero asks,
  say it is nearly ready but not switched on, and do not promise a date. Do not
  tell a client to pay by card.`
        : `
Cards are NOT accepted yet. If Vero asks whether a client can pay by card, say
not yet rather than guessing, and do not promise a date.`
  }
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
  // Only when cards are real for ordinary clients. In 'preview' the keys are
  // test keys, so telling a lead they can pay by card would be a promise the
  // checkout page cannot keep.
  const methods = CARD_PAYMENTS_ENABLED
    ? 'by credit or debit card straight from their client portal, or by Venmo, Zelle or Cash App'
    : 'by Venmo, Zelle or Cash App';
  return `Payment: clients pay ${methods}, and the exact details appear in their own client portal once a contract is signed. Never put a payment handle in a message: point them at their portal instead. A date is not held until the retainer arrives.`;
}
