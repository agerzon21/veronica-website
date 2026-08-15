/**
 * Super-admin only: invoke a cron handler on demand.
 *
 * POST { password, name }
 *   → 200 { success, payload }   (whatever the cron's JSON response was)
 *   → 400 unknown cron name
 *   → 401 wrong password
 *   → 403 admin-level (not super)
 *   → 405 non-POST
 *   → 500 the handler threw / returned a non-2xx
 *
 * We invoke the handler in-process (imported from api/cron.ts's
 * HANDLERS map) rather than fetch()ing /api/cron/{name} externally.
 * Two reasons:
 *   - No CRON_SECRET plumbing needed here; we've already validated
 *     super-admin. The bearer-header path exists to guard the public
 *     /api/cron URL from random internet visitors.
 *   - Avoids a self-fetch that has to know the deployment URL (which
 *     varies by env: prod, preview, local). Local dev "just works".
 *
 * The cron's own handler reads `req.query.trigger` to distinguish
 * scheduled vs. manual runs — we set it to 'manual' here so history
 * rows are labeled correctly.
 *
 * Response body captures what the cron replied with, whether success
 * or error, so the UI can surface any useful detail (skipped, error
 * message, sync stats, etc.) without a second history round-trip.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin, requireSuper } from '../_admin-auth.js';
import { HANDLERS } from '../cron.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });
  const superCheck = requireSuper(auth.level);
  if (!superCheck.ok) return res.status(superCheck.status).json({ success: false, error: superCheck.error });

  const name = req.body?.name;
  if (typeof name !== 'string' || !name || !HANDLERS[name]) {
    return res
      .status(400)
      .json({ success: false, error: `Unknown cron name '${name}'` });
  }

  // Capture the cron's res.json() call so we can wrap it in our own
  // { success, payload } envelope. Vercel's res doesn't give us a
  // straightforward interception; the simplest thing is a light
  // shim that satisfies the shape the handlers rely on.
  const captured: { status: number; body: unknown } = { status: 200, body: null };
  const shim = {
    setHeader: () => shim,
    status(code: number) {
      captured.status = code;
      return shim;
    },
    json(body: unknown) {
      captured.body = body;
      return shim;
    },
    end() {
      return shim;
    },
  } as unknown as VercelResponse;

  // Freshly-shaped req so we don't mutate the admin's req.query in
  // ways the caller might not expect. Trigger flag tells the guard to
  // record 'manual'.
  const cronReq = {
    ...req,
    query: { ...(req.query ?? {}), trigger: 'manual' },
    method: 'GET',
    body: undefined,
  } as unknown as VercelRequest;

  try {
    await HANDLERS[name](cronReq, shim);
  } catch (err) {
    console.error(`[admin/crons-run-now/${name}] handler threw:`, err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // The handler already recorded a cron_runs row via runGuarded(),
  // so we just relay whatever it decided about its own outcome. A
  // non-2xx from the cron itself surfaces as a failed "Run now" in
  // the UI even though the HTTP wrapper succeeded.
  const ok = captured.status >= 200 && captured.status < 300;
  return res.status(ok ? 200 : 500).json({
    success: ok,
    payload: captured.body,
  });
}
