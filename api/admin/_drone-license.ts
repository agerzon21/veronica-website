/**
 * Admin: Vero's progress toward the FAA Part 107 Remote Pilot Certificate.
 *
 * POST { password }                                              → read
 * POST { password, action: 'save-step', step, done, fields }      → write one step
 *   → 200 { success, path }
 *
 * WHY THIS EXISTS. Vero sells drone shots (her Instagram bio says so, and her
 * Google profile lists her as an aerial photographer), and flying for pay
 * needs the FAA's Remote Pilot Certificate. Getting one is a string of steps
 * across IACRA, the testing vendor, a test center, a TSA check and DroneZone,
 * spread over weeks, where a number from one step is needed in a later one
 * (the FTN to book the test, the 17-digit exam ID to apply). The page in
 * src/components/AdminDroneLicense.tsx walks her through it; this keeps her
 * progress and those numbers.
 *
 * BOTH ADMIN LEVELS read AND write. It is her checklist and Alex helps with it,
 * so unlike the sales tax licence (super only, a legal registration) there is
 * no reason to stop either of them ticking a box.
 *
 * Stored in system_state, like the sales tax licence (_license-status.ts):
 * one JSON document that will never be two. Each save rewrites ONE step
 * inside it, in ONE statement, so Alex ticking one step while Vero types into
 * another cannot undo either. Two people saving the same step at the same
 * moment is the only collision left, and the later save wins.
 *
 * NOTHING ELSE GETS IN. Only the steps and fields named in
 * src/data/drone-license.ts are stored, each one trimmed and capped there.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';
import { getDb } from '../_db.js';
import { actorName } from '../_money-history.js';
import {
  cleanDroneFields,
  isDroneStepKey,
  type DronePath,
  type DroneStepState,
} from '../../src/data/drone-license.js';

const KEY = 'drone_license_path';

function parsePath(value: string | null | undefined): DronePath {
  if (!value) return { steps: {} };
  try {
    const parsed = JSON.parse(value) as DronePath;
    return parsed && typeof parsed === 'object' && parsed.steps ? parsed : { steps: {} };
  } catch {
    return { steps: {} };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  try {
    const sql = getDb();
    const action = req.body?.action;

    if (action === 'save-step') {
      const step = req.body?.step;
      if (!isDroneStepKey(step)) {
        return res.status(400).json({ success: false, error: 'Unknown step' });
      }
      const now = new Date();
      const who = await actorName(sql, auth);
      const done = req.body?.done === true;
      // doneAt is kept from the first time it was ticked, unless the page
      // sends one (unticking clears it).
      const doneAtRaw = String(req.body?.done_at ?? '').trim();
      const state: DroneStepState = {
        done,
        doneAt: done ? (/^\d{4}-\d{2}-\d{2}$/.test(doneAtRaw) ? doneAtRaw : now.toISOString().slice(0, 10)) : null,
        fields: cleanDroneFields(step, req.body?.fields),
        updatedAt: now.toISOString(),
        updatedBy: who,
      };
      const first: DronePath = {
        steps: { [step]: state },
        updatedAt: state.updatedAt,
        updatedBy: who,
      };
      // One statement: the step is merged into whatever the row holds at the
      // moment this runs, so a save never carries a stale copy of the others.
      const [row] = (await sql`
        INSERT INTO system_state (key, value, updated_at)
        VALUES (${KEY}, ${JSON.stringify(first)}, NOW())
        ON CONFLICT (key) DO UPDATE SET
          value = (
            COALESCE(system_state.value::jsonb, '{}'::jsonb)
            || jsonb_build_object(
                 'steps',
                 COALESCE(system_state.value::jsonb -> 'steps', '{}'::jsonb)
                   || jsonb_build_object(${step}::text, ${JSON.stringify(state)}::jsonb)
               )
            || jsonb_build_object('updatedAt', ${state.updatedAt}::text, 'updatedBy', ${who}::text)
          )::text,
          updated_at = NOW()
        RETURNING value
      `) as Array<{ value: string }>;
      return res.status(200).json({ success: true, path: parsePath(row?.value) });
    }

    const [row] = (await sql`
      SELECT value FROM system_state WHERE key = ${KEY} LIMIT 1
    `) as Array<{ value: string | null }>;
    return res.status(200).json({ success: true, path: parsePath(row?.value) });
  } catch (err) {
    console.error('[admin/drone-license] failed:', err);
    return res.status(500).json({ success: false, error: 'Could not reach the drone licence record.' });
  }
}
