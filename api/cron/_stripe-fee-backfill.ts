import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { feeForPaymentIntent, isStripeConfigured } from '../_stripe.js';
import { runGuarded, type CronTrigger } from './_guard.js';

/**
 * Fill in the Stripe fee on card payments that landed without one.
 *
 * WHY THIS EXISTS, found by making a real payment rather than by reading code.
 * The webhook tries to record the fee when the payment arrives, and on the two
 * real test payments it came back null every time. The reason is in the
 * PaymentIntent: `capture_method: "automatic_async"`. The fee does not live on
 * the PaymentIntent or even on the Charge, it lives on the BALANCE
 * TRANSACTION, and that is not created until the charge actually settles,
 * which happens AFTER checkout.session.completed fires. So at webhook time
 * there is genuinely nothing to read.
 *
 * The webhook still tries, because when it works it costs nothing. This is the
 * safety net for when it does not, and it also covers the unrelated case of
 * Stripe being briefly unreachable at exactly the wrong moment.
 *
 * WHY A LATER PASS RATHER THAN A DIFFERENT EVENT. Subscribing to charge.updated
 * would also work, but it needs a dashboard change on every account that ever
 * runs this, including every photographer's account if this is ever sold. A
 * job that re-reads its own unfinished rows needs nothing from anybody and
 * heals whatever it finds.
 *
 * THE FEE IS BOOKKEEPING, NEVER MONEY. `amount` is the gross and it is what
 * settles a client's balance. Nothing here can change what anyone owes: the
 * only column this writes is fee_amount, and the only rows it touches are ones
 * where it is still null. A failure here costs a number in a report.
 *
 * SLOT COST: zero. Underscore-prefixed inside api/cron/, registered in the
 * HANDLERS map in api/cron.ts, and chained from gallery-sync. No new endpoint
 * file, no new vercel.json cron entry. api/ stays 12 of 12.
 */

export const CRON_META = {
  name: 'stripe-fee-backfill',
  path: '/api/cron/stripe-fee-backfill',
  schedule: 'chained daily after gallery-sync',
  description:
    'Fills in the Stripe processing fee on card payments that recorded without one. The fee lives on a balance transaction that does not exist until the charge settles, which is after the webhook fires, so it is read later instead. Drains to zero work once every payment has its fee: a run reporting "0 filled" means everything is already done, not that it failed. Never touches what anyone owes.',
} as const;

// Bounded so this shares gallery-sync's invocation safely rather than risking
// a timeout. At this business's volume the queue is a handful of rows, so it
// drains on the first run and reports zero forever after.
const MAX_PER_RUN = 40;
const DEADLINE_MS = 20_000;

/**
 * How far back to look.
 *
 * A payment whose fee is still missing after a week is not waiting on
 * settlement, it is a row Stripe will never answer for: a deleted test payment,
 * a sandbox wiped between experiments, an account that changed. Retrying those
 * forever would mean every run doing work that can never succeed, and the job
 * would never reach the honest "nothing to do" state that makes it safe to
 * ignore.
 */
const LOOKBACK_DAYS = 7;

type Row = {
  id: string;
  processor_payment_id: string;
  processor_account_id: string | null;
};

export async function backfillStripeFees(): Promise<{
  considered: number;
  filled: number;
  stillMissing: number;
  skipped: string | null;
}> {
  if (!isStripeConfigured()) {
    return { considered: 0, filled: 0, stillMissing: 0, skipped: 'Stripe is not configured' };
  }

  const sql = getDb();
  const rows = (await sql`
    select id, processor_payment_id, processor_account_id
    from payment_entries
    where source = 'stripe'
      and fee_amount is null
      and processor_payment_id is not null
      and created_at > now() - make_interval(days => ${LOOKBACK_DAYS})
    order by created_at desc
    limit ${MAX_PER_RUN}
  `) as Row[];

  const startedAt = Date.now();
  let filled = 0;

  for (const row of rows) {
    // Checked between rows rather than raced against, so a slow Stripe cannot
    // take the whole invocation down with it. Whatever is left is simply
    // picked up by the next run.
    if (Date.now() - startedAt > DEADLINE_MS) break;

    const fee = await feeForPaymentIntent(row.processor_payment_id, row.processor_account_id);
    if (fee === null) continue;

    // Re-checks `fee_amount is null` in the WHERE rather than trusting the
    // read above: the webhook may have won the race while this was working,
    // and the first answer is as good as the second.
    // RETURNING, so `filled` counts rows that actually changed. The guard on
    // `fee_amount is null` exists precisely because the webhook may have won
    // the race, and in that case this UPDATE matches nothing. Incrementing
    // regardless made the run report work it had not done, in the one number
    // anybody reads to decide whether the job is healthy.
    const written = (await sql`
      update payment_entries
      set fee_amount = ${fee}
      where id = ${row.id} and fee_amount is null
      returning id
    `) as Array<{ id: string }>;
    if (written.length > 0) filled += 1;
  }

  return {
    considered: rows.length,
    filled,
    stillMissing: rows.length - filled,
    skipped: null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const trigger = (req.query?.trigger as CronTrigger) ?? 'schedule';
  const result = await runGuarded({ ...CRON_META, trigger }, backfillStripeFees);
  return res.status(200).json(result);
}
