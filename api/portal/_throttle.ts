/**
 * A brake on guessing passwords at the client portal.
 *
 * WHY THIS EXISTS. Every portal endpoint already answers a wrong password
 * with the same 401 after the same 750 ms, but nothing counted attempts, so
 * the delay was the only brake and parallel requests walk straight past it.
 * What is behind the door matters: a portal holds a client's contract, their
 * address and their payments, and a gallery password is a short word in a
 * shareable link. So failures are counted here, per email and per IP, over a
 * 15 minute window, and past a limit the answer is a 429 that says how long to
 * wait. A client who mistypes a few times never gets near it.
 *
 * WHAT IS STORED. Only a sha256 of "email:<address>" or "ip:<address>" and a
 * count (migration 051). This is a speed bump, not a log of who tried what.
 *
 * NEVER A REASON TO REFUSE BY ITSELF FAILING. Before migration 051, or with
 * the database briefly away, every function here quietly allows. Locking every
 * client out because a counter could not be read would be a worse outage than
 * the one this prevents.
 */

import { createHash } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import type { getDb } from '../_db.js';

type Sql = ReturnType<typeof getDb>;

const WINDOW_MINUTES = 15;

/** Failures allowed per window before the next attempt is refused unseen. */
export const THROTTLE_LIMITS = {
  /** One client address: generous for a person, small for a script. */
  email: 10,
  /** One network: several clients can share a wedding venue's wifi. */
  ip: 30,
  /** Gallery passwords, guessed from one network. */
  gallery: 20,
  /** Reset emails asked for, per address and per network. */
  resetEmail: 3,
  resetIp: 10,
} as const;

export interface ThrottleKey {
  key: string;
  limit: number;
}

const hashKey = (kind: string, value: string) =>
  createHash('sha256').update(`${kind}:${value.trim().toLowerCase()}`).digest('hex');

/** The client's address as Vercel reports it: the first hop it saw. */
export function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

/** The keys for an email + password check: the address, and the network. */
export function portalKeys(req: VercelRequest, email: string): ThrottleKey[] {
  return [
    { key: hashKey('email', email), limit: THROTTLE_LIMITS.email },
    { key: hashKey('ip', clientIp(req)), limit: THROTTLE_LIMITS.ip },
  ];
}

/** The key for a gallery password check: the network only, there is no email. */
export function galleryKeys(req: VercelRequest): ThrottleKey[] {
  return [{ key: hashKey('gallery-ip', clientIp(req)), limit: THROTTLE_LIMITS.gallery }];
}

/** The keys for a reset request: every request counts, found or not. */
export function resetKeys(req: VercelRequest, email: string): ThrottleKey[] {
  return [
    { key: hashKey('reset-email', email), limit: THROTTLE_LIMITS.resetEmail },
    { key: hashKey('reset-ip', clientIp(req)), limit: THROTTLE_LIMITS.resetIp },
  ];
}

/**
 * Has any of these keys used up its window? Checked BEFORE the password is,
 * so a refused attempt costs no scrypt and teaches nothing.
 */
export async function throttled(
  sql: Sql,
  keys: ThrottleKey[],
): Promise<{ blocked: boolean; retryAfterSec: number }> {
  try {
    const rows = (await sql`
      SELECT key, failures,
             GREATEST(0, EXTRACT(EPOCH FROM (window_started_at + make_interval(mins => ${WINDOW_MINUTES}) - NOW())))::int AS left_sec
      FROM auth_throttle
      WHERE key = ANY(${keys.map((k) => k.key)})
        AND window_started_at > NOW() - make_interval(mins => ${WINDOW_MINUTES})
    `) as Array<{ key: string; failures: number; left_sec: number }>;
    let retryAfterSec = 0;
    for (const r of rows) {
      const limit = keys.find((k) => k.key === r.key)?.limit ?? Infinity;
      if (r.failures >= limit) retryAfterSec = Math.max(retryAfterSec, r.left_sec);
    }
    return { blocked: retryAfterSec > 0, retryAfterSec };
  } catch (err) {
    console.warn('[throttle] check skipped (migration 051?):', (err as Error).message);
    return { blocked: false, retryAfterSec: 0 };
  }
}

/** Count one failure against each key, starting a fresh window when the last one ran out. */
export async function recordFailure(sql: Sql, keys: ThrottleKey[]): Promise<void> {
  try {
    for (const { key } of keys) {
      await sql`
        INSERT INTO auth_throttle (key, failures, window_started_at, last_failure_at)
        VALUES (${key}, 1, NOW(), NOW())
        ON CONFLICT (key) DO UPDATE SET
          failures = CASE
            WHEN auth_throttle.window_started_at <= NOW() - make_interval(mins => ${WINDOW_MINUTES}) THEN 1
            ELSE auth_throttle.failures + 1
          END,
          window_started_at = CASE
            WHEN auth_throttle.window_started_at <= NOW() - make_interval(mins => ${WINDOW_MINUTES}) THEN NOW()
            ELSE auth_throttle.window_started_at
          END,
          last_failure_at = NOW()
      `;
    }
    // Housekeeping instead of a cron: the table only ever holds failures.
    await sql`DELETE FROM auth_throttle WHERE last_failure_at < NOW() - INTERVAL '7 days'`;
  } catch (err) {
    console.warn('[throttle] failure not counted (migration 051?):', (err as Error).message);
  }
}

/** A correct password clears its address, so earlier typos do not linger. */
export async function clearFailures(sql: Sql, keys: ThrottleKey[]): Promise<void> {
  try {
    await sql`DELETE FROM auth_throttle WHERE key = ${keys[0].key}`;
  } catch {
    /* nothing to clear before migration 051 */
  }
}

/** What a refused client reads. */
export function tooManyAttempts(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`;
}
