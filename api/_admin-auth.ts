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

import { createHash, randomBytes } from 'node:crypto';
import { getDb } from './_db.js';
import { verifyPortalHash } from './portal/_password.js';

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
// ── Session tokens ────────────────────────────────────────────────────────
// Only the SHA-256 of a token is stored, so a database leak does not hand over
// live sessions. Same reasoning as client_portals.reset_token_hash.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** A session token is 64 hex chars; an admin password is not. Cheap discriminator. */
const looksLikeToken = (v: string) => /^[a-f0-9]{64}$/.test(v);

export async function createAdminSession(userId: string, userAgent?: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const sql = getDb();
  await sql`
    INSERT INTO admin_sessions (token_hash, user_id, expires_at, user_agent)
    VALUES (${sha256(token)}, ${userId}, ${new Date(Date.now() + SESSION_TTL_MS).toISOString()}, ${userAgent ?? null})
  `;
  return token;
}

export async function destroyAdminSession(token: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM admin_sessions WHERE token_hash = ${sha256(token)}`;
}

/** Resolves a session token to a live, active user. Null for anything invalid. */
async function resolveSession(
  token: string,
): Promise<{ level: AdminLevel; userId: string } | null> {
  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT s.user_id, s.expires_at, u.level, u.is_active
      FROM admin_sessions s
      JOIN admin_users u ON u.id = s.user_id
      WHERE s.token_hash = ${sha256(token)}
      LIMIT 1
    `) as Array<{ user_id: string; expires_at: string; level: AdminLevel; is_active: boolean }>;
    const row = rows[0];
    if (!row || !row.is_active) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    return { level: row.level, userId: row.user_id };
  } catch (err) {
    // The tables may not exist yet (migration 026 not applied). Fail closed on
    // the token path — the env-password path below still works, so this can
    // never lock anyone out.
    console.error('[admin] session lookup failed:', err);
    return null;
  }
}

/** Looks a user up by email and verifies their password against the hash. */
async function loginFromDb(
  emailLc: string,
  password: string,
): Promise<{ level: AdminLevel; userId: string } | null> {
  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, password_hash, level, is_active
      FROM admin_users
      WHERE LOWER(email) = ${emailLc}
      LIMIT 1
    `) as Array<{ id: string; password_hash: string; level: AdminLevel; is_active: boolean }>;
    const row = rows[0];
    if (!row || !row.is_active) return null;
    if (!verifyPortalHash(password, row.password_hash)) return null;
    await sql`UPDATE admin_users SET last_login_at = NOW() WHERE id = ${row.id}`;
    return { level: row.level, userId: row.id };
  } catch (err) {
    console.error('[admin] db login failed, falling back to env vars:', err);
    return null;
  }
}

/**
 * The admin_users row that an ENV-VAR login corresponds to, if there is one.
 *
 * requireAdmin only ever returns 'super' for SUPER_ADMIN_PASSWORD and 'admin'
 * for ADMIN_PASSWORD, so the level identifies which LOGIN_*_EMAIL is meant.
 *
 * Returns null when there is no such row, when the emails are unconfigured, or
 * when the lookup FAILS. That last case is deliberate: this function gates the
 * env-var fallback, and the whole point of that fallback is that a database
 * problem can never lock anyone out of their own admin panel. A failed lookup
 * therefore means "no opinion", not "deny".
 */
/** The lower-cased emails that the env-var credentials correspond to. */
export function envBackedEmails(): string[] {
  return [process.env.LOGIN_SUPER_EMAIL, process.env.LOGIN_ADMIN_EMAIL]
    .map((e) => e?.trim().toLowerCase())
    .filter((e): e is string => !!e);
}

export async function lookupEnvAccount(
  level: AdminLevel,
): Promise<{ id: string; isActive: boolean } | null> {
  const email = (
    level === 'super' ? process.env.LOGIN_SUPER_EMAIL : process.env.LOGIN_ADMIN_EMAIL
  )
    ?.trim()
    .toLowerCase();
  if (!email) return null;
  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, is_active FROM admin_users WHERE LOWER(email) = ${email} LIMIT 1
    `) as Array<{ id: string; is_active: boolean }>;
    return rows[0] ? { id: rows[0].id, isActive: rows[0].is_active } : null;
  } catch (err) {
    console.error('[admin] env-account lookup failed, treating as unknown:', err);
    return null;
  }
}

/**
 * True only when the env-var account has been explicitly DISABLED in the panel.
 *
 * Without this, "Disable access" is a lie for the two env-backed accounts:
 * flipping is_active stops the database login path, but the env password keeps
 * working and hands back full access. Unknown/absent/errored all mean "not
 * disabled", so the fallback stays lockout-proof.
 */
async function envAccountDisabled(level: AdminLevel): Promise<boolean> {
  const account = await lookupEnvAccount(level);
  return account !== null && !account.isActive;
}

export async function loginAdmin(
  email: unknown,
  password: unknown,
): Promise<{ ok: true; level: AdminLevel; userId?: string } | AdminAuthFail> {
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

  // Database first. If admin_users has this person, that is the source of
  // truth. Falls through to the env vars when the table is empty, missing, or
  // does not know them — which is what makes the migration a non-event.
  const dbUser = await loginFromDb(emailLc, password);
  if (dbUser) {
    return { ok: true, level: dbUser.level, userId: dbUser.userId };
  }

  if (
    expectedSuper &&
    expectedSuperEmail &&
    emailLc === expectedSuperEmail.toLowerCase() &&
    password === expectedSuper
  ) {
    if (await envAccountDisabled('super')) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return { ok: false, status: 401, error: 'Incorrect email or password' };
    }
    return { ok: true, level: 'super' };
  }
  if (emailLc === expectedAdminEmail.toLowerCase() && password === expectedAdmin) {
    if (await envAccountDisabled('admin')) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return { ok: false, status: 401, error: 'Incorrect email or password' };
    }
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
export async function requireAdmin(
  password: unknown,
): Promise<{ ok: true; level: AdminLevel; userId?: string } | AdminAuthFail> {
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

  // A session token looks like 64 hex chars. Try that first — but ONLY as an
  // additional path. If it does not resolve we fall straight through to the
  // env-var comparison below, so a missing table, an expired row or a botched
  // seed can never lock anyone out of their own admin panel.
  if (looksLikeToken(password)) {
    const session = await resolveSession(password);
    if (session) return { ok: true, level: session.level, userId: session.userId };
  }

  if (expectedSuper && password === expectedSuper) {
    if (await envAccountDisabled('super')) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return { ok: false, status: 401, error: 'Incorrect password' };
    }
    return { ok: true, level: 'super' };
  }
  if (password === expectedAdmin) {
    if (await envAccountDisabled('admin')) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return { ok: false, status: 401, error: 'Incorrect password' };
    }
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
