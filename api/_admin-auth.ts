/**
 * Admin auth check — used by every /api/admin/* endpoint.
 *
 * Two-part story:
 *   - LOGIN: the client sends { email, password }. We check that pair
 *     matches ONE of the two env-var pairs (Vero = admin, Alex = super).
 *     Requiring email raises the brute-force cost dramatically — an
 *     attacker who finds /admin needs to guess both fields.
 *   - AFTER LOGIN: the password alone is stored in React state and sent
 *     with every subsequent API call as the "session token." No email
 *     re-check on those calls — the password itself is the secret.
 *     Refreshing the tab boots back to the login screen.
 *
 * The 750ms delay on failure is the same anti-brute-force pattern used
 * on the client portal endpoints. Prevents a naive script from
 * churning through the space faster than a human can.
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
 * Login check — requires BOTH email and password.
 *   - LOGIN_ADMIN_EMAIL + ADMIN_PASSWORD       → level 'admin' (Vero)
 *   - LOGIN_SUPER_EMAIL + SUPER_ADMIN_PASSWORD → level 'super' (Alex)
 *
 * Called only by the login endpoint. All other admin endpoints use
 * requireAdmin(password) below, which checks the password alone.
 *
 * A wrong email OR wrong password both surface as "Incorrect email or
 * password" so an attacker can't distinguish "no such account" from
 * "wrong password."
 */
export async function loginAdmin(
  email: unknown,
  password: unknown,
): Promise<{ ok: true; level: AdminLevel } | AdminAuthFail> {
  const expectedAdminEmail = process.env.LOGIN_ADMIN_EMAIL;
  const expectedSuperEmail = process.env.LOGIN_SUPER_EMAIL;
  const expectedAdmin = process.env.ADMIN_PASSWORD;
  const expectedSuper = process.env.SUPER_ADMIN_PASSWORD;
  if (!expectedAdmin || !expectedAdminEmail) {
    console.error('[admin] Login env vars missing (LOGIN_ADMIN_EMAIL, ADMIN_PASSWORD)');
    return { ok: false, status: 500, error: 'Admin is not configured.' };
  }
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return { ok: false, status: 401, error: 'Email and password required' };
  }
  const emailLc = email.trim().toLowerCase();
  if (
    expectedSuper &&
    expectedSuperEmail &&
    emailLc === expectedSuperEmail.toLowerCase() &&
    password === expectedSuper
  ) {
    return { ok: true, level: 'super' };
  }
  if (emailLc === expectedAdminEmail.toLowerCase() && password === expectedAdmin) {
    return { ok: true, level: 'admin' };
  }
  await sleep(WRONG_AUTH_DELAY_MS);
  return { ok: false, status: 401, error: 'Incorrect email or password' };
}

/**
 * Validates the admin password on subsequent API calls (after login).
 * Two tiers:
 *   - ADMIN_PASSWORD       → level 'admin' (read + edit + non-destructive actions)
 *   - SUPER_ADMIN_PASSWORD → level 'super' (everything 'admin' can do, plus deletes)
 *
 * Endpoints that perform destructive actions (deleting portals) should
 * gate themselves on level === 'super'. Read/edit endpoints accept either.
 *
 * NOTE: this is post-login. The email requirement is enforced at login;
 * once the client has a valid password we treat it as a bearer token.
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
