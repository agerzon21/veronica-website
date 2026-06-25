/**
 * Download a client's signed contract PDF.
 *
 * POST { email, password }
 *   → 200 application/pdf stream  on success
 *   → 401  on bad credentials
 *   → 404  if the portal has no signed PDF yet
 *
 * The PDF lives in a private Vercel Blob store — the URL stored in the DB
 * isn't directly accessible without the BLOB_READ_WRITE_TOKEN. This
 * endpoint re-authenticates the client (same email+password used to log
 * into the portal), pulls the blob using the token, and streams it back
 * to the browser with a download disposition.
 *
 * Why re-auth on every call: the portal MVP doesn't use session tokens
 * (credentials live in React state only). Every mutating/sensitive
 * endpoint re-validates the same way for consistency.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { get as getBlob } from '@vercel/blob';
import { getDb } from '../_db.js';

const WRONG_AUTH_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Row = {
  client_display_name: string | null;
  client_email: string;
  contract_signed_pdf_url: string | null;
  contract_signed_at: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password =
    typeof req.body?.password === 'string' ? req.body.password.trim() : '';

  if (!email || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Email and password required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      select client_display_name, client_email, contract_signed_pdf_url, contract_signed_at
      from client_portals
      where mode = 'full'
        and lower(client_email) = ${email}
        and client_password = ${password}
      limit 1
    `) as Row[];

    if (rows.length === 0) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Incorrect email or password' });
    }

    const portal = rows[0];
    if (!portal.contract_signed_pdf_url) {
      return res.status(404).json({ success: false, error: 'No signed contract on file.' });
    }

    const blob = await getBlob(portal.contract_signed_pdf_url, {});
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      console.error('[download-contract] blob fetch returned no stream', {
        url: portal.contract_signed_pdf_url,
        statusCode: blob?.statusCode,
      });
      return res.status(500).json({ success: false, error: 'Could not retrieve the contract. Please try again.' });
    }

    const dateLabel = portal.contract_signed_at
      ? new Date(portal.contract_signed_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const downloadName = `Contract — ${portal.client_display_name ?? portal.client_email} — ${dateLabel}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Cache-Control', 'private, no-store');

    // Stream the blob body straight through to the response.
    const reader = blob.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    console.error('[download-contract] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
