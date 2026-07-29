/**
 * Admin: flip the global AI kill switch (system_state row keyed by
 * 'messaging_ai_state'). Superadmin only — this stops ALL auto
 * replies across every conversation instantly. Nuclear option for
 * when the AI is misbehaving or Vero wants full manual control
 * temporarily.
 *
 * POST { password, state: 'on' | 'off' }
 *   → 200 { success, globalAiState }
 *   → 400 invalid state
 *   → 401 wrong password
 *   → 403 non-super
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin, requireSuper } from '../_admin-auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });
  const superCheck = requireSuper(auth.level);
  if (!superCheck.ok) {
    return res.status(superCheck.status).json({ success: false, error: superCheck.error });
  }

  const state = req.body?.state;
  if (state !== 'on' && state !== 'off') {
    return res.status(400).json({ success: false, error: "state must be 'on' or 'off'" });
  }

  try {
    const sql = getDb();
    await sql`
      INSERT INTO system_state (key, updated_at, value)
      VALUES ('messaging_ai_state', NOW(), ${state})
      ON CONFLICT (key) DO UPDATE SET updated_at = NOW(), value = EXCLUDED.value
    `;
    return res.status(200).json({ success: true, globalAiState: state });
  } catch (err) {
    console.error('[admin/messages-toggle-global] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
