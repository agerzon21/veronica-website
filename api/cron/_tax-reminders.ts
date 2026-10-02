/**
 * Daily: email Alex before a tax deadline, so nothing is late again.
 *
 * WHY THIS EXISTS. The Q2 2026 sales tax return was filed two and a half
 * months late because nothing anywhere said it was due. Every deadline that
 * applies to the business is listed in src/data/tax-calendar.ts; this sends an
 * email 14 days before each one, again 3 days before, and once more if it
 * passes undone. Each of those is sent once (system_state, REMINDED_KEY), and
 * a deadline marked done on the Taxes page, or a sales tax quarter marked
 * filed on its card, stops them.
 *
 * Chained from instagram-check, which already runs every morning and already
 * emails Alex, with its own guard and try/catch so neither job can stop the
 * other. Runnable from the Crons panel like the others.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendEmail } from '../_auto-reply.js';
import { runGuarded, type CronTrigger } from './_guard.js';
import { getDb } from '../_db.js';
import { readTaxState } from '../admin/_tax-deadlines.js';
import { TAX_DEADLINES, deadlineIsDone, daysBetween, easternToday } from '../../src/data/tax-calendar.js';

export const CRON_META = {
  name: 'tax-reminders',
  path: '/api/cron/tax-reminders',
  schedule: 'chained daily after instagram-check',
  description:
    'Emails Alex 14 days and 3 days before each tax deadline on the Taxes page, and once if one passes undone. A deadline marked done, or a sales tax quarter marked filed, gets no more email. "0 sent" is the usual answer.',
} as const;

const REMINDED_KEY = 'tax_reminders_sent';
const ALEX_EMAIL = process.env.ALEX_EMAIL ?? 'agerzon21@gmail.com';
const ADMIN_URL = process.env.ADMIN_URL ?? 'https://vero.photography/admin';

type Stage = '14' | '3' | 'late';

/** `now` is for tests; the job always runs on the real date. */
export async function sendTaxReminders(now: Date = new Date()): Promise<{ sent: number; due: string[] }> {
  const sql = getDb();
  const { done, lastFiledPeriod } = await readTaxState(sql);
  const [row] = (await sql`SELECT value FROM system_state WHERE key = ${REMINDED_KEY}`) as Array<{ value: string | null }>;
  let reminded: Record<string, Stage[]> = {};
  try {
    reminded = row?.value ? (JSON.parse(row.value) as Record<string, Stage[]>) : {};
  } catch {
    reminded = {};
  }

  const today = easternToday(now);
  const due: string[] = [];
  let sent = 0;
  for (const d of TAX_DEADLINES) {
    if (deadlineIsDone(d, done, lastFiledPeriod)) continue;
    const left = daysBetween(today, d.due);
    const stage: Stage | null = left < 0 ? 'late' : left <= 3 ? '3' : left <= 14 ? '14' : null;
    if (!stage) continue;
    due.push(`${d.key} (${left} days)`);
    const already = reminded[d.key] ?? [];
    if (already.includes(stage)) continue;

    const when =
      left < 0 ? `was due ${d.due}` : left === 0 ? 'is due TODAY' : left === 1 ? 'is due tomorrow' : `is due in ${left} days, on ${d.due}`;
    const lines = [
      `${d.title.en} ${when}.`,
      d.detail.en,
      ...(d.onlyIf ? [`Only if: ${d.onlyIf.en}`] : []),
      ...(d.link ? [`${d.link.label.en}: ${d.link.href}`] : []),
      `Mark it done under Menu, Taxes, and these reminders stop: ${ADMIN_URL}`,
    ];
    await sendEmail({
      to: ALEX_EMAIL,
      subject: `[Vero Admin] Tax ${left < 0 ? 'overdue' : `due ${left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`}`}: ${d.title.en}`,
      text: lines.join('\n\n') + '\n',
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:560px">${lines
        .map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
        .join('')}</div>`,
    });
    // Recorded after each send, so a failure part way through never repeats
    // the ones already sent.
    reminded[d.key] = [...already, stage];
    await sql`
      INSERT INTO system_state (key, value, updated_at)
      VALUES (${REMINDED_KEY}, ${JSON.stringify(reminded)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    sent++;
  }
  return { sent, due };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const trigger = (req.query?.trigger as CronTrigger) ?? 'schedule';
  const outcome = await runGuarded({ ...CRON_META, trigger }, () => sendTaxReminders());
  return res.status(200).json(outcome);
}
