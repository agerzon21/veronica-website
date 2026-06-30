/**
 * Photo proxy — fetches a Drive file through our origin so the browser can
 * fetch() it without hitting CORS, AND so downloads can use a smaller
 * resized version instead of the 10-25MB originals.
 *
 * This is the ONLY path that streams Drive bytes through our Vercel origin.
 * Gallery thumbnails go to drive.google.com/thumbnail directly. The "Open
 * original" escape hatch in the modal points at Drive's viewer (driveViewUrl)
 * so users who genuinely need full-res don't hit our quota.
 *
 * Response modes (driven by query params):
 *
 *   /api/photo?id=X
 *     → resized webp (~2400px, q82). Buffered, ~1-2MB, served with
 *       `immutable` cache so Vercel's CDN + the browser both cache it.
 *       Used by the mobile share pre-fetch (Web Share API).
 *
 *   /api/photo?id=X&filename=foo.webp
 *     → resized webp + Content-Disposition: attachment. Triggers an
 *       in-page Save dialog. Used by the desktop "Download" button so
 *       clients get a share-friendly file without leaving the gallery.
 *
 *   /api/photo?id=X&full=1
 *     → original file, streamed inline. No caller uses this today.
 *
 *   /api/photo?id=X&full=1&filename=foo.jpg
 *     → original file, streamed with attachment disposition. Reserved
 *       for a future "download full-res via proxy" button if we ever
 *       want one — for now full-res downloads go to Drive directly.
 *
 * Why resize for the default path: Veronika's originals are 10-25MB.
 * Serving full-res to every gallery view + every mobile share pre-fetch
 * burned ~750MB per gallery visit and blew our Vercel Hobby quota in
 * two days. A 2400px webp is visually indistinguishable on phone screens
 * (iPhone 15 Pro Max is 2796px wide) and ~10x smaller.
 *
 * Trust model: the file IDs we serve are already publicly accessible via
 * Drive's "anyone with link" sharing (set by Veronika on the parent folder).
 * Proxying them through our endpoint doesn't reduce security — we're just a
 * CORS-friendly middleman.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import sharp from 'sharp';

const DISPLAY_MAX_WIDTH = 2400;
const DISPLAY_WEBP_QUALITY = 82;

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

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

// RFC 5987 dual encoding for Content-Disposition filenames. Non-ASCII
// characters in photo names (em dashes, accents, etc) would otherwise
// crash the response header on some HTTP stacks.
function attachmentHeader(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  const utf8Encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fileId = typeof req.query.id === 'string' ? req.query.id : '';
  const wantFull = req.query.full === '1';
  const filename = typeof req.query.filename === 'string' ? req.query.filename : '';

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

    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filename) res.setHeader('Content-Disposition', attachmentHeader(filename));

    if (wantFull) {
      // Originals path — stream through unchanged. No caller uses this
      // today; kept as a hook in case we ever want "download full-res
      // via proxy" instead of sending users to Drive.
      const contentType = (file.headers['content-type'] as string) || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      (file.data as NodeJS.ReadableStream).pipe(res);
      return;
    }

    // Resized path — buffer + cache aggressively. Same bytes whether
    // we serve inline or as attachment, so cache headers are identical.
    const original = await streamToBuffer(file.data as NodeJS.ReadableStream);
    const resized = await sharp(original)
      .rotate() // honor EXIF orientation
      .resize({ width: DISPLAY_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: DISPLAY_WEBP_QUALITY })
      .toBuffer();

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', resized.length.toString());
    // 30 days; the file ID changes if Veronika re-uploads, so this is safe.
    res.setHeader('Cache-Control', 'public, max-age=2592000, s-maxage=2592000, immutable');
    res.status(200).end(resized);
  } catch (err) {
    console.error('[photo] proxy failed for', fileId, err);
    return res.status(500).json({ error: 'Failed to fetch photo' });
  }
}
