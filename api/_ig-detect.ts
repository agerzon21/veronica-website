/**
 * Shared helper for detecting an out-of-band Instagram token rotation.
 *
 * The admin UI has a "Mark as Refreshed" button for the human to signal
 * "I rotated the token, reset the reminder clock." That works but
 * depends on the human remembering. This helper eliminates the manual
 * step: whenever it runs, it compares a hash of the current
 * IG_ACCESS_TOKEN env var against the hash we stored the last time we
 * looked. If different, a rotation happened → stamp the refresh
 * timestamp + new hash automatically, and clear any pending reminder
 * dedupe.
 *
 * Called from:
 *   - /api/admin/instagram-status  (fires when the admin card renders)
 *   - /api/cron/instagram-check    (fires daily)
 *
 * Not called from /api/instagram-feed (that's on the request hot path
 * and doesn't need this — the cron will catch any rotation within 24h).
 *
 * We hash rather than store the token itself: even if the DB were ever
 * compromised, the hash doesn't leak the actual credential. SHA-256
 * truncated to 32 hex chars (128 bits) is plenty of collision
 * resistance for the "did this string change" question.
 */

import crypto from 'node:crypto';
import { getDb } from './_db.js';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
}

export interface DetectResult {
  detected: boolean;
  refreshedAt?: string;
}

export async function detectAndMarkRotation(): Promise<DetectResult> {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) return { detected: false };
  const currentHash = hashToken(token);

  const sql = getDb();
  const rows = (await sql`
    SELECT updated_at, value
    FROM system_state
    WHERE key = 'ig_token_refreshed'
    LIMIT 1
  `) as Array<{ updated_at: string; value: string | null }>;

  if (rows.length === 0) {
    // No row at all — bootstrap. Store the current hash + NOW as a
    // reasonable "we first saw this token today" baseline. If Alex
    // knows the actual rotation date was earlier, he can UPDATE the
    // timestamp manually in Neon.
    await sql`
      INSERT INTO system_state (key, updated_at, value)
      VALUES ('ig_token_refreshed', NOW(), ${currentHash})
    `;
    return { detected: false };
  }

  const storedHash = rows[0].value;

  if (storedHash === null) {
    // Row exists but hash was never recorded (this covers the interim
    // state after migration 003 lands but before the first status
    // check runs). Store the hash without touching the timestamp — we
    // trust the seeded/existing rotation date.
    await sql`
      UPDATE system_state SET value = ${currentHash} WHERE key = 'ig_token_refreshed'
    `;
    return { detected: false };
  }

  if (storedHash === currentHash) {
    // Same token as we last saw. No rotation.
    return { detected: false };
  }

  // Hashes differ → real rotation happened outside the admin flow.
  // Stamp NOW + new hash, and clear the reminder dedupe so the fresh
  // 60-day cycle starts clean (no lingering "already reminded" flag).
  const result = (await sql`
    UPDATE system_state
    SET updated_at = NOW(), value = ${currentHash}
    WHERE key = 'ig_token_refreshed'
    RETURNING updated_at
  `) as Array<{ updated_at: string }>;

  await sql`DELETE FROM system_state WHERE key = 'ig_token_reminded_at'`;

  return { detected: true, refreshedAt: result[0]?.updated_at };
}
