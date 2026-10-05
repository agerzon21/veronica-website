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

export const CARD_PAYMENTS_MODE: CardPaymentsMode = 'on';

/**
 * What a card payment costs us: Stripe's US card rate.
 *
 * WHO PAYS IT (migration 054, 2026-10-05). On a 'dual' booking, every booking
 * created from that date, the amounts Vero sets are what she KEEPS, and a card
 * payment is grossed up so Stripe's cut comes out of the card payer: $100 is
 * $103.30 by card. Before that, the stored price WAS the card price and Zelle
 * was offered the fee off, which made every card payment land about 3% short
 * of the price Vero had quoted ($18.30 on the first $600). Those bookings are
 * 'single': one price whatever the method, because their contracts state one
 * total and a card payer cannot be asked for more than a signed contract says.
 *
 * WHY BOTH PRICES ARE STATED, CARD FIRST, and never as "a fee for paying by
 * card". A fee added for using a card is a surcharge, and Visa and Mastercard
 * forbid surcharging DEBIT cards (their network rules, not federal law), while
 * Stripe Checkout cannot tell debit from credit before the card is entered. A
 * lower price for paying another way is a cash discount, which every network
 * allows on every card with no registration. Same money, said that way round.
 */
export const CARD_FEE = {
  /** Stripe's US card rate. */
  rate: 0.029,
  /** Stripe's per-transaction charge, in dollars. */
  fixed: 0.3,
} as const;

/** Cents, rounded half up, so two callers never disagree by a penny. */
function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * What Stripe keeps on a card payment of this size.
 *
 * Note this is charged on the amount ACTUALLY charged, which is why the naive
 * "add 2.9% and 30 cents" gross-up comes up short: the fee applies to the
 * larger number too.
 */
export function cardFeeOn(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return toCents(amount * CARD_FEE.rate + CARD_FEE.fixed) / 100;
}

/**
 * The card price that leaves us EXACTLY `direct` after Stripe takes its cut.
 *
 * The inverse of cardFeeOn, and the card price of a 'dual' booking. Vero wants
 * $100 in hand; this says the card price has to be $103.30, because Stripe
 * takes 2.9% of THAT plus 30 cents, not 2.9% of $100 (which would be $103.20
 * and leave her ten cents short).
 *
 *   direct = card - (card * rate + fixed)
 *   card   = (direct + fixed) / (1 - rate)
 *
 * Tax included or not, the same: on a booking that adds sales tax, `direct`
 * already includes it, and what Stripe pays out is exactly what a Zelle payer
 * would have sent. The tax due on the slightly higher card sale is a few cents
 * per hundred dollars, and Vero carries it ("aside from taxes", Alex).
 *
 * Rounded UP to the cent, because rounding down leaves us short.
 */
export function cardPriceFor(direct: number): number {
  if (!Number.isFinite(direct) || direct <= 0) return 0;
  const cents = Math.ceil((toCents(direct) + toCents(CARD_FEE.fixed)) / (1 - CARD_FEE.rate));
  return cents / 100;
}

/**
 * How a booking prices card payments (migration 054). See CARD_FEE above.
 *
 *   single  one price for every method; Vero absorbs the card fee.
 *   dual    the stated amounts are what Vero keeps; a card costs more.
 */
export type CardPricing = 'single' | 'dual';

/**
 * A stored value read back. Anything but 'dual' is 'single', the safe reading:
 * on a database migration 054 has not reached, every booking predates dual
 * pricing, and charging a client more than their signed contract states is the
 * one mistake this must not make.
 */
export function cardPricingOf(v: unknown): CardPricing {
  return v === 'dual' ? 'dual' : 'single';
}

/** What paying `direct` costs by card on this booking. */
export function cardAmountFor(direct: number, pricing: CardPricing): number {
  if (!Number.isFinite(direct) || direct <= 0) return 0;
  return pricing === 'dual' ? cardPriceFor(direct) : direct;
}

/**
 * The method label a waiver row carries, which is how it is recognised.
 *
 * NO LONGER OFFERED (2026-10-05). A waiver was the card fee given back to a
 * client who paid a card-priced booking directly. A 'dual' booking's stated
 * price is already the direct one, and a 'single' booking is one price however
 * it is paid, so there is nothing to give back. No waiver row was ever written
 * in production; the label stays so an old row would still be recognised.
 */
export const CARD_FEE_DISCOUNT_METHOD = 'Card fee discount';

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
  and must not be deleted, because the money really moved.
CARD PRICES. On a booking made from October 5, 2026 the amounts are what Vero
keeps, and paying by card costs the client more, by exactly what Stripe takes
(2.9% plus 30 cents of the card price): a $100 retainer is $103.30 by card.
The contract, the portal and the card checkout all show both prices, so the
client is never surprised. Older bookings have one price whatever the method,
because their signed contracts say so, and Vero absorbs the card fee on them.
Never call the difference a "fee" or a "surcharge" to a client: it is the card
price, and paying by Zelle, Venmo, Cash App or cash is the lower price.`
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
  const cardPrice = CARD_PAYMENTS_ENABLED
    ? ' On bookings made from October 2026, paying by card costs a little more than the other methods, because the card processor keeps a share; each client portal shows exactly what that client pays, so point them there rather than quoting a card price.'
    : '';
  return `Payment: clients pay ${methods}, and the exact details appear in their own client portal once a contract is signed.${cardPrice} Never put a payment handle in a message: point them at their portal instead. A date is not held until the retainer arrives.`;
}
