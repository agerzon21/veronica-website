/**
 * Daily reminder cron for the Instagram token rotation.
 *
 * Reads `system_state.updated_at` for key='ig_token_refreshed' (upserted
 * by the "Mark as Refreshed" button in the admin UI). If it's been more
 * than REMIND_AFTER_DAYS since the last rotation, email Alex with the
 * exact steps to run the local rotation script + link to Vercel env
 * vars. If already reminded today, no-op (dedupes via a second
 * system_state key so a redeploy or manual invocation doesn't re-send).
 *
 * Deliberately does NOT attempt to refresh the token itself. Alex owns
 * the rotation — runs `scripts/refresh-instagram-token.mjs` locally,
 * pastes into Vercel, clicks Mark as Refreshed. This cron is a
 * reminder, not automation.
 *
 * Runs daily at 12:00 UTC (see vercel.json crons). Vercel Hobby's
 * minimum granularity is daily, which is fine — we've got a 10-day
 * buffer built into the alert threshold.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { refreshIgAvatars } from './_ig-avatar-refresh.js';
import { sendEmail } from '../_auto-reply.js';
import { getDb } from '../_db.js';
import { detectAndMarkRotation } from '../_ig-detect.js';
import { runGuarded, type CronTrigger } from './_guard.js';

// Cron metadata registered into cron_jobs on the first run. Kept as a
// const at the top so a grep for "instagram-check" lands on the truth
// (schedule stays in sync with vercel.json by convention — the guard
// re-upserts on every invocation, so any manual drift auto-heals).
const CRON_META = {
  name: 'instagram-check',
  path: '/api/cron/instagram-check',
  schedule: '0 12 * * *',
  description:
    'Daily Instagram upkeep. (1) Refreshes contact profile pictures — Meta pre-signs those URLs and they expire in 24-72h, so without this every avatar in Messages goes blank. (2) Emails Alex when the long-lived token has ~10 days of runway left; reminder only, Alex owns the rotation. NOTE: disabling this stops the avatar refresh too.',
} as const;

// Instagram long-lived tokens are 60 days. Alert at day 50 → 10 days
// of runway to notice + rotate.
const REMIND_AFTER_DAYS = 50;

// Don't re-remind within this many days of the previous email —
// prevents the daily cron from re-emailing every single day once a
// token is overdue and Alex hasn't rotated yet. He'll get one nudge,
// then silence for a week, then another nudge. Not flood.
const REMINDER_COOLDOWN_DAYS = 7;

const ALEX_EMAIL = process.env.ALEX_EMAIL ?? 'agerzon21@gmail.com';

const VERCEL_ENV_LINK =
  process.env.VERCEL_ENV_VAR_LINK ??
  'https://vercel.com/agerzon21/veronica-website/settings/environment-variables';

const ADMIN_LINK =
  process.env.ADMIN_URL ?? 'https://vero.photography/admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // The admin "Run now" button sets ?trigger=manual on the internal
  // fetch so history rows label manual invocations distinctly.
  const rawTrigger = req.query?.trigger;
  const trigger: CronTrigger =
    (Array.isArray(rawTrigger) ? rawTrigger[0] : rawTrigger) === 'manual'
      ? 'manual'
      : 'schedule';

  const result = await runGuarded({ ...CRON_META, trigger }, doInstagramCheck);

  if (result.skipped) {
    return res.status(200).json({ ok: true, action: 'skipped-cron-disabled' });
  }
  if (result.error) {
    return res.status(500).json({ ok: false, error: result.error });
  }
  return res.status(200).json({ ok: true, ...(result.ok ?? {}) });
}

/**
 * The actual reminder logic — separated from the HTTP handler so
 * runGuarded() can time it, catch its throws, and record enabled /
 * disabled cleanly. Returns a small payload the handler splats into
 * the JSON response.
 */
