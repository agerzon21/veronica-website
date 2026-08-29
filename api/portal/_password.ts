import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Client-portal password hashing.
 *
 * db/migrations/001-baseline-client-portals.sql:72 stored client_password in
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
 * Returns whether it matched, and whether the caller should now write a hash
 * (true only when the match came from the legacy plaintext column).
 *
 * Constant-time-ish by construction: the hash path always runs scrypt, and the
 * plaintext path is only reached when no hash exists at all.
 */
export function checkPortalPassword(
  supplied: string,
  storedHash: string | null | undefined,
  storedPlain: string | null | undefined,
): { ok: boolean; needsUpgrade: boolean } {
  if (storedHash) {
    return { ok: verifyPortalHash(supplied, storedHash), needsUpgrade: false };
  }
  // Legacy row: no hash yet. Compare the plaintext, and tell the caller to
  // upgrade it if this was correct.
  if (storedPlain != null && storedPlain.length > 0 && supplied === storedPlain) {
    return { ok: true, needsUpgrade: true };
  }
  return { ok: false, needsUpgrade: false };
}
