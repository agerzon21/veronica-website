import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Client-portal password hashing.
 *
 * db/migrations/001-baseline-client-portals.sql:72 stored the password in
 * PLAINTEXT, with its own comment calling it "a known security bug flagged for
 * the near-term fix list". It stayed that way. Anyone with database access
 * could read every client's portal password.
 *
 * WHY node:crypto scrypt AND NOT bcrypt
 * bcrypt ships native bindings, which is a real risk in Vercel's serverless
 * runtime and a new dependency to keep building. scrypt is in Node's standard
 * library, is memory-hard, and is explicitly recommended for password storage.
 * api/portal/_sign-contract.ts already imports node:crypto, so there is nothing
 * new to install and nothing new that can fail to build.
 *
 * WHY THERE IS NO BULK MIGRATION SCRIPT
 * Passwords cannot be hashed by SQL — you need the plaintext, and only the
 * client knows it. Rather than a one-shot script (which would need the
 * plaintext out of the database and into a process, exactly what we are trying
 * to stop), this upgrades lazily:
 *
 *   verify() checks the hash if there is one. If there is not, it falls back to
 *   the plaintext column, and on a SUCCESSFUL match the caller writes the hash.
 *
 * So every client is migrated the next time they log in, transparently, with
 * the same password they already have. Nothing to communicate, no resets.
 *
 * The plaintext column is deliberately NOT dropped yet. Until every active
 * client has logged in once, it is still the only credential some rows have.
 * Dropping it is a separate migration, once
 *   SELECT count(*) FROM client_portals
 *   WHERE client_password IS NOT NULL AND client_password_hash IS NOT NULL
 * shows the backfill is effectively complete.
 */

const KEYLEN = 64;
// scrypt defaults (N=16384) are the Node standard and comfortably above the
// cost of a serverless invocation here — portal logins are rare.
const SALT_BYTES = 16;

/** Format: scrypt$<saltHex>$<keyHex>. Self-describing so the algorithm can change later. */
export function hashPortalPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(plain, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/** Constant-time check of a plaintext against a stored hash. Never throws. */
export function verifyPortalHash(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = scryptSync(plain, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * The single decision point for "is this the right portal password".
 *
 * Until migration 027 this also compared a legacy plaintext column and told the
 * caller to upgrade the row on a match. That column is gone: every row was
 * hashed by scripts/hash-client-passwords.mjs and the plaintext NULLed, so the
 * fallback had been dead code for a release before it was removed.
 *
 * A row with no hash simply cannot authenticate. That is correct — it means the
 * client has been invited but has not set a password yet, and the way in is the
 * setup token or a reset link, not a password comparison.
 */
export function checkPortalPassword(
  supplied: string,
  storedHash: string | null | undefined,
): { ok: boolean } {
  return { ok: !!storedHash && verifyPortalHash(supplied, storedHash) };
}
