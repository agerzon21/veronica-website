/**
 * Admin: does this "Link to the review" actually lead to the review?
 *
 * WHY THIS EXISTS
 * The link becomes a "Read it on Google" button in the public review popup,
 * the thing that tells a visitor the review is real. Vero pastes it from her
 * phone, and the easy mistakes all look like a valid https link: the business
 * page instead of the review, a Drive photo link, or the PREVIOUS review's
 * link still on the clipboard. Alex asked for a check mark that says it is
 * right (2026-11-24).
 *
 * WHAT IT CAN AND CANNOT KNOW
 * Both share formats Google hands out (maps.app.goo.gl/... and
 * share.google/...) redirect to /maps/reviews/data=...!1s<review id>...
 * !1s0x0:<business id>. So following the redirects tells us, for certain,
 * that it is a review, which business it is about, and whether another
 * review on the site already points at it. Who wrote it does NOT appear
 * without running Google's scripts, so the name is not checked.
 *
 * Only Google, Yelp and Instagram hosts are ever fetched, at every hop of a
 * redirect: the server fetching whatever an admin pastes would be a way to
 * make it request anything.
 *
 * POST { password, url, reviewId? }
 *   → 200 { success, verdict, duplicateOf? }
 *     verdict: 'review'          a Google review of Vero's business
 *              'other_business'  a Google review, of someone else
 *              'duplicate'       already the link on duplicateOf's review
 *              'not_review'      a Google link that is not a review
 *              'opens'           a Yelp / Instagram link that loads
 *              'broken'          a link that does not load
 *              'unchecked'       a site we do not fetch, or Google did not answer
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

/**
 * Vero's Google business id, as it appears in review URLs. It is the same
 * number as the CID inside her profile link g.page/r/CSNq8ccyWt_wEAE
 * (src/components/GoogleReviewsSection.tsx), and all 11 linked reviews on
 * 2026-11-24 carried it.
 */
const VERO_GOOGLE_BUSINESS = '0xf0df5a32c7f16a23';

const FETCHABLE_HOSTS = [
  /(^|\.)google\.com$/,
  /^maps\.app\.goo\.gl$/,
  /^goo\.gl$/,
  /^share\.google$/,
  /^g\.page$/,
  /^g\.co$/,
  /(^|\.)yelp\.com$/,
  /^yelp\.to$/,
  /(^|\.)instagram\.com$/,
];
const MAX_HOPS = 8;
const TIMEOUT_MS = 6000;
// No browser User-Agent, on purpose: given one, maps.app.goo.gl answers 200
// with a page that redirects in script, and the review URL never appears.

function fetchable(url: URL): boolean {
  return url.protocol === 'https:' && FETCHABLE_HOSTS.some((re) => re.test(url.hostname));
}

type Resolved = { ok: true; finalUrl: string; status: number } | { ok: false; reason: 'host' | 'network' };

/** Follow redirects by hand, refusing any hop off the allowed hosts. */
async function resolve(raw: string): Promise<Resolved> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'host' };
  }
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (!fetchable(url)) return { ok: false, reason: 'host' };
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        headers: { 'Accept-Language': 'en-US,en' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, reason: 'network' };
    }
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) {
      url = new URL(next, url);
      continue;
    }
    return { ok: true, finalUrl: url.toString(), status: res.status };
  }
  return { ok: false, reason: 'network' };
}

/** The two ids in a /maps/reviews/ URL: the review's, and the business's. */
export function parseGoogleReview(finalUrl: string): { reviewId: string; business: string | null } | null {
  if (!/\/maps\/reviews\//.test(finalUrl)) return null;
  const decoded = decodeURIComponent(finalUrl);
  const reviewId = decoded.match(/!1s(Ci9[A-Za-z0-9_-]+)/)?.[1];
  if (!reviewId) return null;
  const business = decoded.match(/!1s0x[0-9a-f]+:(0x[0-9a-f]+)/i)?.[1]?.toLowerCase() ?? null;
  return { reviewId, business };
}

/**
 * Review id behind each stored link, kept for the life of a warm instance:
 * a share link always resolves to the same review, and the duplicate check
 * would otherwise re-resolve every link on the site at each keystroke pause.
 */
const reviewIdCache = new Map<string, string | null>();

async function reviewIdOf(link: string): Promise<string | null> {
  if (reviewIdCache.has(link)) return reviewIdCache.get(link) ?? null;
  const r = await resolve(link);
  const id = r.ok ? (parseGoogleReview(r.finalUrl)?.reviewId ?? null) : null;
  // A failed lookup is not remembered, so a hiccup is retried next time.
  if (r.ok) reviewIdCache.set(link, id);
  return id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const link = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  const editingId = typeof req.body?.reviewId === 'string' ? req.body.reviewId : null;
  if (!/^https:\/\//i.test(link)) {
    return res.status(400).json({ success: false, error: 'url must start with https://' });
  }

  try {
    const r = await resolve(link);
    if (!r.ok) return res.status(200).json({ success: true, verdict: 'unchecked' });

    const host = new URL(r.finalUrl).hostname;
    if (!/(^|\.)google\.com$/.test(host)) {
      return res.status(200).json({ success: true, verdict: r.status < 400 ? 'opens' : 'broken' });
    }

    const review = parseGoogleReview(r.finalUrl);
    if (!review) return res.status(200).json({ success: true, verdict: 'not_review' });
    if (review.business && review.business !== VERO_GOOGLE_BUSINESS) {
      return res.status(200).json({ success: true, verdict: 'other_business' });
    }
    reviewIdCache.set(link, review.reviewId);

    // The previous review's link, still on the clipboard.
    const sql = getDb();
    const others = (await sql`
      SELECT id, author_name, review_url FROM reviews
      WHERE review_url IS NOT NULL AND review_url <> ''
    `) as Array<{ id: string; author_name: string; review_url: string }>;
    const candidates = others.filter((o) => o.id !== editingId);
    const ids = await Promise.all(
      candidates.map((o) => (o.review_url.trim() === link ? review.reviewId : reviewIdOf(o.review_url.trim()))),
    );
    const twin = candidates.find((_, i) => ids[i] === review.reviewId);
    if (twin) {
      return res.status(200).json({ success: true, verdict: 'duplicate', duplicateOf: twin.author_name });
    }
    return res.status(200).json({ success: true, verdict: 'review' });
  } catch (err) {
    console.error('[admin/reviews-check-link] handler failed:', err);
    return res.status(200).json({ success: true, verdict: 'unchecked' });
  }
}
