/**
 * The client's email conversation, found or started (2026-10-25).
 *
 * POST { password, portal_id } → 200 { success, conversation_id, created }
 *
 * The Email button on a client's record used to open a mailto: link, so a
 * message to a client went out of Apple Mail, without the signature, and
 * never appeared in Messages, where every other word to that client lives.
 * Now it opens the client's email thread here instead, and if there has
 * never been one (a client booked by phone, say) it starts one.
 *
 * One email conversation per address is the inbox's own rule (the unique
 * key on platform + external_user_id that _inbox-record.ts upserts on), so
 * this is the same upsert, keyed the same way: an address that writes in
 * later lands in this thread rather than a second one. The booking is
 * linked to the thread only when the thread has no booking yet, so a link
 * Vero made by hand is never moved.
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

  const portalId = typeof req.body?.portal_id === 'string' ? req.body.portal_id.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(portalId)) {
    return res.status(400).json({ success: false, error: 'portal_id is required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      select client_email, client_display_name, partner_1_full_name
      from client_portals where id = ${portalId}
    `) as Array<{ client_email: string | null; client_display_name: string | null; partner_1_full_name: string | null }>;
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Client not found' });
    const email = (rows[0].client_email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'This client has no email address on file.' });
    }
    const name = rows[0].partner_1_full_name?.trim() || rows[0].client_display_name?.trim() || null;

    const existing = (await sql`
      select id from conversations where platform = 'email' and external_user_id = ${email} limit 1
    `) as Array<{ id: string }>;
    const convo = (await sql`
      insert into conversations (platform, external_user_id, contact_name, contact_handle, linked_client_portal_id)
      values ('email', ${email}, ${name}, ${email}, ${portalId})
      on conflict (platform, external_user_id) do update
        set contact_name = coalesce(conversations.contact_name, excluded.contact_name),
            linked_client_portal_id = coalesce(conversations.linked_client_portal_id, excluded.linked_client_portal_id),
            updated_at = now()
      returning id
    `) as Array<{ id: string }>;

    return res.status(200).json({ success: true, conversation_id: convo[0].id, created: existing.length === 0 });
  } catch (err) {
    console.error('[admin/messages-open-client] failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
