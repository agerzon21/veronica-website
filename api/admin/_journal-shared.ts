/**
 * Shared helpers for the journal-create + journal-update endpoints.
 * Both accept the same field shape and validate/normalize the same
 * way; splitting the logic out here keeps the two endpoint files
 * clean and eliminates drift between them.
 */

// 'article' is the blog kind: advice and notes from behind the lens
// rather than a photographed event. Timeline-wise identical — the
// publish date IS the event date (Alex's framing).
const SESSION_TYPES = new Set(['wedding', 'portrait', 'family', 'maternity', 'article']);

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
  // The multi-part story this entry belongs to, if any. Null on almost
  // every post and always will be. See db/migrations/041-journal-series.sql
  // for why this is three columns rather than a tag.
  series_slug: string | null;
  series_part: number | null;
  series_label: string | null;
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

  /**
   * The series fields move as one unit.
   *
   * A part number or a label with no series slug to belong to is
   * invisible on the site and would quietly survive "remove from
   * series", so the post would look standalone while still carrying
   * half a series on its row. Clearing the slug clears all three.
   */
  const seriesRaw = typeof b.series_slug === 'string' ? b.series_slug.trim() : '';
  const series_slug = seriesRaw ? slugify(seriesRaw) || null : null;
  const series_part = series_slug ? normalizeSeriesPart(b.series_part) : null;
  const series_label =
    series_slug && typeof b.series_label === 'string' && b.series_label.trim()
      ? b.series_label.trim().slice(0, 120)
      : null;

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
      series_slug,
      series_part,
      series_label,
    },
  };
}

/**
 * A part number: a whole number from 1 to 50, or null.
 *
 * Null is a legitimate answer, not a failure. The post page renders a
 * member with no part as "Also" rather than "Part Three", so a series
 * whose order is not settled yet still works. Anything out of range is
 * a bug in the caller rather than something a person typed (the form
 * uses a bounded number input), so it lands on null instead of
 * rejecting an otherwise valid save.
 */
function normalizeSeriesPart(v: unknown): number | null {
  const n =
    typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim()) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 50) return null;
  return n;
}

/**
 * Turn a Postgres unique-violation into a message that names the right
 * problem, or null if this error is not one.
 *
 * WHY THIS IS NOT JUST A STRING MATCH ON "duplicate key": journal_posts
 * now carries TWO unique indexes, the slug and (series_slug,
 * series_part). Both raise the same SQLSTATE and both mention
 * journal_posts, so the old check reported "a post with that slug
 * already exists" when the actual collision was two posts claiming to
 * be part two of the same story. That sends whoever hit it hunting
 * through slugs for a conflict that is not there.
 *
 * Postgres puts the index name in the message, which is the only thing
 * in the error that distinguishes them.
 */
export function uniqueViolationMessage(err: unknown, v: JournalInput): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes('duplicate key')) return null;

  if (msg.includes('journal_posts_series_part_key')) {
    const part = v.series_part ?? '?';
    return `Another post is already part ${part} of that series. Give this one a different part number, or change the other post first.`;
  }
  if (msg.includes('journal_posts')) {
    return `A post with slug "${v.slug}" already exists.`;
  }
  return null;
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
