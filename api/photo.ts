/**
 * Photo proxy — streams a Drive file through our origin so the browser can
 * fetch() it without hitting CORS. Used by the client-portal lightbox to
 * pre-load the image for the Web Share API (which requires a File object,
 * which requires fetch(), which requires no CORS block).
 *
 * Drive's `uc?export=view` endpoint doesn't include
 * Access-Control-Allow-Origin headers for our domain. Trying to fetch it
 * cross-origin from the browser fails silently — the share button then
 * has no file to hand to the OS, and the "Save to Photos" flow never
 * triggers.
 *
 * Trust model: the file IDs we'd be serving are already publicly accessible
 * via Drive's own "anyone with link" sharing (set by Veronika on the parent
 * folder). Proxying them through our endpoint doesn't reduce security —
 * we're just being a CORS-friendly middleman.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

let cachedAuth: ReturnType<typeof google.auth.GoogleAuth.prototype.getClient> | null = null;

function getAuthClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is missing');
  const credentials = JSON.parse(raw) as Record<string, string>;
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  if (!cachedAuth) cachedAuth = auth.getClient();
  return cachedAuth;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fileId = typeof req.query.id === 'string' ? req.query.id : '';
  // Drive file IDs are 28-44 chars of [A-Za-z0-9_-]. Reject anything else
  // to avoid using this endpoint as an open redirect / SSRF vector.
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(fileId)) {
    return res.status(400).json({ error: 'Invalid file ID' });
  }

  try {
    const authClient = await getAuthClient();
    const drive = google.drive({ version: 'v3', auth: authClient as any });
    const file = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' },
    );

    const contentType = (file.headers['content-type'] as string) || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    // Same-origin in practice, but be explicit for the fetch case.
    res.setHeader('Access-Control-Allow-Origin', '*');

    // file.data is a Readable stream; pipe it through the response.
    (file.data as NodeJS.ReadableStream).pipe(res);
  } catch (err) {
    console.error('[photo] proxy failed for', fileId, err);
    return res.status(500).json({ error: 'Failed to fetch photo' });
  }
}
