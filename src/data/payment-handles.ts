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
 * What a card payment costs us, and therefore what sending money directly saves.
 *
 * WHY A DISCOUNT AND NOT A SURCHARGE. Adding a fee on top of the price when a
 * client pays by card is legally a surcharge, and the Durbin Amendment forbids
 * surcharging DEBIT cards outright, even when the customer runs one as credit.
 * Stripe Checkout accepts debit and the card's funding type is not knowable
 * until after it is entered, so a flat "card costs more" rule would break
 * federal law on an unknown share of payments. A discount for paying another
 * way is the same arithmetic from the other end, is explicitly permitted, needs
 * no registration with the card networks, and has no debit exception.
 *
 * So the contract total IS the card price. Zelle, Venmo and Cash App get money
 * off, and the round number on the contract stays round.
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
 * What to send by Zelle, Venmo or Cash App instead, to leave us the same money.
 *
 * Never more than the card price, and never below zero, so a tiny balance
 * cannot invert into the client being owed money.
 */
export function cashPrice(cardPrice: number): number {
  if (!Number.isFinite(cardPrice) || cardPrice <= 0) return 0;
  const cents = toCents(cardPrice) - toCents(cardFeeOn(cardPrice));
  return Math.max(cents, 0) / 100;
}

/** What the client saves by not using a card. Zero when there is nothing to save. */
export function cashSaving(cardPrice: number): number {
  if (!Number.isFinite(cardPrice) || cardPrice <= 0) return 0;
  return (toCents(cardPrice) - toCents(cashPrice(cardPrice))) / 100;
}

/**
 * The card price that leaves us EXACTLY `direct` after Stripe takes its cut.
 *
 * The inverse of cardFeeOn, and the piece that lets the number a client sends
 * directly be the clean one. Vero decides she wants $750 in hand; this says
 * the card price has to be $772.45, because Stripe takes 2.9% of THAT plus 30
 * cents, not 2.9% of $750.
 *
 *   direct = card - (card * rate + fixed)
 *   card   = (direct + fixed) / (1 - rate)
 *
 * WHY THE PRICE IS STORED THIS WAY ROUND, and it is not a detail.
 *
 * Adding a fee on top of a stated price when somebody pays by card is a
 * SURCHARGE. Surcharging a debit card is prohibited outright by the Durbin
 * Amendment, federally, in every state, and Stripe Checkout accepts debit
 * cards without telling us which is which. Surcharging credit cards is legal
 * in most states but carries conditions: advance notice to the card networks,
 * a cap at the cost of acceptance, and disclosure at the point of sale.
 *
 * Offering a DISCOUNT for not using a card is permitted everywhere, on every
 * card type, with no notice and no registration. It is the same arithmetic
 * seen from the other end.
 *
 * So the contract's total is the CARD price, and paying directly is
 * discounted by the fee. The client still reads what the owner wanted them to
 * read, "send $750, or $772.45 by card", and we are on the legal side of the
 * line rather than the one that ends in a Stripe account review.
 *
 * Rounded UP to the cent, because rounding down leaves us short.
 */
export function cardPriceFor(direct: number): number {
  if (!Number.isFinite(direct) || direct <= 0) return 0;
  const cents = Math.ceil((toCents(direct) + toCents(CARD_FEE.fixed)) / (1 - CARD_FEE.rate));
  return cents / 100;
}

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
