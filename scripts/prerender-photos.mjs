// Pre-render script for individual photo pages. Runs at build time
// (npm build) — generates one static HTML file per published photo
// with proper meta tags so search engines can index the page
// without executing JavaScript.
//
// Data source is now the gallery_photos DB table (via Neon HTTP).
// Images URLs point at the /api/photo proxy (WebP-resized-and-cached
// on demand from Drive) rather than /assets/photos/.../filename.webp
// as they used to.
//
// If DATABASE_URL isn't set (local dev without .env), the script
// logs a warning and skips prerendering + sitemap generation. The
// site still builds; individual photo pages fall back to the SPA
// route. On Vercel, POSTGRES_URL is always available at build.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import { config as loadEnv } from 'dotenv';

// This script previously read no env file at all, so a local `npm run build`
// always took the skip path even with credentials sitting in .env.local.
// quiet: dotenv v17 prints promotional tips into the build log otherwise.
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });

// VERCEL_ENV, not VERCEL — the latter is '1' on preview builds too, and a
// preview should stay buildable when the DB is briefly unreachable.
const isProdBuild = process.env.VERCEL_ENV === 'production';
// Escape hatch so an urgent contract-signing hotfix is never blocked by a
// database blip: ALLOW_PRERENDER_SKIP=1.
const allowSkip = process.env.ALLOW_PRERENDER_SKIP === '1';

const failProd = (msg) => {
  if (isProdBuild && !allowSkip) {
    console.error(`[prerender] FATAL: ${msg}`);
    console.error('[prerender] Refusing to ship a production build with no SEO pages.');
    console.error('[prerender] Override with ALLOW_PRERENDER_SKIP=1 if this is intentional.');
    process.exit(1);
  }
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const templatePath = join(distDir, 'index.html');

const TITLE_SUFFIX = ' | Vero Photography';

// Neon setup — accepts either POSTGRES_URL (matches api/_db.ts
// convention) or DATABASE_URL (common in local .env). No URL → skip.
const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  failProd('no POSTGRES_URL / DATABASE_URL in a production build.');
  console.warn(
    '[prerender] POSTGRES_URL not set — skipping prerender + sitemap generation.',
  );
  process.exit(0);
}

const sql = neon(dbUrl);
const template = readFileSync(templatePath, 'utf-8');

// Retry before giving up: Neon's free tier autosuspends, and the daily
// unattended deploy hook (.github/workflows) can land on a cold database.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let rows;
let lastErr;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    rows = await sql`
      SELECT slug, category, drive_file_id, title, alt, description, keywords
      FROM gallery_photos
      WHERE status = 'published' AND deleted_at IS NULL
    `;
    lastErr = undefined;
    break;
  } catch (err) {
    lastErr = err;
    console.warn(`[prerender] DB query attempt ${attempt + 1}/3 failed: ${err.message}`);
    if (attempt < 2) await sleep(1000 * 2 ** attempt);
  }
}

if (lastErr) {
  console.error('[prerender] DB query failed after 3 attempts:', lastErr.message);
  failProd('could not reach the database.');
  console.warn('[prerender] Continuing with empty photo set — SPA route still works.');
  rows = [];
}

// Shape each row to match what the rest of the script expected
// from the old CSV path (id, url, title-with-suffix, etc.). The
// url now points at the /api/photo proxy since photos live in
// Drive, not the repo.
const photos = rows
  .filter((r) => r.title && r.title.length > 0)
  .map((r) => ({
    id: r.slug,
    category: r.category,
    url: `/api/photo?id=${r.drive_file_id}`,
    alt: r.alt || '',
    title: `${r.title}${TITLE_SUFFIX}`,
    description: r.description || '',
    keywords: Array.isArray(r.keywords) ? r.keywords : [],
  }));

let totalPages = 0;

