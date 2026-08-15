/**
 * Instagram sender-profile lookup helper.
 *
 * Given an IGSID (sender.id from a DM webhook), fetches the sender's
 * display name, @handle, and profile-picture URL via the Graph API
 * so the admin inbox can show a human-friendly identity instead of
 * "Instagram user 208622".
 *
 * Endpoint (v25.0):
 *   GET https://graph.instagram.com/v25.0/{IGSID}
 *     ?fields=name,username,profile_pic
 *     &access_token=<IG_ACCESS_TOKEN>
 *
 * Auth: uses IG_ACCESS_TOKEN — the long-lived Instagram User Access
 * Token issued via Instagram Business Login. Must have the scopes
 * `instagram_business_basic` and `instagram_business_manage_messages`
 * (both approved for Advanced Access).
 *
 * IMPORTANT — `profile_pic` URL expires. Meta pre-signs it against
 * `cdninstagram.com` / `fbcdn.net` and the URL dies in 24-72h (as
 * little as 1-3h during CDN rotations). We store what Meta gave us
 * verbatim for now; if we ever start rendering avatars in emails or
 * anywhere with 3+ day latency, add a re-host step (Cloudinary) here
 * and store OUR CDN URL alongside it.
 *
 * Failure policy: NEVER throws. Callers wrap this in short-timeout
 * fire-and-forget from the webhook path — a slow / failing profile
 * fetch cannot block the 5s Meta webhook SLA. Errors are logged with
 * `[ig-profile]` prefix so they're grep-able in Vercel logs, then
 * the function returns null. The caller then knows "don't clobber
 * existing name/pic with nulls".
 *
 * No retries here — that's the caller's call. Retrying inside a
 * webhook path is pointless because Meta will re-deliver on 500
 * anyway; retrying inside the manual-refresh admin button is
 * pointless because the user just clicks it again.
 */

const IG_GRAPH_HOST = 'https://graph.instagram.com';
const IG_API_VERSION = 'v25.0';

// Fields we actually store on `conversations`. We deliberately don't
// request follower_count / is_verified_user / is_user_follow_business
// yet — no UI surface for them, and every extra field is one more
// thing Meta could deprecate. Add them here when the admin UI grows
// a place to show them.
const PROFILE_FIELDS = ['name', 'username', 'profile_pic'].join(',');

export interface IgProfile {
  name: string | null;
  username: string | null;
  profilePicUrl: string | null;
}

/**
 * Fetch an Instagram sender's public profile by IGSID.
 *
 * Returns the profile on success, `null` on ANY failure (network
 * blip, stale/blocked IGSID, expired token, rate limit, missing env
 * var, malformed response). Errors are logged; the caller does NOT
 * need to try/catch.
 *
 * The `null` return means "leave existing name/pic alone" — do not
 * overwrite good data with empty fields.
 */
export async function fetchIgProfile(igsid: string): Promise<IgProfile | null> {
  const trimmed = typeof igsid === 'string' ? igsid.trim() : '';
  if (!trimmed) {
    console.warn('[ig-profile] fetchIgProfile called with empty igsid');
    return null;
  }

  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) {
    console.error('[ig-profile] IG_ACCESS_TOKEN env var missing — cannot fetch profile');
    return null;
  }

  const url = new URL(`${IG_GRAPH_HOST}/${IG_API_VERSION}/${encodeURIComponent(trimmed)}`);
  url.searchParams.set('fields', PROFILE_FIELDS);
  url.searchParams.set('access_token', token);

  let res: Response;
  try {
    res = await fetch(url.toString(), { method: 'GET' });
  } catch (err) {
    // DNS / TCP / TLS. Transient — but we don't retry here; caller
    // will pick it up on the next natural trigger (next DM or manual
    // refresh click).
    console.warn(
      `[ig-profile] network error for igsid=${trimmed}: ${(err as Error).message}`,
    );
    return null;
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    console.warn(
      `[ig-profile] non-JSON response for igsid=${trimmed} status=${res.status}`,
    );
    return null;
  }

  if (!res.ok) {
    logIgError(trimmed, res.status, body);
    return null;
  }

  // Successful response — cherry-pick the fields we asked for. Any
  // absent field is fine (Meta omits fields the user has hidden);
  // we just store null.
  const b = body as { name?: unknown; username?: unknown; profile_pic?: unknown };
  const profile: IgProfile = {
    name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : null,
    username:
      typeof b.username === 'string' && b.username.trim() ? b.username.trim() : null,
    profilePicUrl:
      typeof b.profile_pic === 'string' && b.profile_pic.trim() ? b.profile_pic.trim() : null,
  };

  // If Meta returned 200 but every field was empty, treat as "nothing
  // useful" — don't return a shell of an object the caller has to
  // check field-by-field.
  if (!profile.name && !profile.username && !profile.profilePicUrl) {
    console.warn(`[ig-profile] empty profile returned for igsid=${trimmed}`);
    return null;
  }

  return profile;
}

/**
 * Categorize and log the Meta error envelope so we can grep for
 * specific failure modes in Vercel logs. Non-fatal — the caller
 * always gets null and moves on.
 *
 * Envelope shape: { error: { message, type, code, error_subcode, fbtrace_id } }
 */
function logIgError(igsid: string, status: number, body: unknown): void {
  const err = ((body as { error?: unknown })?.error ?? {}) as {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
  const code = err.code;
  const sub = err.error_subcode;
  const message = err.message ?? `HTTP ${status}`;

  // Categorize so a human scanning logs can immediately tell "this
  // one is fine, that one needs action". Distinctions match the
  // failure_modes table in the research doc.
  let category = 'other';
  if (code === 10 || /consent is required/i.test(message)) {
    // User hasn't messaged us yet — shouldn't happen from the
    // webhook path (they just did), but we're seeing it in the
    // manual-refresh path if the caller's on a stale IGSID.
    category = 'no-consent';
  } else if (status === 400 && (code === 100 || code === 803)) {
    // Stale / blocked / deleted IGSID. Meta deliberately does NOT
    // distinguish these three publicly.
    category = 'unknown-user';
  } else if (code === 190 || status === 401) {
    // Long-lived token expired or revoked. Needs Alex to page.
    category = 'auth';
  } else if (
    status === 429 ||
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613
  ) {
    category = 'rate-limited';
  } else if (status === 403 && code === 200) {
    // Missing scope — token was issued before we added the messaging
    // scope. Re-run OAuth.
    category = 'missing-scope';
  } else if (status >= 500) {
    category = 'meta-outage';
  }

  console.warn(
    `[ig-profile] fetch failed igsid=${igsid} category=${category} ` +
      `status=${status} code=${code ?? '-'} sub=${sub ?? '-'} msg="${message}"`,
  );
}
