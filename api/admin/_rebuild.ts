/**
 * Rebuild the site — POST the Vercel Deploy Hook so the prerendered static
 * pages are regenerated from current database content.
 *
 * WHY THIS EXISTS
 * Prerendering is a BUILD-time step. scripts/prerender-photos.mjs reads
 * gallery_photos and journal_posts and writes one static HTML file per photo,
 * per category and per journal post, plus the sitemap. Publishing a photo or a
 * journal post writes to the database — it does not rebuild anything. So new
 * content is live for visitors (the SPA fetches it at runtime) while remaining
 * absent from the static HTML that search engines actually read, until the next
 * deploy happens for some unrelated reason.
 *
 * api/cron/_gallery-sync.ts already calls the same hook after a photo sync, and
 * has been logging "VERCEL_DEPLOY_HOOK_URL not set — skipping redeploy trigger"
 * ever since, because the variable was never created. This gives that variable
 * a second caller and, more usefully, a visible one: an unset hook now produces
 * an error on screen instead of one line in a log nobody reads.
 *
 * ACCESS
 * Admin, not super. Publishing content is the job this finishes, and it is
 * idempotent and non-destructive — the worst case is one wasted build.
 *
 * POST { password }
 *   → 200 { success, triggeredAt }
 *   → 401 / 403  auth
 *   → 405 non-POST
 *   → 409 still inside the cooldown  { retryInSeconds }
 *   → 501 hook not configured        { needsSetup: true }
 *   → 502 hook rejected the request
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';
import { getDb } from '../_db.js';
import { triggerDeployHook } from '../_deploy-hook.js';

const STATE_KEY = 'last_rebuild_trigger';

// A production build takes roughly four minutes. Anything faster than this is
// someone clicking twice, and each click is a real build against a finite free
// tier — so refuse rather than queue.
const COOLDOWN_MS = 3 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  if (!process.env.VERCEL_DEPLOY_HOOK_URL) {
    return res.status(501).json({
      success: false,
      needsSetup: true,
      error:
        'No deploy hook configured. In Vercel: Settings → Git → Deploy Hooks, ' +
        'create one for the main branch, then add the URL as VERCEL_DEPLOY_HOOK_URL ' +
        'and redeploy once so the variable is available.',
    });
  }

  const sql = getDb();

  // Cooldown is checked against the database rather than memory because every
  // request may land on a different serverless instance, where a module-level
  // variable would always look empty.
  let last: number | null = null;
  try {
    const rows = (await sql`
      SELECT value FROM system_state WHERE key = ${STATE_KEY}
    `) as { value: string }[];
    if (rows[0]?.value) {
      const parsed = Date.parse(rows[0].value);
      if (!Number.isNaN(parsed)) last = parsed;
    }
  } catch (err) {
    // A cooldown we cannot read is not a reason to block a rebuild.
    console.warn('[rebuild] could not read cooldown state:', err);
  }

  const now = Date.now();
  if (last !== null && now - last < COOLDOWN_MS) {
    return res.status(409).json({
      success: false,
      retryInSeconds: Math.ceil((COOLDOWN_MS - (now - last)) / 1000),
      error: 'A rebuild was just triggered. Give it a few minutes to finish.',
    });
  }

  const hook = await triggerDeployHook('admin-rebuild');
  if (!hook.ok) {
    if (hook.reason === 'unreachable') {
      return res
        .status(502)
        .json({ success: false, error: 'Could not reach Vercel to start the build.' });
    }
    if (hook.reason === 'rejected') {
      return res.status(502).json({
        success: false,
        error: `Vercel rejected the rebuild request (${hook.status}). The hook URL may have been deleted.`,
      });
    }
    // Raced with the variable being removed between the check above and here.
    return res.status(501).json({
      success: false,
      needsSetup: true,
      error: 'No deploy hook configured.',
    });
  }

  const triggeredAt = new Date(now).toISOString();
  // Record only AFTER a confirmed trigger, so a failed attempt does not start a
  // cooldown that blocks the retry.
  try {
    await sql`
      INSERT INTO system_state (key, value, updated_at)
      VALUES (${STATE_KEY}, ${triggeredAt}, now())
      ON CONFLICT (key) DO UPDATE SET value = ${triggeredAt}, updated_at = now()
    `;
  } catch (err) {
    console.warn('[rebuild] could not record cooldown state:', err);
  }

  return res.status(200).json({ success: true, triggeredAt });
}
