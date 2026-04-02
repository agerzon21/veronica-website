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

// Read the built index.html as template
const template = readFileSync(templatePath, 'utf-8');

// We need to import the image data. Since it's in TSX, we'll extract it from Gallery.
// For simplicity, we'll read the source file and parse the sampleImages object.
const gallerySource = readFileSync(
  join(__dirname, '..', 'src', 'pages', 'Gallery.tsx'),
  'utf-8'
);

// Extract each category's images using regex
function extractImages(source) {
  const categories = {};
  // Match category blocks like: portraits: [ ... ], weddings: [ ... ]
  const categoryRegex = /(\w+):\s*\[/g;
  let match;
  const categoryNames = [];

  while ((match = categoryRegex.exec(source)) !== null) {
    const name = match[1];
    if (['portraits', 'weddings', 'family', 'maternity'].includes(name)) {
      categoryNames.push({ name, startIndex: match.index });
    }
  }

  for (let i = 0; i < categoryNames.length; i++) {
    const catName = categoryNames[i].name;
    const start = categoryNames[i].startIndex;

    // Find all image objects in this category
    // Use a regex that handles escaped quotes inside single-quoted strings
    const imageRegex = /\{\s*id:\s*'([^']+)',\s*url:\s*'([^']+)',\s*alt:\s*'((?:[^'\\]|\\.)*)',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*description:\s*'((?:[^'\\]|\\.)*)'/g;

    // Get the substring for this category (until next category or end)
    const end = i < categoryNames.length - 1 ? categoryNames[i + 1].startIndex : source.length;
    const categorySource = source.substring(start, end);

    const images = [];
    let imgMatch;
    while ((imgMatch = imageRegex.exec(categorySource)) !== null) {
      images.push({
        id: imgMatch[1],
        url: imgMatch[2],
        // Unescape the escaped single quotes
        alt: imgMatch[3].replace(/\\'/g, "'"),
        title: imgMatch[4].replace(/\\'/g, "'"),
        description: imgMatch[5].replace(/\\'/g, "'"),
      });
    }

    categories[catName] = images;
  }

  return categories;
}

const sampleImages = extractImages(gallerySource);

let totalPages = 0;

for (const [category, images] of Object.entries(sampleImages)) {
  for (const photo of images) {
    const pagePath = `photo/${category}/${photo.id}`;
    const outputDir = join(distDir, 'photo', category);
    const outputFile = join(outputDir, `${photo.id}.html`);

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const fullUrl = `https://vero.photography/${pagePath}`;
    const imageUrl = `https://vero.photography${photo.url}`;

    // Escape double quotes for use in HTML attributes
    const safeTitle = photo.title.replace(/"/g, '&quot;');
    const safeDescription = photo.description.replace(/"/g, '&quot;');

    // Start with the template
    let html = template;

    // Replace title
    html = html.replace(
      /<title>[^<]*<\/title>/,
      `<title>${photo.title}</title>`
    );

    // Replace meta description
    html = html.replace(
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${safeDescription}" />`
    );

    // Remove ALL existing OG tags from the template so we don't get duplicates
    html = html.replace(/\s*<!-- Open Graph -->[\s\S]*?(?=\n\s*<!--(?! Open Graph)|\n\s*<script)/,  '');
    // Also remove any stray og: meta tags that might remain
    html = html.replace(/\s*<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>/g, '');

    // Add photo-specific meta tags before closing </head>
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
    <meta name="twitter:image" content="${imageUrl}" />
    <link rel="canonical" href="${fullUrl}" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "ImageObject",
      "name": "${photo.title.replace(/"/g, '\\"')}",
      "description": "${photo.description.replace(/"/g, '\\"')}",
      "contentUrl": "${imageUrl}",
      "thumbnailUrl": "${imageUrl}",
      "url": "${fullUrl}",
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

    // Add a noscript fallback with the photo content for crawlers
    const noscriptContent = `
    <noscript>
      <div style="max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;">
        <h1>${photo.title}</h1>
        <img src="${photo.url}" alt="${photo.alt}" style="width:100%;height:auto;" />
        <p>${photo.description}</p>
        <p><a href="/gallery/${category}">Back to ${category} gallery</a></p>
      </div>
    </noscript>`;

    html = html.replace('<div id="root"></div>', `<div id="root"></div>${noscriptContent}`);

    writeFileSync(outputFile, html);
    totalPages++;
  }
}

console.log(`Pre-rendered ${totalPages} individual photo pages.`);