async function doInstagramCheck(): Promise<{ action: string; daysSince?: number }> {
  // Refresh Instagram avatars FIRST. This function has several early returns
  // (no refresh date, already alerted, daysSince < 50, already reminded) and
  // the "nothing to do" path is the common steady state — anything placed
  // after them would never run in normal operation. Wrapped in its own
  // try/catch so an avatar failure can never suppress the token-expiry email,
  // which is this job's actual purpose.
  try {
    const avatars = await refreshIgAvatars();
    console.log(
      `[cron/instagram-check] avatar mirror: mirrored=${avatars.mirrored} failed=${avatars.failed}`,
    );
  } catch (err) {
    console.error(
      '[cron/instagram-check] avatar refresh failed (continuing):',
      err instanceof Error ? err.message : String(err),
    );
  }

  // Auto-detect first: if the env var changed since last cron, mark
  // as refreshed transparently before we evaluate whether to remind.
  // This is what makes the manual "Mark as Refreshed" click optional
  // for the common flow (rotate → paste → redeploy → we notice on
  // the next cron and reset the clock silently).
  try {
    await detectAndMarkRotation();
  } catch (err) {
    console.error('[cron/instagram-check] auto-detect failed (non-fatal):', err);
  }

  const sql = getDb();

  // Read both keys in a single round-trip. `ig_token_refreshed` is
  // the rotation clock; `ig_token_reminded_at` is our dedupe stamp.
  const rows = (await sql`
    SELECT key, updated_at
    FROM system_state
    WHERE key IN ('ig_token_refreshed', 'ig_token_reminded_at')
  `) as Array<{ key: string; updated_at: string }>;

  const refreshedAt = rows.find((r) => r.key === 'ig_token_refreshed')?.updated_at;
  const remindedAt = rows.find((r) => r.key === 'ig_token_reminded_at')?.updated_at;

  if (!refreshedAt) {
    // Table's empty — no rotation date on record. One-shot alert so
    // the situation is noticed; then dedupe kicks in.
    if (recentlyReminded(remindedAt)) {
      return { action: 'silent-no-refresh-date' };
    }
    await sendReminderEmail(null, null);
    await markReminded(sql);
    return { action: 'alerted-no-refresh-date' };
  }

  const daysSince = Math.floor(
    (Date.now() - new Date(refreshedAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysSince < REMIND_AFTER_DAYS) {
    return { action: 'no-op', daysSince };
  }

  if (recentlyReminded(remindedAt)) {
    return { action: 'silent-already-reminded', daysSince };
  }

  await sendReminderEmail(refreshedAt, daysSince);
  await markReminded(sql);
  return { action: 'reminded', daysSince };
}

function recentlyReminded(remindedAt: string | undefined): boolean {
  if (!remindedAt) return false;
  const daysSinceReminded =
    (Date.now() - new Date(remindedAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceReminded < REMINDER_COOLDOWN_DAYS;
}

async function markReminded(sql: ReturnType<typeof getDb>) {
  await sql`
    INSERT INTO system_state (key, updated_at)
    VALUES ('ig_token_reminded_at', NOW())
    ON CONFLICT (key) DO UPDATE SET updated_at = NOW()
  `;
}

async function sendReminderEmail(refreshedAt: string | null, daysSince: number | null) {
  const runwayLine =
    refreshedAt && daysSince !== null
      ? `The token was last rotated ${daysSince} days ago (${new Date(refreshedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}). Meta's 60-day expiry window is approaching — time to rotate.`
      : `No token rotation date is on record. Rotate now to establish a baseline, or run the DB migration in db/migrations/002-system-state.sql if you haven't already.`;

  const text = `Time to rotate the Instagram token.

${runwayLine}

Steps (takes ~2 minutes):

  1. Open VS Code in the VeronicaWebsite repo
  2. Terminal → run:
     IG_ACCESS_TOKEN=<current-token-from-vercel> node scripts/refresh-instagram-token.mjs
  3. Copy the new token from the script output
  4. Vercel → Settings → Environment Variables → edit IG_ACCESS_TOKEN → paste → Save
     ${VERCEL_ENV_LINK}
  5. Vercel → Deployments → ⋯ on latest → Redeploy
  6. Come back to ${ADMIN_LINK} → Integrations → click "Mark as Refreshed"

The site keeps working while you rotate — this email is a reminder, not an emergency. But if the token expires (past day 60) auto-refresh no longer works and you'd need a full re-mint via developers.facebook.com.
`;

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;">
  <div style="max-width:560px;margin:32px auto;background:#fff;padding:32px;border:1px solid #eaeaea;">
    <div style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#c9a96e;font-weight:500;margin-bottom:8px;">
      Vero Photography · Reminder
    </div>
    <h1 style="font-size:22px;font-weight:300;margin:0 0 16px;color:#222;">Rotate the Instagram token</h1>
    <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 20px;">
      ${runwayLine}
    </p>

    <div style="border-left:3px solid #c9a96e;padding:12px 16px;background:#fdf9f0;margin:0 0 20px;">
      <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8a6e35;font-weight:500;margin-bottom:8px;">
        Steps (~2 minutes)
      </div>
      <ol style="font-size:13px;line-height:1.7;color:#444;margin:0;padding-left:20px;">
        <li>Open VS Code in the VeronicaWebsite repo</li>
        <li>In the terminal, run:
          <div style="margin:6px 0 4px;background:#1e1e1e;color:#d4d4d4;padding:8px 10px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:11px;border-radius:2px;word-break:break-all;">IG_ACCESS_TOKEN=&lt;current-token&gt; node scripts/refresh-instagram-token.mjs</div>
        </li>
        <li>Copy the new token from the output</li>
        <li>
          <a href="${VERCEL_ENV_LINK}" style="color:#c9a96e;">Open Vercel env vars</a>, edit <code style="background:#f4f4f4;padding:2px 6px;border-radius:2px;font-size:11px;">IG_ACCESS_TOKEN</code>, paste, save
        </li>
        <li>Vercel Deployments → ⋯ on latest → Redeploy</li>
        <li><a href="${ADMIN_LINK}" style="color:#c9a96e;">Open /admin</a> → Integrations → click <strong>Mark as Refreshed</strong></li>
      </ol>
    </div>

    <p style="font-size:12px;color:#999;line-height:1.5;margin:24px 0 0;border-top:1px solid #eee;padding-top:16px;">
      This is an automated reminder from the daily cron in api/cron/_instagram-check.ts. If you've already rotated but not marked it, click "Mark as Refreshed" in /admin to reset this reminder for another ~50 days.
    </p>
  </div>
</body>
</html>`;

  await sendEmail({
    to: ALEX_EMAIL,
    subject: '[Vero Admin] Time to rotate the Instagram token',
    text,
    html,
  });
}
