/**
 * The money history of a booking (migration 052, audit M11): who changed what,
 * when, and from what to what.
 *
 * Every endpoint that lets a person change money calls historyInsert and puts
 * the result IN THE SAME TRANSACTION as the change (the neon query objects are
 * lazy, so a query built here runs wherever it is placed). A change without its
 * row, or a row without its change, cannot happen that way.
 *
 * Automatic records are left out on purpose: a card payment arriving from
 * Stripe is already its own row in payment_entries, with the PaymentIntent to
 * prove it. This is for the edits a person makes, which used to leave nothing.
 */

import type { getDb } from './_db.js';

type Sql = ReturnType<typeof getDb>;

export type MoneyAction =
  | 'total'
  | 'retainer'
  | 'complimentary'
  | 'sales_tax'
  | 'payment_added'
  | 'tip_added'
  | 'payment_deleted'
  | 'discount_waived'
  | 'charge_added'
  | 'charge_deleted'
  | 'insurance'
  | 'booking_deleted';

export interface MoneyHistoryRow {
  id: string;
  at: string;
  actor: string;
  action: MoneyAction;
  detail: Record<string, unknown>;
}

/**
 * Who is acting, as the history shows it: their name when they signed in
 * with one, otherwise the level. Never throws; a missing name is not worth
 * failing a save over.
 */
export async function actorName(
  sql: Sql,
  auth: { level: string; userId?: string },
): Promise<string> {
  if (auth.userId) {
    try {
      const [u] = (await sql`
        SELECT display_name, email FROM admin_users WHERE id = ${auth.userId} LIMIT 1
      `) as Array<{ display_name: string | null; email: string | null }>;
      const name = u?.display_name?.trim() || u?.email?.split('@')[0];
      if (name) return name.slice(0, 60);
    } catch {
      /* fall through to the level */
    }
  }
  return auth.level === 'super' ? 'Super admin' : 'Admin';
}

/**
 * One history row, as a lazy query to put in the change's own transaction.
 * The booking's name is read from the row at that moment.
 */
export function historyInsert(
  sql: Sql,
  portalId: string,
  actor: string,
  action: MoneyAction,
  detail: Record<string, unknown>,
  /**
   * Only while the contract is unsigned, for rows written next to the guarded
   * price writes in _portal-update.ts: when the client has signed first those
   * writes change nothing, and a history row saying they did would be false.
   */
  options: { unsignedOnly?: boolean } = {},
) {
  return options.unsignedOnly
    ? sql`
        INSERT INTO money_history (client_portal_id, booking_name, actor, action, detail)
        SELECT ${portalId}, cp.client_display_name, ${actor}, ${action}, ${JSON.stringify(detail)}::jsonb
        FROM client_portals cp WHERE cp.id = ${portalId} AND cp.contract_status <> 'signed'
      `
    : sql`
        INSERT INTO money_history (client_portal_id, booking_name, actor, action, detail)
        SELECT ${portalId}, cp.client_display_name, ${actor}, ${action}, ${JSON.stringify(detail)}::jsonb
        FROM client_portals cp WHERE cp.id = ${portalId}
      `;
}

/** A booking's history, newest first. Empty before migration 052. */
export async function readHistory(sql: Sql, portalId: string, limit = 200): Promise<MoneyHistoryRow[]> {
  try {
    const rows = (await sql`
      SELECT id, at, actor, action, detail
      FROM money_history
      WHERE client_portal_id = ${portalId}
      ORDER BY at DESC
      LIMIT ${limit}
    `) as Array<{ id: string; at: string | Date; actor: string; action: MoneyAction; detail: Record<string, unknown> }>;
    return rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() }));
  } catch (err) {
    console.warn('[money-history] unavailable (migration 052?):', (err as Error).message);
    return [];
  }
}

/**
 * Whether money_history exists yet. Writers check once per request so that a
 * deploy that lands before migration 052 keeps every money edit working, just
 * unrecorded, rather than failing the edit because its history could not be
 * written.
 */
export async function historyReady(sql: Sql): Promise<boolean> {
  try {
    const [r] = (await sql`SELECT to_regclass('public.money_history') IS NOT NULL AS ok`) as Array<{ ok: boolean }>;
    return r?.ok === true;
  } catch {
    return false;
  }
}
