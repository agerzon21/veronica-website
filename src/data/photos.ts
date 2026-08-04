import csvRaw from './photos.csv?raw';
import photoDimsRaw from './photo-dims.json';

export type Category = 'portraits' | 'weddings' | 'family' | 'maternity';

export type PhotoStatus = 'new' | 'done';

export interface Photo {
  id: string;
  filename: string;
  url: string;
  category: Category;
  alt: string;
  title: string;
  description: string;
  keywords: string[];
  status: PhotoStatus;
  // Natural pixel dimensions of the source file, extracted at build
  // time by scripts/measure-photos.mjs. Used by the gallery grid to
  // build a justified/masonry layout — no square-cropping, aspects
  // known at first paint.
  width: number;
  height: number;
}

const photoDims = photoDimsRaw as Record<string, { width: number; height: number }>;
// Fallback for photos missing from the dims JSON (e.g. added after last
// measure-photos run). 3:2 is the most common camera aspect, so
// mis-sized tiles get corrected once the next build runs the script.
const FALLBACK_DIMS = { width: 3000, height: 2000 };

export interface SiteAsset {
  id: string;
  filename: string;
  url: string;
  alt: string;
}

const TITLE_SUFFIX = ' | Vero Photography';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
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

const rawRows = parseCsv(csvRaw);
const header = rawRows[0];
const dataRows = rawRows.slice(1);

const colIndex = {
  filename: header.indexOf('filename'),
  category: header.indexOf('category'),
  alt: header.indexOf('alt'),
  title: header.indexOf('title'),
  description: header.indexOf('description'),
  keywords: header.indexOf('keywords'),
  status: header.indexOf('status'),
};

const allEntries = dataRows.map((row) => {
  const filename = row[colIndex.filename]?.trim() ?? '';
  const category = (row[colIndex.category]?.trim() ?? '') as Category | 'site';
  const alt = row[colIndex.alt] ?? '';
  const titleRaw = row[colIndex.title] ?? '';
  const description = row[colIndex.description] ?? '';
  const keywordsRaw = row[colIndex.keywords] ?? '';
  const statusRaw =
    colIndex.status >= 0 ? (row[colIndex.status] ?? '').trim() : 'done';
  const status: PhotoStatus = statusRaw === 'new' ? 'new' : 'done';

  const dims = photoDims[filename] ?? FALLBACK_DIMS;
  return {
    id: filename.replace(/\.webp$/i, ''),
    filename,
    url: `/assets/photos/${category}/${filename}`,
    category,
    alt,
    title: titleRaw ? `${titleRaw}${TITLE_SUFFIX}` : '',
    description,
    keywords: keywordsRaw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    status,
    width: dims.width,
    height: dims.height,
  };
});

const galleryCategories: Category[] = ['portraits', 'weddings', 'family', 'maternity'];

export const allPhotos: Photo[] = allEntries.filter(
  (e): e is Photo =>
    galleryCategories.includes(e.category as Category) && e.title.length > 0
);

export const photosByCategory: Record<Category, Photo[]> = {
  portraits: [],
  weddings: [],
  family: [],
  maternity: [],
};
for (const photo of allPhotos) {
  photosByCategory[photo.category].push(photo);
}

export const siteAssets: Record<string, SiteAsset> = Object.fromEntries(
  allEntries
    .filter((e) => e.category === 'site')
    .map((e) => [e.id, { id: e.id, filename: e.filename, url: e.url, alt: e.alt }])
);

export function findPhoto(category: string, id: string): Photo | undefined {
  const photos = photosByCategory[category as Category];
  if (!photos) return undefined;
  return photos.find((p) => p.id === id);
}

/**
 * Returns photos sharing the most keywords with the given photo.
 * Same-category photos are preferred when keyword overlap is tied.
 */
export function findRelatedPhotos(photo: Photo, count = 6): Photo[] {
  const photoKeywords = new Set(photo.keywords);
  const scored = allPhotos
    .filter((p) => p.id !== photo.id)
    .map((p) => {
      let overlap = 0;
      for (const k of p.keywords) if (photoKeywords.has(k)) overlap++;
      const sameCategory = p.category === photo.category ? 1 : 0;
      return { photo: p, overlap, sameCategory };
    })
    .filter((s) => s.overlap > 0)
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      if (b.sameCategory !== a.sameCategory) return b.sameCategory - a.sameCategory;
      return Math.random() - 0.5;
    });
  return scored.slice(0, count).map((s) => s.photo);
}
