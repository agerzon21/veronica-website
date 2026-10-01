/**
 * Stripe against the ledger, daily. The net under everything else.
 *
 * WHY THIS EXISTS. Every other fix on the payment path makes a failure less
 * likely; none can make it impossible. A webhook can be disabled, a signing
 * secret can be wrong after a rotation, an event can fail for three days and
 * be dropped by Stripe, and in each case the old system's only symptom was an
 * absence that looked exactly like "nothing has happened yet". So once a day
 * this asks Stripe what actually happened over the last two weeks and checks
 * that the ledger agrees.
 *
 *   1. Every PAID checkout must be a ledger row. A missing one is RECORDED, by
 *      the same idempotent writer the webhook and the return path use (keyed
 *      on the PaymentIntent, so it can never double count), and reported.
 *   2. Every refund that moved money must have its negative row, and a refund
 *      that FAILED must not still be counted as returned.
 *   3. Every chargeback that took money must have its negative row.
 *   4. Every card payment in the ledger must exist as a paid checkout (a test
 *      mode payment in the live ledger shows up here).
 *   5. Stripe is asked directly for payment events it could not deliver.
 *
 * Anything it cannot fix itself is emailed once and listed under Integrations
 * (api/_payment-alerts.ts). Refunds and chargebacks are REPORTED rather than
 * written: they are rare, the webhook retries them for three days, and a
 * person should see a ledger disagreement about money that went back out.
 *
 * Chained from gallery-sync (both Hobby cron slots are taken) through its own
 * runGuarded record, so it has its own row in the Crons panel, its own on/off
 * switch, and a Run now button.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import {
  isStripeConfigured,
  isStripeTestMode,
  listAllStripe,
  type StripeCheckoutSession,
} from '../_stripe.js';
import { recordPaidCheckoutSession } from '../_checkout-record.js';
import { reportPaymentIssue } from '../_payment-alerts.js';
import { HANDLED_EVENTS } from '../_stripe-events.js';
import { runGuarded, type CronTrigger } from './_guard.js';

export const CRON_META = {
  name: 'stripe-reconcile',
  path: '/api/cron/stripe-reconcile',
  schedule: 'chained daily after gallery-sync',
  description:
    'Checks the last two weeks of Stripe against the ledger. A paid card checkout missing from the ledger is recorded (it cannot double count) and reported; a refund or chargeback missing from the ledger, a failed refund still counted, a card payment Stripe does not know, and payment events Stripe could not deliver are emailed and listed under Integrations. "0 recorded, 0 issues" is the healthy answer.',
} as const;

/** Two weeks covers Stripe's three days of retries, a missed day, and slow settlement. */
const WINDOW_DAYS = 14;
/** Anything newer than this may still have its webhook on the way. */
const SETTLE_SECONDS = 3600;
/** Shares an invocation with the gallery sync, which must keep the rest of it. */
const DEADLINE_MS = 15_000;

type Refund = { id?: string; amount?: number; status?: string; payment_intent?: unknown };
type Dispute = { id?: string; amount?: number; status?: string; payment_intent?: unknown };
type EventLite = { id?: string; type?: string };

function idOf(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return (v as { id: string }).id;
  return undefined;
}
const usd = (cents: number | undefined) => `$${((cents ?? 0) / 100).toFixed(2)}`;

export type ReconcileResult = {
  skipped: string | null;
  sessionsChecked: number;
  recorded: number;
  refundsChecked: number;
  disputesChecked: number;
  newIssues: number;
  /** False when a deadline cut a list short, so absences were not judged. */
  complete: boolean;
};

