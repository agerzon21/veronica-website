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

// Canonical origin. Declared here rather than beside the sitemap because the
// category pages generated further up need it too.
const SITE = 'https://vero.photography';

/**
 * Remove the site-name suffix that photos.ts appends to every title.
 *
 * This used to be an inline /  \\| Vero Photography$/ — in which `\\|` is an
 * escaped backslash followed by ALTERNATION, so it matched " Vero Photography"
 * at the end and left the pipe behind. All 227 breadcrumbs shipped a name
 * ending in " |". Slicing the constant cannot drift from it.
 */
const stripSuffix = (title) =>
  title.endsWith(TITLE_SUFFIX) ? title.slice(0, -TITLE_SUFFIX.length) : title;

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
/**
 * Same scoring as findRelatedPhotos in src/data/photos.ts: keyword overlap
 * first, same-category as the tiebreak. Duplicated rather than imported
 * because this script is plain .mjs and photos.ts is TypeScript inside the
 * Vite graph — keep the two in sync if either changes.
 *
 * ONE deliberate difference: the app drops candidates with zero keyword
 * overlap, because showing a visitor an unrelated photo under "Related" is
 * worse than showing fewer. Here the list is a crawl path, and a photo whose
 * keywords match nothing would otherwise end up with no inbound links at all —
 * 16 of the 227 did. Falling back to same-category keeps every page reachable.
 */
function relatedTo(photo, all, count = 6) {
  const keys = new Set(photo.keywords);
  return all
    .filter((p) => p.id !== photo.id)
    .map((p) => {
      let overlap = 0;
      for (const k of p.keywords) if (keys.has(k)) overlap++;
      return { p, overlap, same: p.category === photo.category ? 1 : 0 };
    })
    .sort((a, b) => b.overlap - a.overlap || b.same - a.same)
    .slice(0, count)
    .map((s) => s.p);
}

/**
 * Previous and next photo within the same category, as a closed ring.
 *
 * The keyword-related list leaves gaps: relatedness is not symmetric, so 16 of
 * the 227 photos were never in anybody's top 6 and ended up with no inbound
 * links at all. A ring is the cheap guarantee — every photo has exactly one
 * predecessor, so every photo is reachable no matter how unusual its keywords.
 */
function ringNeighbours(photo, all) {
  const siblings = all.filter((p) => p.category === photo.category);
  if (siblings.length < 2) return [];
  const i = siblings.findIndex((p) => p.id === photo.id);
  const prev = siblings[(i - 1 + siblings.length) % siblings.length];
  const next = siblings[(i + 1) % siblings.length];
  return prev.id === next.id ? [prev] : [prev, next];
}

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

// index.html carries a homepage <noscript> (site blurb + nav) so non-JS
// crawlers and AI agents see something on every SPA route. Photo pages get
// their own per-photo noscript injected below, so strip the homepage one here
// rather than shipping two.
const photoTemplate = template.replace(
  /[ \t]*<!-- VG-HOME-NOSCRIPT:START[\s\S]*?<!-- VG-HOME-NOSCRIPT:END -->\n?/,
  '',
);
if (photoTemplate === template) {
  console.warn('[prerender] homepage noscript block not found — did index.html change?');
}

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

  let html = photoTemplate;

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
  // Drop any canonical inherited from index.html. photoMeta adds the correct
  // per-photo one below; two canonicals on a page is worse than none, and
  // relying on the Open Graph strip to swallow it was fragile — a single
  // explanatory comment in the wrong place silently terminated that regex.
  html = html.replace(/\s*<link\s+rel="canonical"[^>]*>/g, '');

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
        { "@type": "ListItem", "position": 4, "name": "${stripSuffix(photo.title).replace(/"/g, '\\"')}", "item": "${fullUrl}" }
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
        <h2>Related photographs</h2>
        <ul>
${relatedTo(photo, photos)
  .map(
    (r) =>
      `          <li><a href="/photo/${r.category}/${r.id}">${stripSuffix(r.title).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a></li>`,
  )
  .join('\n')}
        </ul>
        <h2>More in ${photo.category}</h2>
        <ul>
