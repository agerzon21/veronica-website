/**
 * The one place that POSTs the Vercel Deploy Hook.
 *
 * WHY IT MATTERS BEYOND "REFRESH THE SEO PAGES"
 * Prerendered pages are a build-time snapshot served from the filesystem, which
 * Vercel resolves BEFORE any rewrite. So once /journal/<slug>.html exists, that
 * file answers the URL — the runtime API predicate
 * (status = 'published' AND published_at IS NOT NULL) is no longer consulted.
 *
 * That makes a rebuild part of TAKEDOWN, not just publication. Unpublishing or
 * deleting a post removes it from the database and from the live SPA, but the
 * static file keeps returning 200 with the full article text in its noscript,
 * the correct title, and a working link preview until the next build. These
 * posts name real venues and towns, so "a client asked us to take it down" has
 * to actually take it down. After a hard delete the static HTML is the only
 * remaining copy of the text, which is the worst version of this.
 *
 * Every caller is therefore expected to trigger a build on REMOVAL as well as
 * on publish. Callers never fail their own request because of this — a hook
 * that is unset or down must not block deleting a post.
 */

export type DeployHookResult =
  | { ok: true }
  | { ok: false; reason: 'unconfigured' }
  | { ok: false; reason: 'unreachable'; detail: string }
  | { ok: false; reason: 'rejected'; status: number };

/**
 * @param why short label for the log line, e.g. 'journal-delete'. Never
 *            include the hook URL itself — it is a credential.
 */
export async function triggerDeployHook(why: string): Promise<DeployHookResult> {
  const url = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!url) {
    console.log(`[deploy-hook] ${why}: VERCEL_DEPLOY_HOOK_URL not set — no rebuild triggered`);
    return { ok: false, reason: 'unconfigured' };
  }

  try {
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      console.warn(`[deploy-hook] ${why}: Vercel returned ${res.status}`);
      return { ok: false, reason: 'rejected', status: res.status };
    }
    console.log(`[deploy-hook] ${why}: rebuild triggered`);
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[deploy-hook] ${why}: request failed: ${detail}`);
    return { ok: false, reason: 'unreachable', detail };
  }
}

/**
 * Fire-and-report variant for handlers whose own success must not depend on the
 * rebuild. Awaited deliberately rather than left floating: a serverless function
 * can be frozen the moment it responds, which would silently drop the request.
 */
export async function triggerDeployHookQuietly(why: string): Promise<void> {
  try {
    await triggerDeployHook(why);
  } catch (err) {
    console.warn(`[deploy-hook] ${why}: unexpected error`, err);
  }
}
