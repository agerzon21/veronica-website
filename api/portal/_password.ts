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
 * Passwords cannot be hashed by SQL, you need the plaintext, and only the
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
// cost of a serverless invocation here, portal logins are rare.
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
 * A row with no hash simply cannot authenticate. That is correct, it means the
 * client has been invited but has not set a password yet, and the way in is the
 * setup token or a reset link, not a password comparison.
 */
/**
 * A hash nobody's password matches: the password it was made from was random
 * and thrown away. Compared against when there is no real hash to compare.
 */
const NOBODY_HASH =
  'scrypt$5c25ec7281f5117fa93a8d0790d28c15$2892501a14ae68f3ad99de09e021b01d3b9760e24024a6b4545408c8c855a96f3b1e378c1649635f3416ad198c3b2da7ff698b465fe6a387c9c87d5d19a5e37f';

export function checkPortalPassword(
  supplied: string,
  storedHash: string | null | undefined,
): { ok: boolean } {
  /**
   * THE SAME WORK WHETHER OR NOT ANYONE HAS THIS ADDRESS (audit, 2026-09-20).
   * Every caller already answers a wrong address and a wrong password with
   * the same 401 after the same delay, but scrypt ran only when a row was
   * found, so an address that belongs to a client took measurably longer to
   * refuse than one that does not, and timing alone told an outsider who the
   * clients are. Now an absent row, or one with no password yet, is hashed
   * against NOBODY_HASH, and callers pass `row?.client_password_hash` BEFORE
   * testing the row, so there is always exactly one scrypt per attempt.
   */
  const usable = typeof storedHash === 'string' && storedHash.startsWith('scrypt$');
  const matched = verifyPortalHash(supplied, usable ? storedHash : NOBODY_HASH);
  return { ok: usable && matched };
}