export async function reconcileStripe(): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    skipped: null,
    sessionsChecked: 0,
    recorded: 0,
    refundsChecked: 0,
    disputesChecked: 0,
    newIssues: 0,
    complete: true,
  };
  if (!isStripeConfigured()) return { ...result, skipped: 'Stripe is not configured' };

  const sql = getDb();
  const deadline = Date.now() + DEADLINE_MS;
  const nowS = Math.floor(Date.now() / 1000);
  const since = nowS - WINDOW_DAYS * 86_400;
  const until = nowS - SETTLE_SECONDS;
  const live = !isStripeTestMode();
  const createdWindow = { 'created[gte]': since, 'created[lte]': until };
  const report = async (key: string, summary: string, action: string) => {
    if (await reportPaymentIssue({ key, summary, action, source: 'reconcile' })) result.newIssues++;
  };
  /**
   * A booking's name for a sentence a person reads, falling back to its id.
   * The summary is also the alert email's subject, so it has to say WHOSE
   * money in words; the ids go at the end for looking things up.
   */
  const nameOf = async (portalId: string): Promise<string> => {
    try {
      const rows = (await sql`
        select client_display_name from client_portals where id = ${portalId}
      `) as Array<{ client_display_name: string | null }>;
      return rows[0]?.client_display_name || portalId;
    } catch {
      return portalId;
    }
  };
  /** The booking a PaymentIntent was recorded against, if it was. */
  const bookingOf = async (pi: string): Promise<string | null> => {
    const rows = (await sql`
      select client_portal_id from payment_entries where processor_payment_id = ${pi} limit 1
    `) as Array<{ client_portal_id: string }>;
    return rows[0]?.client_portal_id ?? null;
  };
  const rowExists = async (processorId: string): Promise<boolean> => {
    const rows = (await sql`
      select 1 from payment_entries where processor_payment_id = ${processorId} limit 1
    `) as unknown[];
    return rows.length > 0;
  };

  // 1. Every paid checkout is a ledger row.
  let sessions: { items: StripeCheckoutSession[]; complete: boolean } = { items: [], complete: false };
  try {
    sessions = await listAllStripe<StripeCheckoutSession>('/checkout/sessions', { status: 'complete', ...createdWindow }, { deadline });
  } catch (err) {
    await report(
      'reconcile-cannot-read:sessions',
      'The daily check against Stripe could not read checkout sessions, so missing card payments would not be caught.',
      `Give the Stripe key read access to Checkout Sessions. Stripe said: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!sessions.complete) result.complete = false;
  const paidIntents = new Set<string>();
  for (const s of sessions.items) {
    if (s.payment_status !== 'paid') continue;
    if (typeof s.livemode === 'boolean' && s.livemode !== live) continue;
    const pi = idOf(s.payment_intent);
    if (pi) paidIntents.add(pi);
    result.sessionsChecked++;
    try {
      const r = await recordPaidCheckoutSession(s, { source: 'reconcile', paidAtSeconds: s.created ?? null });
      if (r.status === 'recorded') {
        result.recorded++;
        await report(
          `reconciled:${pi ?? s.id}`,
          `A ${usd(s.amount_total)} card payment for ${await nameOf(r.portalId)} was in Stripe but missing from the books. It has now been recorded (checkout ${s.id}).`,
          'Nothing to fix by hand. If this happens again, the webhook is losing payments: check the Stripe webhook under Integrations.',
        );
      }
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      await report(
        `reconcile-failed:${s.id}`,
        `A ${usd(s.amount_total)} card payment could not be recorded: ${
          code === '23503' ? 'the booking it was for no longer exists' : err instanceof Error ? err.message : String(err)
        } (checkout ${s.id}).`,
        'Find it in Stripe and log it on the right booking by hand.',
      );
    }
  }

  // 2. Refunds: money that went back has its row; a failed one is not counted.
  if (Date.now() < deadline) {
    try {
      const refunds = await listAllStripe<Refund>('/refunds', createdWindow, { deadline });
      if (!refunds.complete) result.complete = false;
      for (const rf of refunds.items) {
        const pi = idOf(rf.payment_intent);
        if (!rf.id || !pi) continue;
        const booking = await bookingOf(pi);
        if (!booking) continue; // not a payment of ours, or one step 1 already reported
        result.refundsChecked++;
        const recorded = await rowExists(rf.id);
        if (rf.status === 'failed' || rf.status === 'canceled') {
          if (recorded && !(await rowExists(`${rf.id}:failed`))) {
            await report(
              `refund-failed-counted:${rf.id}`,
              `A ${usd(rf.amount)} refund for ${await nameOf(booking)} ${rf.status} at Stripe, so the money stayed, but the books still count it as returned (refund ${rf.id}).`,
              'Subscribe the webhook to refund.updated in Stripe so this reverses itself, or correct the balance by hand.',
            );
          }
        } else if (!recorded) {
          await report(
            `refund-missing:${rf.id}`,
            `A ${usd(rf.amount)} refund for ${await nameOf(booking)} is in Stripe but not in the books, so the booking still counts that money as paid (refund ${rf.id}).`,
            'The webhook retries for three days; if it is still missing tomorrow, record it by hand as a negative payment.',
          );
        }
      }
    } catch (err) {
      await report(
        'reconcile-cannot-read:refunds',
        'The daily check against Stripe could not read refunds.',
        `Give the Stripe key read access to Refunds. Stripe said: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    result.complete = false;
  }

  // 3. Chargebacks that took money have their row. Inquiries take none.
  if (Date.now() < deadline) {
    try {
      const disputes = await listAllStripe<Dispute>('/disputes', createdWindow, { deadline });
      if (!disputes.complete) result.complete = false;
      for (const d of disputes.items) {
        if (!d.id || (typeof d.status === 'string' && d.status.startsWith('warning_'))) continue;
        const pi = idOf(d.payment_intent);
        if (!pi) continue;
        const booking = await bookingOf(pi);
        if (!booking) continue;
        result.disputesChecked++;
        if (!(await rowExists(d.id))) {
          await report(
            `dispute-missing:${d.id}`,
            `A ${usd(d.amount)} chargeback for ${await nameOf(booking)} is in Stripe but not in the books, so the booking still counts that money as paid (dispute ${d.id}).`,
            'Respond to the dispute in Stripe. Subscribe the webhook to charge.dispute.funds_withdrawn so it records itself.',
          );
        }
      }
    } catch (err) {
      await report(
        'reconcile-cannot-read:disputes',
        'The daily check against Stripe could not read disputes.',
        `Give the Stripe key read access to Disputes. Stripe said: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    result.complete = false;
  }

  // 4. A card payment in the ledger Stripe does not know. Only judged when the
  // whole session list was read, or an unread page would look like a phantom.
  // A day of slack on the ledger side: a session lives under 70 minutes, so its
  // payment lands well inside the window it was created in.
  if (sessions.complete) {
    const rows = (await sql`
      select processor_payment_id as pi, client_portal_id, amount::text as a
      from payment_entries
      where source = 'stripe'
        and kind in ('payment', 'tip')
        and amount > 0
        and processor_payment_id like 'pi\\_%'
        and paid_at >= to_timestamp(${since + 86_400})
        and paid_at <= to_timestamp(${until})
    `) as Array<{ pi: string; client_portal_id: string; a: string }>;
    for (const r of rows) {
      if (!paidIntents.has(r.pi)) {
        await report(
          `phantom:${r.pi}`,
          `A $${parseFloat(r.a).toFixed(2)} card payment for ${await nameOf(r.client_portal_id)} is in the books, but Stripe shows no paid checkout for it (${r.pi}).`,
          'Look the payment id up in Stripe. A test-mode payment that reached the live ledger looks exactly like this.',
        );
      }
    }
  }

  // 5. What Stripe could not deliver in the last three days, asked directly.
  if (Date.now() < deadline) {
    try {
      const failed = await listAllStripe<EventLite>(
        '/events',
        { delivery_success: 'false', 'created[gte]': nowS - 3 * 86_400, types: [...HANDLED_EVENTS] },
        { deadline },
      );
      if (failed.items.length > 0) {
        await report(
          `undelivered:${new Date().toISOString().slice(0, 10)}`,
          `Stripe could not deliver ${failed.items.length} payment event${failed.items.length === 1 ? '' : 's'} to the site in the last three days.`,
          'Check the Stripe webhook under Integrations: it may be disabled, pointed at the wrong address, or using a signing secret that no longer matches the one in Vercel.',
        );
      }
    } catch {
      // A restricted key may not read events. Steps 1 to 4 still stand.
    }
  }

  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const trigger = (req.query?.trigger as CronTrigger) ?? 'schedule';
  const outcome = await runGuarded({ ...CRON_META, trigger }, reconcileStripe);
  return res.status(200).json(outcome);
}
