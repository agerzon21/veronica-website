/**
 * Live Instagram feed proxy.
 *
 * GET /api/instagram-feed
 *   → 200 { fetchedAt, profile, posts }
 *   → 500 { error }                       (creds missing or upstream failed)
 *
 * Why this exists: Instagram's Graph API returns media URLs that point at
 * `scontent-iad-X.cdninstagram.com` with a signed query string that expires —
 * typically within hours. Our previous setup baked those URLs into the
 * bundle at build time (scripts/fetch-instagram.mjs), so a few hours after
 * each deploy the production site's Instagram tiles silently start 403'ing.
 *
 * This endpoint refetches on demand. The response is cached at the Vercel
 * edge for 1h with stale-while-revalidate for 24h, so the actual Graph API
 * is hit at most once per hour even under traffic, and a stale-but-working
 * response is served instantly while a fresh one populates the cache.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const POST_LIMIT = 6;

const MEDIA_FIELDS = [
  'id',
  'media_type',
  'media_url',
  'thumbnail_url',
  'permalink',
  'caption',
  'timestamp',
].join(',');

const PROFILE_FIELDS = [
  'id',
  'username',
  'name',
  'biography',
  'profile_picture_url',
  'followers_count',
  'media_count',
  'account_type',
].join(',');

type IgMedia = {
  id: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  caption?: string;
  timestamp: string;
};

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const token = process.env.IG_ACCESS_TOKEN;
  const userId = process.env.IG_USER_ID;

  if (!token || !userId) {
    return res.status(500).json({ error: 'Instagram credentials not configured' });
  }

  const mediaUrl =
    `https://graph.instagram.com/v21.0/${userId}/media` +
    `?fields=${MEDIA_FIELDS}` +
    `&limit=${POST_LIMIT}` +
    `&access_token=${token}`;

  const profileUrl =
    `https://graph.instagram.com/v21.0/${userId}` +
    `?fields=${PROFILE_FIELDS}` +
    `&access_token=${token}`;

  try {
    const [mediaRes, profileRes] = await Promise.all([
      fetch(mediaUrl),
      fetch(profileUrl),
    ]);

    if (!mediaRes.ok || !profileRes.ok) {
      const failing = !mediaRes.ok ? mediaRes : profileRes;
      console.error(
        `[instagram-feed] Graph API ${failing.status}: ${await failing.text()}`,
      );
      return res.status(502).json({ error: 'Instagram API error' });
    }

    const mediaJson = await mediaRes.json();
    const profileJson = await profileRes.json();

    const posts = ((mediaJson.data ?? []) as IgMedia[])
      // VIDEO posts give us thumbnail_url; IMAGE posts give us media_url.
      .filter((p) => p.media_type !== 'VIDEO' || !!p.thumbnail_url)
      .slice(0, POST_LIMIT)
      .map((p) => ({
        id: p.id,
        url: p.media_type === 'VIDEO' ? p.thumbnail_url! : p.media_url!,
        permalink: p.permalink,
        caption: (p.caption ?? '').slice(0, 280),
        timestamp: p.timestamp,
      }));

    const profile = {
      username: profileJson.username ?? null,
      name: profileJson.name ?? null,
      biography: profileJson.biography ?? null,
      profilePictureUrl: profileJson.profile_picture_url ?? null,
      followersCount: profileJson.followers_count ?? null,
      mediaCount: profileJson.media_count ?? null,
      accountType: profileJson.account_type ?? null,
    };

    // Edge cache: 1h fresh, 24h stale-while-revalidate. Under any traffic
    // pattern this means Instagram's API is hit at most ~once per hour and
    // visitors always get a working response (stale URLs that haven't yet
    // expired are still served while a fresh fetch populates in the
    // background).
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      profile,
      posts,
    });
  } catch (err) {
    console.error('[instagram-feed] fetch failed:', err);
    return res.status(500).json({ error: 'Instagram unavailable' });
  }
}
