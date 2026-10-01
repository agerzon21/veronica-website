/**
 * Money problems, told to a person.
 *
 * WHY THIS EXISTS. Every branch of the payment path that cannot record money
 * used to end in console.error and nothing else, and Vercel keeps runtime logs
 * for about an hour on this plan. So the cases that matter most (a card
 * payment sitting in Stripe with no booking to credit, a refund we could not
 * place) were invisible unless somebody happened to be watching the log at
 * that minute. Stripe's own "your endpoint is failing" email, three days
 * later, was the only alarm.
 *
 * Now each such case lands in two places: an email to Alex, and a short list
 * in system_state ('payment_issues') that the admin panel and the daily
 * reconciliation read. The list is keyed, so Stripe retrying the same event
 * forty times produces one entry and one email, not forty.
 *
 * BEST EFFORT, and it never throws. Failing to REPORT a problem must not turn
 * into failing to HANDLE the event: the webhook's response code is decided by
 * whether the money was recorded, not by whether an email went out.
 *
 * Underscore-prefixed so Vercel does not expose it as a route.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './_db.js';
import { sendEmail, escapeHtml } from './_auto-reply.js';

const ALERT_TO = process.env.ALEX_EMAIL ?? 'agerzon21@gmail.com';
const STATE_KEY = 'payment_issues';
/** Enough history to see a pattern, small enough to stay one text cell. */
const KEEP = 100;
/** A resolved issue is remembered this long, so the daily check cannot re-raise it. */
const RESOLVED_MEMORY_MS = 30 * 86_400_000;

export type PaymentIssue = {
  /**
   * Stable for the same underlying problem: an event id, a session id, a
   * refund id. A second report with the same key is dropped, which is what
   * keeps a retried webhook from emailing the same thing every few minutes.
   */
  key: string;
  /** One line a person can act on, naming the booking or payment. */
  summary: string;
  /** What to do about it, when there is something specific. */
  action?: string;
  source: 'webhook' | 'reconcile' | 'return';
  /** ISO time it was first seen. Filled in here. */
  at?: string;
  /**
   * Unique to one report. Filled in here, and how a report tells that its own
   * entry is the one that was stored: two at once can share a millisecond.
   */
  id?: string;
  /**
   * Set when a person marks it handled. KEPT rather than deleted, because the
   * daily reconciliation would otherwise find the same unresolvable thing
   * tomorrow (a payment with no booking on it stays that way) and email it
   * again every day for two weeks.
   */
  resolvedAt?: string;
};

/** Every remembered issue, open or resolved, newest last. Never throws. */
export async function readPaymentIssues(sql = getDb()): Promise<PaymentIssue[]> {
  try {
    const rows = (await sql`
      select value from system_state where key = ${STATE_KEY} limit 1
    `) as Array<{ value: string | null }>;
    const parsed = JSON.parse(rows[0]?.value ?? '[]');
    return Array.isArray(parsed) ? (parsed as PaymentIssue[]) : [];
  } catch {
    return [];
  }
}

/** The ones still waiting on a person. */
export async function openPaymentIssues(sql = getDb()): Promise<PaymentIssue[]> {
  return (await readPaymentIssues(sql)).filter((e) => !e.resolvedAt);
}

/**
 * Record a problem and email Alex, once per key, EVER: a key that was already
 * reported, whether still open or since resolved, is not reported again.
 *
 * Returns whether this was NEW, so a caller can tell the first report from a
 * retry if it wants to. Never throws.
 */
export async function reportPaymentIssue(issue: PaymentIssue): Promise<boolean> {
  const sql = getDb();
  const entry: PaymentIssue = { ...issue, at: new Date().toISOString(), id: randomUUID() };
  let isNew = false;
  try {
    /*
     * ONE statement, not read-then-write. Stripe delivers events in parallel
     * and the daily check can overlap a webhook, and with a read in JS two
     * reports landing together both read the old list and the second write
     * erased the first. Here the upsert holds the row lock, so the second
     * waits, then sees the first one's entry when it decides.
     */
    const rows = (await sql`
      insert into system_state (key, value, updated_at)
      values (${STATE_KEY}, ${JSON.stringify([entry])}, now())
      on conflict (key) do update set
        value = (
          select case
            when exists (select 1 from jsonb_array_elements(cur.list) e where e->>'key' = ${issue.key})
              then cur.list::text
            else (
              select jsonb_agg(e order by i)::text
              from jsonb_array_elements(cur.list || ${JSON.stringify([entry])}::jsonb) with ordinality as t(e, i)
              where i > jsonb_array_length(cur.list) + 1 - ${KEEP}
            )
          end
          from (
            select case when jsonb_typeof(raw.v) = 'array' then raw.v else '[]'::jsonb end as list
            from (select coalesce(nullif(system_state.value, ''), '[]')::jsonb as v) raw
          ) cur
        ),
        updated_at = now()
      returning value
    `) as Array<{ value: string }>;
    const stored = JSON.parse(rows[0]?.value ?? '[]') as PaymentIssue[];
    // Ours is in the list only if it was appended rather than found.
    if (!stored.some((e) => e.id === entry.id)) return false;
    isNew = true;
  } catch (err) {
    // The database is the usual reason we are here at all. Still try the
    // email: it does not need the database.
    console.error('[payment-alerts] could not store the issue:', err);
    isNew = true;
  }

  try {
    const foundBy =
      issue.source === 'webhook'
        ? 'the Stripe webhook'
        : issue.source === 'reconcile'
          ? 'the daily check against Stripe'
          : 'a client returning from checkout';
    const lines = [
      issue.summary,
      ...(issue.action ? [`What to do: ${issue.action}`] : []),
      `Found by ${foundBy}.`,
      `Reference: ${issue.key}`,
    ];
    await sendEmail({
      to: ALERT_TO,
      subject: `[Vero Admin] Payment needs attention: ${issue.summary.slice(0, 90)}`,
      text: lines.join('\n\n') + '\n',
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:560px">${lines
        .map((l) => `<p style="margin:0 0 12px">${escapeHtml(l)}</p>`)
        .join('')}</div>`,
    });
  } catch (err) {
    console.error('[payment-alerts] could not email the issue:', err, issue);
  }
  return isNew;
}

/**
 * Mark issues handled. They stay in the list, resolved, so the same problem is
 * never raised again, and drop off once resolved for a month. Never throws.
 */
export async function clearPaymentIssues(keys: string[]): Promise<void> {
  const sql = getDb();
  const now = new Date().toISOString();
  try {
    // In place, for the same reason as reportPaymentIssue: a report landing
    // between a read and a write here would be erased by the write.
    await sql`
      update system_state set
        value = coalesce((
          select jsonb_agg(
            case
              when e->>'key' in (select jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb))
                and e->>'resolvedAt' is null
                then e || jsonb_build_object('resolvedAt', ${now}::text)
              else e
            end
            order by i
          )
          from jsonb_array_elements(system_state.value::jsonb) with ordinality as t(e, i)
          where e->>'resolvedAt' is null
            or (e->>'resolvedAt')::timestamptz > ${now}::timestamptz - make_interval(secs => ${RESOLVED_MEMORY_MS / 1000})
        ), '[]'::jsonb)::text,
        updated_at = now()
      where key = ${STATE_KEY}
    `;
  } catch (err) {
    console.error('[payment-alerts] could not resolve issues:', err);
  }
}
