/**
 * Admin: stream the signed contract PDF for a portal.
 *
 * POST { password, id }
 *   → 200 application/pdf stream
 *   → 401 / 403 on bad / insufficient admin auth
 *   → 404 if portal doesn't exist or hasn't been signed yet
 *
 * Mirror of /api/portal/download-contract, but auth'd via the admin
 * password instead of the client's email+password. Lets Vero open a
 * signed contract from the admin detail view without having to dig
 * through her inbox.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { get as getBlob } from '@vercel/blob';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

type Row = {
  client_display_name: string | null;
  client_email: string | null;
  contract_signed_pdf_url: string | null;
  contract_signed_at: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!id) return res.status(400).json({ success: false, error: 'id required' });

  try {
    const sql = getDb();
    const rows = (await sql`
      select client_display_name, client_email, contract_signed_pdf_url, contract_signed_at
      from client_portals where id = ${id} limit 1
    `) as Row[];
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Portal not found' });
    const portal = rows[0];
    if (!portal.contract_signed_pdf_url) {
      return res.status(404).json({ success: false, error: 'No signed contract on file.' });
    }

    const blob = await getBlob(portal.contract_signed_pdf_url, { access: 'private' });
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      console.error('[admin/portal-pdf] blob fetch returned no stream', {
        url: portal.contract_signed_pdf_url,
        statusCode: blob?.statusCode,
      });
      return res.status(500).json({ success: false, error: 'Could not retrieve the contract. Please try again.' });
    }

    const dateLabel = portal.contract_signed_at
      ? new Date(portal.contract_signed_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const downloadName = `Contract — ${portal.client_display_name ?? portal.client_email ?? 'client'} — ${dateLabel}.pdf`;
    const asciiFallback = downloadName.replace(/[^\x20-\x7E]/g, '-');
    const encodedName = encodeURIComponent(downloadName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');

    const reader = blob.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    console.error('[admin/portal-pdf] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