for (const photo of photos) {
  const pagePath = `photo/${photo.category}/${photo.id}`;
  const outputDir = join(distDir, 'photo', photo.category);
  const outputFile = join(outputDir, `${photo.id}.html`);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const fullUrl = `https://vero.photography/${pagePath}`;
  const imageUrl = `https://vero.photography${photo.url}`;

  const safeTitle = photo.title.replace(/"/g, '&quot;');
  const safeDescription = photo.description.replace(/"/g, '&quot;');
  const keywordsContent = photo.keywords.join(', ').replace(/"/g, '&quot;');

  let html = template;

  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${photo.title}</title>`,
  );

  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${safeDescription}" />`,
  );

  // Strip existing OG block + any stray og: tags from the template
  html = html.replace(/\s*<!-- Open Graph -->[\s\S]*?(?=\n\s*<!--(?! Open Graph)|\n\s*<script)/, '');
  html = html.replace(/\s*<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>/g, '');

  const photoMeta = `
    <!-- Open Graph -->
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${safeTitle}" />
    <meta property="og:url" content="${fullUrl}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Vero Photography" />
    <meta property="og:locale" content="en_US" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${imageUrl}" />${keywordsContent ? `
    <meta name="keywords" content="${keywordsContent}" />` : ''}
    <link rel="canonical" href="${fullUrl}" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "ImageObject",
      "name": "${photo.title.replace(/"/g, '\\"')}",
      "description": "${photo.description.replace(/"/g, '\\"')}",
      "contentUrl": "${imageUrl}",
      "thumbnailUrl": "${imageUrl}",
      "url": "${fullUrl}",${photo.keywords.length ? `
      "keywords": "${photo.keywords.join(', ').replace(/"/g, '\\"')}",` : ''}
      "author": {
        "@type": "Person",
        "name": "Veronika Gerzon"
      },
      "copyrightHolder": {
        "@type": "Organization",
        "name": "Vero Photography"
      }
    }
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://vero.photography" },
        { "@type": "ListItem", "position": 2, "name": "Gallery", "item": "https://vero.photography/gallery" },
        { "@type": "ListItem", "position": 3, "name": "${photo.category.charAt(0).toUpperCase() + photo.category.slice(1)}", "item": "https://vero.photography/gallery/${photo.category}" },
        { "@type": "ListItem", "position": 4, "name": "${photo.title.replace(/ \\| Vero Photography$/, '').replace(/"/g, '\\"')}", "item": "${fullUrl}" }
      ]
    }
    </script>`;

  html = html.replace('</head>', `${photoMeta}\n  </head>`);

  const noscriptContent = `
    <noscript>
      <div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;">
        <h1>${photo.title}</h1>
        <img src="${photo.url}" alt="${photo.alt}" style="width:100%;height:auto;" />
        <p>${photo.description}</p>
        <p><a href="/gallery/${photo.category}">Back to ${photo.category} gallery</a></p>
      </div>
    </noscript>`;

  html = html.replace('<div id="root"></div>', `<div id="root"></div>${noscriptContent}`);

  writeFileSync(outputFile, html);
  totalPages++;
}

console.log(`Pre-rendered ${totalPages} individual photo pages.`);

// A green build that produced zero SEO pages is the exact failure this
// script used to ship silently. Never again on production.
if (totalPages === 0) {
  failProd('prerendered 0 photo pages.');
  console.warn('[prerender] 0 pages generated.');
}

// Regenerate sitemap.xml from the same DB data so it never drifts.
const SITE = 'https://vero.photography';
const staticUrls = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/about', changefreq: 'monthly', priority: '0.8' },
  { loc: '/contact', changefreq: 'monthly', priority: '0.8' },
  { loc: '/gallery', changefreq: 'weekly', priority: '0.9' },
  { loc: '/gallery/portraits', changefreq: 'weekly', priority: '0.85' },
  { loc: '/gallery/weddings', changefreq: 'weekly', priority: '0.85' },
  { loc: '/gallery/family', changefreq: 'weekly', priority: '0.85' },
  { loc: '/gallery/maternity', changefreq: 'weekly', priority: '0.85' },
];

const photoUrls = photos.map((p) => ({
  loc: `/photo/${p.category}/${p.id}`,
  changefreq: 'monthly',
  priority: '0.7',
}));

const allUrls = [...staticUrls, ...photoUrls];
const sitemapXml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  allUrls
    .map(
      (u) =>
        `  <url>\n    <loc>${SITE}${u.loc}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
    )
    .join('\n') +
  `\n</urlset>\n`;

writeFileSync(join(distDir, 'sitemap.xml'), sitemapXml);
console.log(`Wrote sitemap.xml with ${allUrls.length} URLs (${photoUrls.length} photos).`);
