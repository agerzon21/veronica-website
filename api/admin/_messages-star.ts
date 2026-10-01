/**
 * Admin: star a conversation to work on, or unstar it.
 *
 * POST { password, conversationId, starred: boolean }  → 200 { success }
 *
 * Alex, 2026-10-01: go through the inbox, star the threads worth working on,
 * then show only those (the Starred filter on the Messages list). The star is
 * a time (migration 050) so the order things were starred is kept.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId : '';
  const starred = req.body?.starred;
  if (!conversationId || typeof starred !== 'boolean') {
    return res.status(400).json({ success: false, error: 'conversationId and starred are required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      UPDATE conversations
      SET starred_at = ${starred ? new Date().toISOString() : null}, updated_at = NOW()
      WHERE id = ${conversationId}
      RETURNING id
    `) as Array<{ id: string }>;
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/messages-star] failed:', err);
    return res.status(500).json({ success: false, error: 'Could not save the star.' });
  }
}
