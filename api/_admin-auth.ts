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

export interface AdminAuthFail {
  ok: false;
  status: number;
  error: string;
}

export async function requireAdmin(password: unknown): Promise<{ ok: true } | AdminAuthFail> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    console.error('[admin] ADMIN_PASSWORD env var is missing');
    return { ok: false, status: 500, error: 'Admin is not configured. Please set ADMIN_PASSWORD.' };
  }
  if (typeof password !== 'string' || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return { ok: false, status: 401, error: 'Password required' };
  }
  if (password !== expected) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return { ok: false, status: 401, error: 'Incorrect password' };
  }
  return { ok: true };
}
