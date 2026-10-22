/**
 * One client, any number of sessions (2026-10-22).
 *
 * Until now an email was one booking: a unique index refused a second, and
 * every portal endpoint looked up "the" full booking for the address that
 * signed in. A couple booking a wedding and an engagement, or coming back for
 * a family shoot, had nowhere to put the second one without a second email.
 *
 * The account is not a table. It is every full booking that shares an email
 * (migration 056 drops the one-booking-per-email index), and they share ONE
 * password: every place that sets a password sets it on all of them
 * (accountPasswordUpdate below), and a new booking for an existing email is
 * created with the account's password already on it.
 *
 * Every authenticated endpoint takes an optional portal_id. With it, the
 * request is about that session, and only if it belongs to the address that
 * signed in. Without it, the endpoint answers for the account's newest
 * session that has a password, which for every client with one session (all
 * of them, today) is exactly the booking it always answered for.
 */

import type { getDb } from '../_db.js';

type Sql = ReturnType<typeof getDb>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The session a request names, or null for the account's default. Anything
 * that is not a well-formed id reads as null rather than failing, because a
 * malformed one would otherwise reach a ::uuid cast and become a 500.
 */
export function requestedSession(body: unknown): string | null {
  // portalId too: the portal spreads its credentials object into most
  // requests, and that object carries the session as portalId.
  const b = body as { portal_id?: unknown; portalId?: unknown } | null | undefined;
  const v = b?.portal_id ?? b?.portalId;
  return typeof v === 'string' && UUID.test(v.trim()) ? v.trim().toLowerCase() : null;
}

/**
 * Set the account's password on every one of its sessions, as a lazy query to
 * await or to put in a transaction. The account is the full bookings with
 * this email, compared the way every lookup compares it.
 */
export function accountPasswordUpdate(sql: Sql, email: string, hash: string) {
  return sql`
    update client_portals
    set client_password_hash = ${hash}, updated_at = now()
    where mode = 'full' and lower(client_email) = lower(${email})
  `;
}

/**
 * The account's existing password, for a new session being added to it: the
 * newest session that has one. Null when the email has no account yet, or
 * one whose owner has not chosen a password (still on the setup link).
 */
export async function accountPasswordHash(sql: Sql, email: string): Promise<string | null> {
  const rows = (await sql`
    select client_password_hash from client_portals
    where mode = 'full' and lower(client_email) = lower(${email}) and client_password_hash is not null
    order by created_at desc
    limit 1
  `) as Array<{ client_password_hash: string }>;
  return rows[0]?.client_password_hash ?? null;
}