${ringNeighbours(photo, photos)
  .map(
    (r) =>
      `          <li><a href="/photo/${r.category}/${r.id}">${stripSuffix(r.title).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a></li>`,
  )
  .join('\n')}
        </ul>
        <h2>Browse</h2>
        <ul>
          <li><a href="/gallery">All work</a></li>
          <li><a href="/gallery/weddings">Weddings</a></li>
          <li><a href="/gallery/portraits">Portraits</a></li>
          <li><a href="/gallery/family">Family</a></li>
          <li><a href="/gallery/maternity">Maternity</a></li>
        </ul>
      </div>
    </noscript>`;

  html = html.replace('<div id="root"></div>', `<div id="root"></div>${noscriptContent}`);

  writeFileSync(outputFile, html);
  totalPages++;
}

console.log(`Pre-rendered ${totalPages} individual photo pages.`);

// ---------------------------------------------------------------------------
// Category gallery pages — the missing link.
//
// The 227 photo pages above are richly interlinked (related + ring neighbours)
// and every one points UP to /gallery/<category>. Nothing pointed DOWN. The
// category routes fell through to the SPA shell, whose tiles are fetched from
// /api/gallery at runtime, so a crawler that does not execute JavaScript
// walked: home -> nav -> category -> dead end. Semrush crawled exactly 13
// pages against a 236-URL sitemap, and every build reported "227 prerendered,
// 236 sitemap URLs" and went green, because those count what was GENERATED,
// not what is REACHABLE. The check at the bottom of this file now measures the
// difference.
//
// Descriptions follow the CLAUDE.md tone rules: no locations, no praise words.
//
// ROUTING: vercel.json rewrites /gallery/:category to /gallery/:category.html,
// with the category list spelled out rather than a bare :category — an unknown
// category would otherwise rewrite to a .html that does not exist and 404,
// where today it falls through to the SPA. Keep that list and this object in
// sync. (The note lives here because vercel.json is JSON and cannot hold a
// comment: adding a "_comment" key fails Vercel's schema validation and the
// deployment errors before the build starts.)
// ---------------------------------------------------------------------------
const CATEGORY_META = {
  weddings: {
    heading: 'Wedding Photography',
    description: 'Wedding coverage, from getting ready through the last dance.',
  },
  portraits: {
    heading: 'Portrait Photography',
    description: 'Portrait sessions — individual, couple and editorial work.',
  },
  family: {
    heading: 'Family Photography',
    description: 'Family sessions, including newborn and milestone portraits.',
  },
  maternity: {
    heading: 'Maternity Photography',
    description: 'Maternity sessions, in the studio and outdoors.',
  },
};

const esc = (t) =>
  String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let categoryPages = 0;
for (const [category, meta] of Object.entries(CATEGORY_META)) {
  const inCategory = photos.filter((p) => p.category === category);
  // An empty category would ship a page advertising nothing. Skip it rather
  // than publish a dead end, and let the reachability check below complain.
  if (inCategory.length === 0) {
    console.warn(`[prerender] category "${category}" has no published photos — skipping page.`);
    continue;
  }

  const outputDir = join(distDir, 'gallery');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const canonical = `${SITE}/gallery/${category}`;
  const pageTitle = `${meta.heading}${TITLE_SUFFIX}`;
  // Real image, resolved from the DB through the same /api/photo proxy the
  // photo pages use. The old categoryDetails image paths in Gallery.tsx still
  // point at /assets/photos/..., which is where photos lived BEFORE they moved
  // to Drive — pointing an og:image there would share a broken preview.
  const ogImage = `${SITE}/api/photo?id=${inCategory[0].url.split('id=')[1]}`;
  let html = photoTemplate;

  // The SPA sets these client-side; a non-rendering crawler never sees that,
  // so the category routes were all inheriting index.html's homepage meta.
  const categoryMeta = `
    <title>${esc(pageTitle)}</title>
    <meta name="description" content="${esc(meta.description)}" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(pageTitle)}" />
    <meta property="og:description" content="${esc(meta.description)}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(meta.heading)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:site_name" content="Vero Photography" />
    <meta property="og:locale" content="en_US" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(pageTitle)}" />
    <meta name="twitter:description" content="${esc(meta.description)}" />
    <meta name="twitter:image" content="${ogImage}" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": ${JSON.stringify(meta.heading)},
      "description": ${JSON.stringify(meta.description)},
      "url": "${canonical}",
      "hasPart": [
${inCategory
  .map(
    (p) =>
      `        { "@type": "ImageObject", "name": ${JSON.stringify(stripSuffix(p.title))}, "url": "${SITE}/photo/${p.category}/${p.id}" }`,
  )
  .join(',\n')}
      ]
    }
    </script>`;

  // index.html ships its own title/description/OG/canonical for the homepage.
  // Leaving them gives two <title>s and — worse — two canonicals, which is the
  // exact trap the photo loop above documents. Strip before injecting.
  html = html.replace(/[ \t]*<title>[\s\S]*?<\/title>\n?/, '');
  html = html.replace(/[ \t]*<meta name="description"[^>]*>\n?/, '');
  html = html.replace(/\s*<!-- Open Graph -->[\s\S]*?(?=\n\s*<!--(?! Open Graph)|\n\s*<script)/, '');
  html = html.replace(/\s*<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>/g, '');
  html = html.replace(/\s*<link\s+rel="canonical"[^>]*>/g, '');
  html = html.replace('</head>', `${categoryMeta}\n  </head>`);

  const others = Object.keys(CATEGORY_META).filter((c) => c !== category);
  const noscriptContent = `
    <noscript>
      <div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;">
        <h1>${esc(meta.heading)}</h1>
        <p>${esc(meta.description)}</p>
        <h2>Photographs</h2>
        <ul>
