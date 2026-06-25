/**
 * Admin: patch an existing portal.
 *
 * POST { password, id, patch: {...editable fields} }
 *   → 200 { success }
 *   → 401 on bad admin password
 *   → 404 if portal not found
 *   → 409 if gallery_password collides
 *
 * Editable fields (each independently optional):
 *   client_display_name, client_email, event_date, session_type,
 *   drive_url, gallery_password, gallery_enabled
 *
 * Contract fields (only editable while contract_status != 'signed'):
 *   contract_total_amount, contract_retainer_amount
 *
 * We deliberately don't expose contract_body editing here — once a
 * portal is in pending or signed state, the body is frozen. To "change
 * the contract" she'd void the portal and create a new one.
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

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  const patch = (req.body?.patch ?? {}) as Record<string, unknown>;
  if (!id) return res.status(400).json({ success: false, error: 'id required' });

  try {
    const sql = getDb();
    const existing = (await sql`
      select id, contract_status from client_portals where id = ${id} limit 1
    `) as Array<{ id: string; contract_status: string }>;
    if (existing.length === 0) return res.status(404).json({ success: false, error: 'Portal not found' });

    // Gallery password uniqueness check
    if (typeof patch.gallery_password === 'string') {
      const newPwd = patch.gallery_password.trim();
      if (!newPwd) return res.status(400).json({ success: false, error: 'Gallery password cannot be empty.' });
      const collision = (await sql`
        select 1 from client_portals
        where gallery_password = ${newPwd} and id <> ${id}
        limit 1
      `) as Array<{ '?column?': number }>;
      if (collision.length > 0) {
        return res.status(409).json({ success: false, error: 'That gallery password is already in use.' });
      }
    }

    // Block financial edits once contract is signed
    const contractFrozen = existing[0].contract_status === 'signed';
    if (
      contractFrozen &&
      (patch.contract_total_amount !== undefined ||
        patch.contract_retainer_amount !== undefined)
    ) {
      return res.status(409).json({
        success: false,
        error: 'Contract amounts cannot change after the contract is signed.',
      });
    }

    // Apply each field individually with parameterized SQL. Using
    // multiple short statements keeps the dynamic-SQL footprint
    // minimal — much easier to keep safe than a query builder.
    const setStr = (col: string, val: unknown) =>
      typeof val === 'string' ? val.trim() : null;

    if (typeof patch.client_display_name === 'string') {
      await sql`update client_portals set client_display_name = ${setStr('client_display_name', patch.client_display_name)}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.client_email === 'string') {
      await sql`update client_portals set client_email = ${setStr('client_email', patch.client_email).toLowerCase()}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.event_date === 'string') {
      const v = patch.event_date.trim() || null;
      await sql`update client_portals set event_date = ${v}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.session_type === 'string') {
      await sql`update client_portals set session_type = ${setStr('session_type', patch.session_type)}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.drive_url === 'string') {
      const v = patch.drive_url.trim() || null;
      await sql`update client_portals set drive_url = ${v}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.gallery_password === 'string') {
      await sql`update client_portals set gallery_password = ${patch.gallery_password.trim()}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.gallery_enabled === 'boolean') {
      await sql`update client_portals set gallery_enabled = ${patch.gallery_enabled}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.contract_total_amount === 'number' && !contractFrozen) {
      await sql`update client_portals set contract_total_amount = ${patch.contract_total_amount}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.contract_retainer_amount === 'number' && !contractFrozen) {
      await sql`update client_portals set contract_retainer_amount = ${patch.contract_retainer_amount}, updated_at = now() where id = ${id}`;
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/portal-update] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
