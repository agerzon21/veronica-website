/**
 * Shared Postgres client (Neon serverless driver).
 *
 * The neon() helper returns a tagged-template SQL function. Use it like:
 *   const sql = getDb();
 *   const rows = await sql`select * from client_galleries where password = ${pwd}`;
 *
 * Parameters interpolated via ${} are bound as Postgres parameters — no
 * injection risk, no manual escaping needed.
 *
 * Underscore-prefixed filename so Vercel does not expose it as an HTTP route.
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let cached: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> {
  if (cached) return cached;
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      'POSTGRES_URL env var is missing. Check Vercel project Settings → Environment Variables.',
    );
  }
  cached = neon(url);
  return cached;
}