${inCategory
  .map(
    (p) =>
      `          <li><a href="/photo/${p.category}/${p.id}">${esc(stripSuffix(p.title))}</a></li>`,
  )
  .join('\n')}
        </ul>
        <h2>Browse</h2>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/gallery">All work</a></li>
${others
  .map((c) => `          <li><a href="/gallery/${c}">${esc(CATEGORY_META[c].heading)}</a></li>`)
  .join('\n')}
          <li><a href="/wedding-photography">Wedding photography services</a></li>
          <li><a href="/about">About Veronika</a></li>
          <li><a href="/journal">Journal</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </div>
    </noscript>`;

  html = html.replace('<div id="root"></div>', `<div id="root"></div>${noscriptContent}`);
  writeFileSync(join(outputDir, `${category}.html`), html);
  categoryPages++;
}

console.log(`Pre-rendered ${categoryPages} category gallery pages.`);
if (categoryPages === 0) failProd('prerendered 0 category pages.');

// ---------------------------------------------------------------------------
// Journal — listing page + one page per published post.
//
// Same defect the category pages had, and it mattered more: the posts carry
// real venue and town names ("Malcolm Gross Rose Gardens", "Milford, PA"),
// which is the strongest long-tail material on the site, and none of it was
// reachable, prerendered, or in the sitemap. /journal served the SPA shell and
// the posts load from /api/journal at runtime.
//
// Published predicate is copied verbatim from api/journal.ts handleList —
// status = 'published' AND published_at IS NOT NULL. A draft must never get a
// static page; getting this wrong publishes unfinished writing.
// ---------------------------------------------------------------------------
let journalRows = [];
try {
  journalRows = await sql`
    SELECT slug, title, excerpt, body_markdown, cover_image_url, cover_image_alt,
           session_type, tags, published_at
    FROM journal_posts
    WHERE status = 'published' AND published_at IS NOT NULL
    ORDER BY published_at DESC
    LIMIT 500
  `;
} catch (err) {
  console.warn(`[prerender] journal query failed: ${err.message}`);
  failProd('could not read journal posts.');
}

const posts = journalRows.filter((r) => r.slug && r.title);

/**
 * Deliberately tiny Markdown subset: "## heading" and blank-line-separated
 * paragraphs, with inline [text](url) flattened to its text and everything
 * escaped FIRST. This is the noscript body a crawler reads, not the rendered
 * page — JournalPost.tsx still owns real rendering. A full parser here would
 * be more surface area than the job needs, and mis-parsed Markdown would ship
 * broken HTML into every post page.
 */
const markdownToBlocks = (md) =>
  String(md || '')
    .split(/\n{2,}/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((blockRaw) => {
      const text = esc(blockRaw)
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')       // images -> drop
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')    // links  -> their text
        .replace(/[*_`]/g, '')
        .trim();
      if (!text) return '';
      const h = text.match(/^#{2,6}\s+(.*)$/s);
      if (h) return `        <h2>${h[1].replace(/\n/g, ' ')}</h2>`;
      if (/^#\s+/.test(text)) return `        <h2>${text.replace(/^#\s+/, '').replace(/\n/g, ' ')}</h2>`;
      return `        <p>${text.replace(/\n/g, ' ')}</p>`;
    })
    .filter(Boolean)
    .join('\n');

