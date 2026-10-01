/**
 * Admin: close a lead by hand, or reopen it.
 *
 * POST { password, conversationId, closed: true }   → 200 { success }
 * POST { password, conversationId, closed: false }  → 200 { success }
 *
 * A closed lead folds into "Closed leads" at the bottom of the Messages list,
 * with personal and promotional (src/components/AdminMessages.tsx). Vero closes
 * one with "Not interested" on a follow-up suggestion, or Close lead in the
 * filing menu. Leads also close on their own when their date has passed or
 * after two unanswered follow-ups (api/admin/_messages-list.ts).
 *
 * A close is a time (migration 050) and holds only while nothing new is said:
 * a message after it, from either side, reopens the lead, so someone who
 * writes back months later is never buried by an old click.
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
  const closed = req.body?.closed;
  if (!conversationId || typeof closed !== 'boolean') {
    return res.status(400).json({ success: false, error: 'conversationId and closed are required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      UPDATE conversations
      SET closed_at = ${closed ? new Date().toISOString() : null}, updated_at = NOW()
      WHERE id = ${conversationId}
      RETURNING id
    `) as Array<{ id: string }>;
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/messages-close-lead] failed:', err);
    return res.status(500).json({ success: false, error: 'Could not save that.' });
  }
}
