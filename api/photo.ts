/**
 * Photo proxy — fetches a Drive file through our origin so the browser can
 * fetch() it without hitting CORS. Used by the client-portal lightbox to
 * pre-fetch the image for the Web Share API (which requires a File object,
 * which requires fetch(), which requires no CORS block).
 *
 * This is the ONLY path that streams Drive bytes through our Vercel origin:
 *   - Desktop gallery thumbnails use drive.google.com/thumbnail directly.
 *   - Desktop "Download" uses drive.google.com/uc?export=download directly.
 *   - Only the mobile "Save to Photos" share flow goes through here.
 *
 * Why resize: Veronika's originals are 10-25MB each. A client browsing
 * their gallery on mobile pre-fetches every tapped photo through this
 * endpoint — a 50-photo gallery view at full res = ~750MB origin transfer.
 * That blew our Vercel Hobby quota in two days. A 2400px webp is visually
 * indistinguishable on any phone screen (iPhone 15 Pro Max is 2796px wide)
 * but ~10x smaller.
 *
 * Clients who want the full-res original use the "Open original" link in
 * the modal — that points straight at Drive's viewer (driveViewUrl), no
 * proxy involvement.
 *
 * Two response modes:
 *   default  — resized webp (~2400px, q82). Buffered, ~1-2MB, served with
 *              `immutable` cache so Vercel's CDN + the browser both cache it.
 *   ?full=1  — original file, streamed. No caller uses this today; kept as
 *              a hook for future "download original via proxy" needs.
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fileId = typeof req.query.id === 'string' ? req.query.id : '';
  const wantFull = req.query.full === '1';

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

    if (wantFull) {
      // Originals path — stream through unchanged. Used for downloads,
      // where the client explicitly wants the full-res file. We don't
      // try to cache these (large + rare).
      const contentType = (file.headers['content-type'] as string) || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      (file.data as NodeJS.ReadableStream).pipe(res);
      return;
    }

    // Display path — resize + buffer + cache aggressively.
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