const journalDir = join(distDir, 'journal');
if (!existsSync(journalDir)) mkdirSync(journalDir, { recursive: true });

// cover_image_url is null on every current post, so fall back to the site
// default rather than emitting an empty og:image (which renders as a broken
// card on every share).
const DEFAULT_OG = `${SITE}/assets/photos/site/contact-bg.webp`;

let journalPages = 0;
for (const post of posts) {
  const canonical = `${SITE}/journal/${post.slug}`;
  const pageTitle = `${post.title}${TITLE_SUFFIX}`;
  const desc = (post.excerpt || '').trim() || post.title;
  const ogImage = post.cover_image_url || DEFAULT_OG;
  const published = new Date(post.published_at).toISOString();
  const tags = Array.isArray(post.tags) ? post.tags : [];
  const others = posts.filter((o) => o.slug !== post.slug).slice(0, 6);

  let html = photoTemplate;
  html = html.replace(/[ \t]*<title>[\s\S]*?<\/title>\n?/, '');
  html = html.replace(/[ \t]*<meta name="description"[^>]*>\n?/, '');
  html = html.replace(/\s*<!-- Open Graph -->[\s\S]*?(?=\n\s*<!--(?! Open Graph)|\n\s*<script)/, '');
  html = html.replace(/\s*<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>/g, '');
  html = html.replace(/\s*<link\s+rel="canonical"[^>]*>/g, '');

  const meta = `
    <title>${esc(pageTitle)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${esc(pageTitle)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${esc(ogImage)}" />
    <meta property="og:image:alt" content="${esc(post.cover_image_alt || post.title)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:site_name" content="Vero Photography" />
    <meta property="og:locale" content="en_US" />
    <meta property="article:published_time" content="${published}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(pageTitle)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${esc(ogImage)}" />${tags.length ? `
    <meta name="keywords" content="${esc(tags.join(', '))}" />` : ''}
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": ${JSON.stringify(post.title)},
      "description": ${JSON.stringify(desc)},
      "url": "${canonical}",
      "datePublished": "${published}",
      "image": ${JSON.stringify(ogImage)},
      "keywords": ${JSON.stringify(tags.join(', '))},
      "author": { "@type": "Person", "name": "Veronika Gerzon" },
      "publisher": { "@type": "Organization", "name": "Vero Photography", "url": "${SITE}" },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${canonical}" }
    }
    </script>`;
  html = html.replace('</head>', `${meta}\n  </head>`);

  const noscript = `
    <noscript>
      <div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;">
        <h1>${esc(post.title)}</h1>
        <p><time datetime="${published}">${new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</time></p>
        <p><em>${esc(desc)}</em></p>
${markdownToBlocks(post.body_markdown)}
        <p><a href="/journal">All journal entries</a></p>
${others.length ? `        <h2>More from the journal</h2>
        <ul>
${others.map((o) => `          <li><a href="/journal/${o.slug}">${esc(o.title)}</a></li>`).join('\n')}
        </ul>` : ''}
        <h2>Browse</h2>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/gallery">All work</a></li>
          <li><a href="/wedding-photography">Wedding photography services</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </div>
    </noscript>`;
  html = html.replace('<div id="root"></div>', `<div id="root"></div>${noscript}`);

  writeFileSync(join(journalDir, `${post.slug}.html`), html);
  journalPages++;
}

