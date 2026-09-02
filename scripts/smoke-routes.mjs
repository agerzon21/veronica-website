/**
 * Route smoke test — asserts what the build-time reachability check cannot.
 *
 * WHY THIS EXISTS
 * scripts/prerender-photos.mjs verifies every sitemap URL is LINKED. It cannot
 * verify any of them is SERVED, because at build time there is no server. On
 * 2026-09-01 that distinction took the site down: "cleanUrls": true made
 * Vercel's filesystem phase terminal, so every SPA-only route (/about,
 * /contact, /portal, /admin, ...) stopped falling through to the catch-all
 * rewrite and 404'd. The build printed "243 reachable, 0 unreachable" and went
 * green, and a post-deploy crawl agreed, because both counted links.
 *
 * This asks the only question that would have caught it: what status, and what
 * content, does the server actually return for every route?
 *
 * USAGE
 *   node scripts/smoke-routes.mjs <baseUrl> [--bypass <secret>]
 *
 *   node scripts/smoke-routes.mjs http://localhost:3000
 *   node scripts/smoke-routes.mjs https://vero.photography
 *   node scripts/smoke-routes.mjs https://<preview>.vercel.app --bypass $SECRET
 *
 * --bypass sends x-vercel-protection-bypass, so a preview behind Deployment
 * Protection can be swept without making it public. Preview deploys returning
 * 302-to-SSO for every request is why the routing change above shipped
 * unverified in the first place.
 *
 * Exits non-zero if any route fails. Intended to gate a merge, not to inform.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';

// So the bypass secret can live in .env.local (or Vercel's env) and never has
// to be pasted anywhere. Same convention as scripts/prerender-photos.mjs.
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const args = process.argv.slice(2);
const base = (args[0] || '').replace(/\/$/, '');
if (!base || !/^https?:\/\//.test(base)) {
  console.error('usage: node scripts/smoke-routes.mjs <baseUrl> [--bypass <secret>]');
  process.exit(2);
}
const bypassIdx = args.indexOf('--bypass');
const bypass = bypassIdx !== -1 ? args[bypassIdx + 1] : process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const headers = {
  'user-agent': 'vero-smoke-routes',
  ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
};

/**
 * Routes come from App.tsx rather than a list maintained here, so adding a page
 * cannot silently escape the sweep. Parameterised segments are filled from the
 * live sitemap below.
 */
const appTsx = readFileSync(join(repoRoot, 'src/App.tsx'), 'utf-8');
const declaredRoutes = [...appTsx.matchAll(/path="(\/[^"]*)"/g)].map((m) => m[1]);

const res0 = await fetch(`${base}/sitemap.xml`, { headers });
if (!res0.ok) {
  console.error(`FAIL: /sitemap.xml returned ${res0.status}`);
  process.exit(1);
}
const sitemap = await res0.text();
const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
  m[1].replace(/^https?:\/\/[^/]+/, ''),
);

const sample = (re) => sitemapPaths.find((p) => re.test(p));
const fillParams = (route) => {
  if (!route.includes(':')) return route;
  if (route === '/gallery/:category') return sample(/^\/gallery\/[^/]+$/);
  if (route === '/photo/:category/:photoId') return sample(/^\/photo\//);
  if (route === '/journal/:slug') return sample(/^\/journal\/[^/]+$/);
  return null; // portal/reset etc. need tokens — not smoke-testable
};

const routes = new Set();
for (const r of declaredRoutes) {
  const filled = fillParams(r);
  if (filled) routes.add(filled);
}
for (const p of sitemapPaths) routes.add(p);
routes.add('/robots.txt');
routes.add('/sitemap.xml');

/**
 * Pages we PRERENDER must serve their own <title>. Without this the sweep goes
 * green on the failure mode the journal work is in right now: the files build,
 * nothing routes to them, and every URL 200s while serving the homepage shell.
 */
const mustHaveOwnTitle = [
  // Every category and every journal page — both are small sets and both are
  // exactly where "generated but not routed" hides. Plus a sample of photo
  // pages, which are numerous and all built by the same loop.
  ...sitemapPaths.filter((p) => /^\/gallery\/[^/]+$/.test(p)),
  ...sitemapPaths.filter((p) => /^\/journal\/[^/]+$/.test(p)),
  ...sitemapPaths.filter((p) => /^\/photo\//.test(p)).slice(0, 5),
];

const list = [...routes];
const failures = [];
let checked = 0;

const homepageTitle = await (async () => {
  const r = await fetch(`${base}/`, { headers });
  const t = (await r.text()).match(/<title>([^<]*)<\/title>/);
  return t ? t[1] : '';
})();

for (let i = 0; i < list.length; i += 10) {
  await Promise.all(
    list.slice(i, i + 10).map(async (path) => {
      try {
        const r = await fetch(base + path, { headers, redirect: 'manual' });
        checked++;
        if (r.status !== 200) {
          failures.push(`${path} -> ${r.status}`);
          return;
        }
        if (mustHaveOwnTitle.includes(path)) {
          const t = (await r.text()).match(/<title>([^<]*)<\/title>/);
          const title = t ? t[1] : '';
          if (!title || title === homepageTitle) {
            failures.push(`${path} -> 200 but serving the homepage title (not prerender-served)`);
          }
        }
      } catch (err) {
        failures.push(`${path} -> ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );
}

console.log(`Swept ${checked} routes against ${base}`);
console.log(`  from App.tsx: ${declaredRoutes.length} declared`);
console.log(`  from sitemap: ${sitemapPaths.length}`);
console.log(`  prerender-served assertions: ${mustHaveOwnTitle.length}`);

if (failures.length) {
  console.error(`\n${failures.length} FAILURE(S):`);
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log('\nAll routes returned 200 and every prerendered page served its own title.');
