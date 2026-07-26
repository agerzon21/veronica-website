/**
 * Shared helpers for the journal-create + journal-update endpoints.
 * Both accept the same field shape and validate/normalize the same
 * way; splitting the logic out here keeps the two endpoint files
 * clean and eliminates drift between them.
 */

const SESSION_TYPES = new Set(['wedding', 'portrait', 'family', 'maternity']);

export interface JournalInput {
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  photos: Array<{ url: string; alt?: string; caption?: string }>;
  session_type: string | null;
  tags: string[];
  status: 'draft' | 'published';
}

export interface ValidationError {
  ok: false;
  status: number;
  error: string;
}

export type ValidateResult =
  | { ok: true; value: JournalInput }
  | ValidationError;

/**
 * URL-safe slug: lowercase, alphanumerics + hyphens, no leading/
 * trailing hyphens, collapsed consecutive hyphens.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    // strip diacritics
    .replace(/[̀-ͯ]/g, '')
    // any non-alphanumeric → hyphen
    .replace(/[^a-z0-9]+/g, '-')
    // collapse consecutive hyphens
    .replace(/-+/g, '-')
    // trim leading/trailing hyphens
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export function validateJournalInput(body: unknown): ValidateResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Missing request body' };
  }
  const b = body as Record<string, unknown>;

  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) return { ok: false, status: 400, error: 'title is required' };
  if (title.length > 200) return { ok: false, status: 400, error: 'title too long (max 200)' };

  // Slug: use provided if valid, otherwise derive from title. Empty
  // string coming in means "auto-derive".
  const rawSlug = typeof b.slug === 'string' ? b.slug.trim() : '';
  const slug = rawSlug ? slugify(rawSlug) : slugify(title);
  if (!slug) return { ok: false, status: 400, error: 'slug is empty after normalization — check title/slug' };

  const excerpt = typeof b.excerpt === 'string' ? b.excerpt.trim() : '';
  if (excerpt.length > 400) return { ok: false, status: 400, error: 'excerpt too long (max 400)' };

  const body_markdown = typeof b.body_markdown === 'string' ? b.body_markdown : '';
  if (body_markdown.length > 30000) {
    return { ok: false, status: 400, error: 'body too long (max 30000)' };
  }

  const cover_image_url = normalizeOptionalUrl(b.cover_image_url);
  const cover_image_alt =
    typeof b.cover_image_alt === 'string' && b.cover_image_alt.trim()
      ? b.cover_image_alt.trim().slice(0, 200)
      : null;

  const photosRaw = Array.isArray(b.photos) ? b.photos : [];
  const photos: JournalInput['photos'] = [];
  for (const p of photosRaw) {
    if (!p || typeof p !== 'object') continue;
    const url = typeof (p as any).url === 'string' ? (p as any).url.trim() : '';
    if (!url) continue;
    const entry: { url: string; alt?: string; caption?: string } = { url };
    if (typeof (p as any).alt === 'string' && (p as any).alt.trim()) {
      entry.alt = (p as any).alt.trim().slice(0, 200);
    }
    if (typeof (p as any).caption === 'string' && (p as any).caption.trim()) {
      entry.caption = (p as any).caption.trim().slice(0, 500);
    }
    photos.push(entry);
  }
  if (photos.length > 40) {
    return { ok: false, status: 400, error: 'too many photos (max 40)' };
  }

  const sessionRaw = typeof b.session_type === 'string' ? b.session_type.trim().toLowerCase() : '';
  const session_type = sessionRaw && SESSION_TYPES.has(sessionRaw) ? sessionRaw : null;

  const tagsRaw = Array.isArray(b.tags) ? b.tags : [];
  const tags = tagsRaw
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 20);

  const status =
    b.status === 'published' || b.status === 'draft' ? b.status : 'draft';

  return {
    ok: true,
    value: {
      slug,
      title,
      excerpt,
      body_markdown,
      cover_image_url,
      cover_image_alt,
      photos,
      session_type,
      tags,
      status,
    },
  };
}

function normalizeOptionalUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2000) return null;
  return trimmed;
}