// The listing page — this is the edge that makes the posts reachable at all.
{
  const canonical = `${SITE}/journal`;
  const pageTitle = `Journal${TITLE_SUFFIX}`;
  const desc = 'Wedding and portrait stories, written after the gallery is delivered.';
  let html = photoTemplate;
  html = html.replace(/[ \t]*<title>[\s\S]*?<\/title>\n?/, '');
  html = html.replace(/[ \t]*<meta name="description"[^>]*>\n?/, '');
  html = html.replace(/\s*<!-- Open Graph -->[\s\S]*?(?=\n\s*<!--(?! Open Graph)|\n\s*<script)/, '');
  html = html.replace(/\s*<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>/g, '');
  html = html.replace(/\s*<link\s+rel="canonical"[^>]*>/g, '');

  const meta = `
    <title>${esc(pageTitle)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(pageTitle)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${DEFAULT_OG}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:site_name" content="Vero Photography" />
    <meta property="og:locale" content="en_US" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      "name": "Vero Photography Journal",
      "description": ${JSON.stringify(desc)},
      "url": "${canonical}",
      "blogPost": [
${posts
  .map(
    (o) =>
      `        { "@type": "BlogPosting", "headline": ${JSON.stringify(o.title)}, "url": "${SITE}/journal/${o.slug}" }`,
  )
  .join(',\n')}
      ]
    }
    </script>`;
  html = html.replace('</head>', `${meta}\n  </head>`);

  const noscript = `
    <noscript>
      <div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;">
        <h1>Journal</h1>
        <p>${esc(desc)}</p>
        <ul>
${posts
  .map(
    (o) =>
      `          <li><a href="/journal/${o.slug}">${esc(o.title)}</a> — ${esc((o.excerpt || '').trim())}</li>`,
  )
  .join('\n')}
        </ul>
        <h2>Browse</h2>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/gallery">All work</a></li>
          <li><a href="/wedding-photography">Wedding photography services</a></li>
          <li><a href="/about">About Veronika</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </div>
    </noscript>`;
  html = html.replace('<div id="root"></div>', `<div id="root"></div>${noscript}`);
  writeFileSync(join(distDir, 'journal.html'), html);
}

console.log(`Pre-rendered ${journalPages} journal posts + the journal index.`);



// A green build that produced zero SEO pages is the exact failure this
// script used to ship silently. Never again on production.
if (totalPages === 0) {
  failProd('prerendered 0 photo pages.');
  console.warn('[prerender] 0 pages generated.');
}

// Regenerate sitemap.xml from the same DB data so it never drifts.
/**
 * src/pages/Weddings.tsx inlines six curated slugs rather than importing
 * photos.ts, because that module pulls photos.csv?raw (65KB) into the route
 * chunk. The tradeoff is that a renamed slug would 404 a tile on a commercial
 * page with nothing to catch it. This catches it, at build time.
 */
const WEDDINGS_PAGE_SLUGS = [
  'ocean-vows-ceremony',
  'loving-wedding-embrace-bw',
  'graceful-bride-bouquet',
  'wedding-champagne-celebration',
  'bride-greenhouse-serenity',
  'floral-wedding-kiss',
];
{
  const known = new Set(photos.filter((p) => p.category === 'weddings').map((p) => p.id));
  const missing = WEDDINGS_PAGE_SLUGS.filter((slug) => !known.has(slug));
  if (missing.length > 0) {
    failProd(
      `Weddings page references ${missing.length} slug(s) not in photos.csv: ${missing.join(', ')}. ` +
        `Update FEATURED in src/pages/Weddings.tsx and this list.`,
    );
    console.warn(`[prerender] weddings page slugs missing: ${missing.join(', ')}`);
  }
}

const staticUrls = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/about', changefreq: 'monthly', priority: '0.8' },
  { loc: '/contact', changefreq: 'monthly', priority: '0.8' },
  // Highest-priority commercial page after the homepage: weddings are 35% of
  // all inquiries, and this is the only page that answers what coverage,
  // travel and delivery actually look like.
  { loc: '/wedding-photography', changefreq: 'monthly', priority: '0.9' },
  // Surfaced by the reachability check below: /journal was linked from every
  // page's noscript nav but had never been listed here.
  { loc: '/journal', changefreq: 'weekly', priority: '0.7' },
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

