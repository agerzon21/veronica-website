/**
 * Admin password check — used by every /api/admin/* endpoint.
 *
 * Same pattern as the client portal: no sessions. The admin password
 * lives in React state on the /admin page and is sent with every API
 * call. Refreshing the tab boots back to the login screen. Acceptable
 * for an MVP that only has one admin (Veronika); revisit if multiple
 * staff start needing access.
 *
 * The 750ms delay on a bad password is the same anti-brute-force
 * pattern used on the client portal endpoints.
 */

const WRONG_AUTH_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type AdminLevel = 'admin' | 'super';

export interface AdminAuthFail {
  ok: false;
  status: number;
  error: string;
}

/**
 * Validates the admin password. Two tiers:
 *   - ADMIN_PASSWORD       → level 'admin' (read + edit + non-destructive actions)
 *   - SUPER_ADMIN_PASSWORD → level 'super' (everything 'admin' can do, plus deletes)
 *
 * Endpoints that perform destructive actions (deleting portals) should
 * gate themselves on level === 'super'. Read/edit endpoints accept either.
 */
export async function requireAdmin(password: unknown): Promise<{ ok: true; level: AdminLevel } | AdminAuthFail> {
  const expectedAdmin = process.env.ADMIN_PASSWORD;
  const expectedSuper = process.env.SUPER_ADMIN_PASSWORD;
  if (!expectedAdmin) {
    console.error('[admin] ADMIN_PASSWORD env var is missing');
    return { ok: false, status: 500, error: 'Admin is not configured. Please set ADMIN_PASSWORD.' };
  }
  if (typeof password !== 'string' || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return { ok: false, status: 401, error: 'Password required' };
  }
  if (expectedSuper && password === expectedSuper) {
    return { ok: true, level: 'super' };
  }
  if (password === expectedAdmin) {
    return { ok: true, level: 'admin' };
  }
  await sleep(WRONG_AUTH_DELAY_MS);
  return { ok: false, status: 401, error: 'Incorrect password' };
}

export function requireSuper(level: AdminLevel): { ok: true } | AdminAuthFail {
  if (level === 'super') return { ok: true };
  return {
    ok: false,
    status: 403,
    error: 'Super-admin password required for this action.',
  };
}
