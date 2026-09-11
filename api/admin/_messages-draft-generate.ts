/**
 * Admin: generate an AI draft for a conversation, on demand.
 *
 * POST { password, conversationId }
 *   → 200 { success: true, body }
 *   → 409 when a draft is already pending (the UI should be showing it)
 *
 * Exists because the automatic pipeline deliberately goes quiet exactly when
 * conversations get serious — the booking bridge switches the AI off the
 * moment payment or contract talk starts — and those are the replies Vero
 * most wants a starting point for. See draftOnDemand in _ai-reply.ts for why
 * an explicit request bypasses the guardrails.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';
import { draftOnDemand } from '../_ai-reply.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const conversationId =
    typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
  if (!conversationId) {
    return res.status(400).json({ success: false, error: 'conversationId is required' });
  }

  try {
    const result = await draftOnDemand(conversationId);
    if (!result.ok) {
      const conflict = result.error.includes('already waiting');
      return res.status(conflict ? 409 : 400).json({ success: false, error: result.error });
    }
    return res.status(200).json({ success: true, body: result.body });
  } catch (err) {
    console.error('[messages-draft-generate] error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
