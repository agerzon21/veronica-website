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
  // Alt text for the cover photo (which is now automatically the
  // first photo in the Drive folder). Kept as `cover_image_alt` in
  // the DB for now — the column just gets repurposed instead of
  // requiring another migration.
  cover_image_alt: string | null;
  // Photos come from a Google Drive folder — Vero uploads there, shares
  // the link, and pastes it here. The public post endpoint lists the
  // folder at read time (same pattern as client galleries).
  drive_folder_url: string | null;
  session_type: string | null;
  tags: string[];
  status: 'draft' | 'published';
  // The event date — what the timeline sorts + displays on. When
  // provided (YYYY-MM-DD from a native <input type="date">), we save
  // as noon UTC so it renders as the same calendar day in every
  // timezone (midnight UTC would slip a day earlier in the Americas).
  // Null means "use publish default" — auto NOW on first publish,
  // preserve existing on subsequent saves.
  published_at: string | null;
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

  const cover_image_alt =
    typeof b.cover_image_alt === 'string' && b.cover_image_alt.trim()
      ? b.cover_image_alt.trim().slice(0, 200)
      : null;

  const drive_folder_url = normalizeOptionalUrl(b.drive_folder_url);

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

  const published_at = normalizeEventDate(b.published_at);

  return {
    ok: true,
    value: {
      slug,
      title,
      excerpt,
      body_markdown,
      cover_image_alt,
      drive_folder_url,
      session_type,
      tags,
      status,
      published_at,
    },
  };
}

/**
 * Accepts a YYYY-MM-DD string (native <input type="date"> value) OR a
 * full ISO timestamp OR null/empty. Returns a normalized ISO timestamp
 * at NOON UTC so the calendar day is stable across all timezones. Null
 * for empty/invalid inputs so downstream logic can decide whether to
 * fall back to NOW or preserve existing.
 */
function normalizeEventDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    // Compose noon UTC so the date renders as the same day everywhere.
    return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T12:00:00Z`;
  }
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeOptionalUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2000) return null;
  return trimmed;
}
