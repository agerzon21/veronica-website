#!/usr/bin/env node
/**
 * Fetches Veronika's latest Instagram posts via the Instagram Graph API and
 * writes them to src/data/instagram.json for the InstagramFeed component to
 * consume.
 *
 * Runs automatically before `vite build` (see package.json). On Vercel, the
 * env vars below are set in the project settings; locally they're optional
 * — if missing or the fetch fails, we leave whatever instagram.json is
 * already in the repo so dev never breaks.
 *
 * Required env vars (set in Vercel → Project → Settings → Environment
 * Variables):
 *   IG_ACCESS_TOKEN — long-lived Instagram Graph API token (60-day, must be
 *                     refreshed periodically; see refresh-instagram-token.mjs)
 *   IG_USER_ID      — her Instagram User ID (numeric string from /me)
 *
 * The token can be refreshed any time before expiry by hitting:
 *   GET https://graph.instagram.com/refresh_access_token
 *     ?grant_type=ig_refresh_token
 *     &access_token=CURRENT_LONG_LIVED_TOKEN
 * The response returns a new 60-day token. We do this from a Vercel cron
 * weekly so it never expires unattended.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'src', 'data', 'instagram.json');
const POST_LIMIT = 6;

const token = process.env.IG_ACCESS_TOKEN;
const userId = process.env.IG_USER_ID;

if (!token || !userId) {
  console.log(
    '[fetch-instagram] IG_ACCESS_TOKEN / IG_USER_ID not set — skipping ' +
    'fetch and keeping the existing src/data/instagram.json (if any). ' +
    'This is expected in local dev; set both in Vercel for production.',
  );
  process.exit(0);
}

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
  // Fetch profile + media in parallel; both endpoints share the rate limit so
  // we may as well save the round-trip.
  const [mediaRes, profileRes] = await Promise.all([
    fetch(mediaUrl),
    fetch(profileUrl),
  ]);

  if (!mediaRes.ok || !profileRes.ok) {
    const failing = !mediaRes.ok ? mediaRes : profileRes;
    console.error(`[fetch-instagram] API responded ${failing.status}: ${await failing.text()}`);
    console.error(
      '[fetch-instagram] Leaving existing instagram.json in place. ' +
      'Token may have expired — refresh it and redeploy.',
    );
    process.exit(0); // intentionally exit 0 so build still succeeds
  }

  const mediaJson = await mediaRes.json();
  const profileJson = await profileRes.json();

  const posts = (mediaJson.data ?? [])
    // VIDEO posts give us thumbnail_url; IMAGE posts give us media_url.
    // CAROUSEL posts give us the first image as media_url.
    .filter((p) => p.media_type !== 'VIDEO' || p.thumbnail_url)
    .slice(0, POST_LIMIT)
    .map((p) => ({
      id: p.id,
      url: p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url,
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

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      { fetchedAt: new Date().toISOString(), profile, posts },
      null,
      2,
    ),
  );
  console.log(
    `[fetch-instagram] wrote ${posts.length} posts and profile ` +
    `(@${profile.username}, ${profile.followersCount} followers) to ${OUTPUT_PATH}`,
  );
} catch (err) {
  console.error('[fetch-instagram] fetch failed:', err);
  console.error('[fetch-instagram] Leaving existing instagram.json in place.');
  process.exit(0); // never fail the build because of a transient API issue
}