const journalUrls = posts.map((p) => ({
  loc: `/journal/${p.slug}`,
  changefreq: 'monthly',
  priority: '0.75',
}));

const allUrls = [...staticUrls, ...journalUrls, ...photoUrls];
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
console.log(
  `Wrote sitemap.xml with ${allUrls.length} URLs (${photoUrls.length} photos, ${journalUrls.length} journal posts).`,
);

// ---------------------------------------------------------------------------
// Reachability check.
//
// The bug this exists to catch: for months every build printed "Pre-rendered
// 227 individual photo pages" and "Wrote sitemap.xml with 236 URLs" and went
// green, while exactly 13 pages were reachable by following links from the
// homepage. Both numbers count what was GENERATED. Neither can fail when the
// link graph is broken, because generating a page and linking to it are
// different things.
//
// So walk the graph the way a crawler that does not run JavaScript does:
// start at /, follow internal <a href>, resolve each URL to the file Vercel
// would actually serve for it, and repeat. Then assert every sitemap URL was
// discovered. Submitting a URL in a sitemap is a hint; being linked is what
// crawlers weight.
// ---------------------------------------------------------------------------
/**
 * Mirror of how Vercel resolves a URL for this project. `cleanUrls: true` means
 * the filesystem is consulted first and /a/b is served by dist/a/b.html when
 * that file exists; anything with no matching file falls through the catch-all
 * rewrite to the SPA shell. Modelling it generically (rather than listing the
 * routes) is what keeps this honest when new prerendered sections are added.
 */
const fileFor = (urlPath) => {
  if (urlPath === '/') return join(distDir, 'index.html');
  const candidate = join(distDir, `${urlPath.replace(/^\//, '')}.html`);
  if (existsSync(candidate)) return candidate;
  return join(distDir, 'index.html');
};

const internalLinks = (html) => {
  const out = new Set();
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)) {
    let href = m[1].trim();
    if (!href.startsWith('/')) continue;              // external, mailto:, tel:, #
    href = href.split('#')[0].split('?')[0];
    if (!href || href.startsWith('/assets/') || href.startsWith('/api/')) continue;
    if (href.length > 1 && href.endsWith('/')) href = href.slice(0, -1);
    out.add(href);
  }
  return out;
};

const reachable = new Set();
const queue = ['/'];
while (queue.length) {
  const urlPath = queue.shift();
  if (reachable.has(urlPath)) continue;
  reachable.add(urlPath);
  const file = fileFor(urlPath);
  if (!existsSync(file)) continue;
  for (const next of internalLinks(readFileSync(file, 'utf-8'))) {
    if (!reachable.has(next)) queue.push(next);
  }
}

const sitemapPaths = allUrls.map((u) => u.loc);
const unreachable = sitemapPaths.filter((loc) => !reachable.has(loc));
const orphanedFromSitemap = [...reachable].filter((r) => !sitemapPaths.includes(r));

console.log(
  `Link-reachable from /: ${reachable.size} pages (sitemap lists ${sitemapPaths.length}).`,
);

if (unreachable.length) {
  console.error(
    `[prerender] ${unreachable.length} sitemap URL(s) are NOT reachable by following links:`,
  );
  for (const u of unreachable.slice(0, 15)) console.error(`  - ${u}`);
  if (unreachable.length > 15) console.error(`  ... and ${unreachable.length - 15} more`);
  failProd(`${unreachable.length} sitemap URL(s) unreachable by link-walking.`);
} else {
  console.log('Every sitemap URL is reachable by following links from the homepage.');
}

// Not fatal — a page can be legitimately linked without being a ranking
// target. Worth surfacing so the sitemap does not quietly fall behind.
if (orphanedFromSitemap.length) {
  console.warn(
    `[prerender] linked but absent from sitemap: ${orphanedFromSitemap.join(', ')}`,
  );
}

