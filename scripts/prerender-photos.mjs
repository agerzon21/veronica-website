/**
 * Pre-render script for individual photo pages.
 * Generates static HTML files with proper meta tags so search engines
 * can index each photo page without executing JavaScript.
 *
 * Run after `vite build` — creates HTML files in dist/photo/...
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const templatePath = join(distDir, 'index.html');
const csvPath = join(__dirname, '..', 'src', 'data', 'photos.csv');

const TITLE_SUFFIX = ' | Vero Photography';
const GALLERY_CATEGORIES = new Set(['portraits', 'weddings', 'family', 'maternity']);

// Read the built index.html as template
const template = readFileSync(templatePath, 'utf-8');
const csvRaw = readFileSync(csvPath, 'utf-8');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // skip
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

const rows = parseCsv(csvRaw);
const header = rows[0];
const dataRows = rows.slice(1);

const idx = {
  filename: header.indexOf('filename'),
  category: header.indexOf('category'),
  alt: header.indexOf('alt'),
  title: header.indexOf('title'),
  description: header.indexOf('description'),
  keywords: header.indexOf('keywords'),
};

const photos = dataRows
  .map((row) => {
    const filename = (row[idx.filename] ?? '').trim();
    const category = (row[idx.category] ?? '').trim();
    const titleRaw = row[idx.title] ?? '';
    return {
      id: filename.replace(/\.webp$/i, ''),
      filename,
      category,
      url: `/assets/photos/${category}/${filename}`,
      alt: row[idx.alt] ?? '',
      title: titleRaw ? `${titleRaw}${TITLE_SUFFIX}` : '',
      description: row[idx.description] ?? '',
      keywords: (row[idx.keywords] ?? '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    };
  })
  .filter((p) => GALLERY_CATEGORIES.has(p.category) && p.title.length > 0);

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
    `<title>${photo.title}</title>`
  );

  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${safeDescription}" />`
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

// Regenerate sitemap.xml from the same image data so it never drifts.
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
        `  <url>\n    <loc>${SITE}${u.loc}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join('\n') +
  `\n</urlset>\n`;

writeFileSync(join(distDir, 'sitemap.xml'), sitemapXml);
console.log(`Wrote sitemap.xml with ${allUrls.length} URLs (${photoUrls.length} photos).`);
