#!/usr/bin/env node
/**
 * Refreshes the long-lived Instagram Graph API token.
 *
 * Meta's long-lived tokens last 60 days but can be refreshed any time
 * before expiry. The refreshed token starts a new 60-day window.
 *
 * Run this every ~50 days to keep the integration live forever:
 *   IG_ACCESS_TOKEN=<current-token> node scripts/refresh-instagram-token.mjs
 *
 * It prints the new token; paste it into Vercel → Project → Settings →
 * Environment Variables → IG_ACCESS_TOKEN (overwrite the existing value).
 *
 * Set a calendar reminder for ~Day 50 after each refresh. We don't auto-
 * persist via the Vercel API because that path has fragile edge cases
 * (delete-then-create, env var IDs, etc.) — a 1-minute manual paste
 * every 50 days is more reliable.
 */

const currentToken = process.env.IG_ACCESS_TOKEN;
if (!currentToken) {
  console.error('IG_ACCESS_TOKEN not set in env');
  process.exit(1);
}

const res = await fetch(
  `https://graph.instagram.com/refresh_access_token` +
    `?grant_type=ig_refresh_token&access_token=${currentToken}`,
);
if (!res.ok) {
  console.error(`Refresh failed ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const { access_token, expires_in } = await res.json();
const days = Math.round(expires_in / 86400);

console.log('\n  ── NEW LONG-LIVED TOKEN ──');
console.log(`  ${access_token}`);
console.log(`\n  Expires in: ${days} days`);
console.log('  Paste this into Vercel → Project Settings → Environment Variables → IG_ACCESS_TOKEN');
console.log('  (overwrite the existing value), then trigger a redeploy.\n');
