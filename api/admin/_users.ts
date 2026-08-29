import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomInt } from 'node:crypto';
import { getDb } from '../_db.js';
import { requireAdmin, lookupEnvAccount } from '../_admin-auth.js';
import { hashPortalPassword, verifyPortalHash } from '../portal/_password.js';

/**
 * Admin user management. One handler, several sub-actions, because api/ is at
 * 12/12 top-level slots and a screen this small does not justify spending the
 * dispatcher budget on four separate files.
 *
 * POST { password, op: 'list' }                                      → super only
 * POST { password, op: 'create', email, display_name, level }        → super only
 * POST { password, op: 'set-active', user_id, is_active }            → super only
 * POST { password, op: 'change-own', current_password, new_password } → any admin
 *   (also the break-glass reset when authenticated by env password — see below)
 * POST { password, op: 'signout-others' }                            → any admin
 *
 * WHY THE SELF-SERVICE OPS ARE NOT SUPER-ONLY
 * change-own and signout-others touch nothing but the caller's own account, so
 * gating them on super would mean a non-super admin could never rotate the
 * one-time password they were issued.
 *
 * WHY change-own IS NOT SUPER-ONLY
 * Everyone needs to be able to rotate their own password without asking
 * someone else. It re-verifies the current password rather than trusting the
 * session, so a borrowed unlocked laptop cannot be used to lock the owner out
 * of their own account.
 *
 * WHY THERE IS NO 'set-password-for-another-user'
 * That would let one admin silently take over another's account. Creating a
 * user issues a one-time password instead, shown once to whoever created it —
 * so the act of granting access is visible and deliberate rather than something
 * that can be done quietly to an existing account.
 *
 * WHY DEACTIVATE AND NOT DELETE
 * is_active = false ends access immediately (resolveSession joins on it) while
 * keeping the row, so admin_sessions rows and any future audit trail still
 * point at a real user rather than a dangling id.
 */

const MIN_PASSWORD_LENGTH = 8;

/** Ops that act only on the caller's own account. Every admin level gets these. */
const SELF_SERVICE_OPS = new Set(['change-own', 'signout-others']);

/**
 * The one-time password for a newly created account. Shown once to whoever
 * created it, passed on out-of-band, then changed by its owner. Deliberately
 * not emailed: that would be another template and another delivery failure
 * mode for something handed over in person or by text anyway.
 *
 * randomInt (CSPRNG), NOT Math.random — this is the sole credential for an
 * account with access to every client record on the site. Math.random is
 * xorshift128+, whose internal state is recoverable from a few observed
 * outputs.
 *
 * The alphabet drops 0/O/1/l/I so it can be read aloud or copied off a screen
 * without ambiguity. 16 characters over a 32-character alphabet is 80 bits,
 * and the length is FIXED rather than derived from a float's decimal expansion
 * — the previous base-36 slice could land well under MIN_PASSWORD_LENGTH.
 */
const TEMP_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
function generateTemporaryPassword(): string {
  const group = () =>
    Array.from({ length: 4 }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join('');
  return `${group()}-${group()}-${group()}-${group()}`;
}

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  level: 'admin' | 'super';
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
};

/**
 * Delete every session for a user EXCEPT the one making the request.
 *
 * Hashed in JS rather than with Postgres digest() — that needs the pgcrypto
 * extension, which this database does not have enabled.
 *
 * Callers must check auth.userId first — both call sites return 409 for an
 * env-var login, which has no user row and therefore no sessions to manage.
 */
async function dropOtherSessions(
  sql: ReturnType<typeof getDb>,
  userId: string,
  rawToken: unknown,
): Promise<number> {
  const currentTokenHash = createHash('sha256')
    .update(String(rawToken ?? ''))
    .digest('hex');
  const rows = (await sql`
    DELETE FROM admin_sessions
    WHERE user_id = ${userId} AND token_hash <> ${currentTokenHash}
    RETURNING token_hash
  `) as Array<{ token_hash: string }>;
  return rows.length;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const op = typeof req.body?.op === 'string' ? req.body.op : '';
  const sql = getDb();

  // Self-service ops act only on the caller's own account, so every admin gets
  // them. Everything that touches OTHER accounts is super-only.
  const needsSuper = !SELF_SERVICE_OPS.has(op);
  if (needsSuper && auth.level !== 'super') {
    return res.status(403).json({ success: false, error: 'Requires super-admin access.' });
  }

  try {
    if (op === 'list') {
      const rows = (await sql`
        SELECT id, email, display_name, level, is_active, last_login_at, created_at
        FROM admin_users
        ORDER BY level DESC, email
      `) as UserRow[];

      // Live session count per user, so it is obvious who is currently signed
      // in somewhere — the main thing you want to know before deactivating.
      const sessions = (await sql`
        SELECT user_id, count(*)::int AS n
        FROM admin_sessions
        WHERE expires_at > NOW()
        GROUP BY user_id
      `) as Array<{ user_id: string; n: number }>;
      const byUser = new Map(sessions.map((s) => [s.user_id, s.n]));

      return res.status(200).json({
        success: true,
        // The caller's own id, so the UI can mark their row and hide the
        // disable button on it. An env-var login carries no userId, so resolve
        // it from the LOGIN_*_EMAIL the level implies — otherwise the operator
        // is shown a "Disable access" button on their own row.
        me: auth.userId ?? (await lookupEnvAccount(auth.level))?.id ?? null,
        users: rows.map((r) => ({ ...r, active_sessions: byUser.get(r.id) ?? 0 })),
      });
    }

    if (op === 'create') {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const displayName =
        typeof req.body?.display_name === 'string' ? req.body.display_name.trim() : '';
      const level = req.body?.level === 'super' ? 'super' : 'admin';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, error: 'A valid email is required.' });
      }

      const temporary = generateTemporaryPassword();

      const inserted = (await sql`
        INSERT INTO admin_users (email, password_hash, display_name, level)
        VALUES (${email}, ${hashPortalPassword(temporary)}, ${displayName || null}, ${level})
        ON CONFLICT (LOWER(email)) DO NOTHING
        RETURNING id
      `) as Array<{ id: string }>;

      if (inserted.length === 0) {
        return res
          .status(409)
          .json({ success: false, error: 'An account with that email already exists.' });
      }

      return res.status(200).json({ success: true, temporary_password: temporary });
    }

    if (op === 'set-active') {
      const userId = typeof req.body?.user_id === 'string' ? req.body.user_id : '';
      const isActive = req.body?.is_active;
      if (!userId || typeof isActive !== 'boolean') {
        return res
          .status(400)
          .json({ success: false, error: 'user_id and is_active are required.' });
      }
      // Postgres raises on a malformed uuid, which would surface as an opaque
      // 500. A bad id is a bad request.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
        return res.status(400).json({ success: false, error: 'Unknown account.' });
      }

      if (!isActive && auth.userId && userId === auth.userId) {
        return res.status(409).json({
          success: false,
          error: 'You cannot disable your own account.',
        });
      }

      if (isActive) {
        const done = (await sql`
          UPDATE admin_users SET is_active = TRUE, updated_at = NOW()
          WHERE id = ${userId}
          RETURNING id
        `) as Array<{ id: string }>;
        if (done.length === 0) {
          return res.status(404).json({ success: false, error: 'Unknown account.' });
        }
        return res.status(200).json({ success: true });
      }

      // Disabling. The "is another active super left?" test lives INSIDE the
      // UPDATE's WHERE rather than in a preceding SELECT, which collapses the
      // race window from two round-trips to one statement.
      //
      // It does NOT eliminate it. The EXISTS is an unlocked read against the
      // statement snapshot, and EvalPlanQual rechecks only the target row —
      // which differs between the two requests. Two concurrent disables of two
      // different supers, interleaved precisely, could still reach zero. With
      // one super-admin and a single operator that is not a real scenario;
      // closing it properly needs a partial unique index, which is a migration
      // and not worth one on this evidence.
      const disabled = (await sql`
        UPDATE admin_users SET is_active = FALSE, updated_at = NOW()
        WHERE id = ${userId}
          AND (
            level <> 'super'
            OR EXISTS (
              SELECT 1 FROM admin_users other
              WHERE other.level = 'super' AND other.is_active = TRUE AND other.id <> ${userId}
            )
          )
        RETURNING id
      `) as Array<{ id: string }>;

      if (disabled.length === 0) {
        // Either no such row, or the guard held. Distinguish so the message is
        // actionable rather than a generic failure.
        const exists = (await sql`SELECT 1 FROM admin_users WHERE id = ${userId}`) as unknown[];
        return exists.length > 0
          ? res.status(409).json({
              success: false,
              error: 'That is the last active super-admin. Promote someone else first.',
            })
          : res.status(404).json({ success: false, error: 'Unknown account.' });
      }

      // Access must end NOW, not whenever the token expires.
      await sql`DELETE FROM admin_sessions WHERE user_id = ${userId}`;
      return res.status(200).json({ success: true });
    }

    if (op === 'change-own') {
      const currentPassword =
        typeof req.body?.current_password === 'string' ? req.body.current_password : '';
      const newPassword = typeof req.body?.new_password === 'string' ? req.body.new_password : '';

      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({
          success: false,
          error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        });
      }
      // ── Break-glass recovery ──────────────────────────────────────────
      // No userId means the caller authenticated with one of the Vercel env
      // passwords rather than a session token (resolveSession always yields a
      // userId, so this is unambiguous). That is the documented way back in
      // after forgetting a database password — and it has to actually END in a
      // working password, or the recovery card on the screen is a lie.
      //
      // The current-password check is skipped here, deliberately: the env
      // password IS the proof, and by definition someone recovering does not
      // know the database password they are replacing. This grants nothing new
      // — an env login already has full super access — it just lets that access
      // repair the account instead of leaving it stranded.
      //
      // Which account is unambiguous: requireAdmin only returns 'super' for
      // SUPER_ADMIN_PASSWORD and 'admin' for ADMIN_PASSWORD, so the level
      // identifies the matching LOGIN_*_EMAIL.
      let targetId = auth.userId;
      if (!targetId) {
        const envEmail = (
          auth.level === 'super' ? process.env.LOGIN_SUPER_EMAIL : process.env.LOGIN_ADMIN_EMAIL
        )
          ?.trim()
          .toLowerCase();
        if (!envEmail) {
          return res.status(409).json({
            success: false,
            error: 'No account is configured for this login, so there is no password to change.',
          });
        }
        // level and is_active are matched as well as the email. The email
        // alone is already 1:1 with the level in the seeded config, but if a
        // row at LOGIN_ADMIN_EMAIL were ever created at level 'super', matching
        // on email alone would turn an env-'admin' login into a genuine
        // admin -> super escalation. Cheap to exclude, so exclude it.
        const envRows = (await sql`
          SELECT id FROM admin_users
          WHERE LOWER(email) = ${envEmail} AND level = ${auth.level} AND is_active = TRUE
          LIMIT 1
        `) as Array<{ id: string }>;
        if (!envRows[0]) {
          return res.status(409).json({
            success: false,
            error: 'No account is configured for this login, so there is no password to change.',
          });
        }
        targetId = envRows[0].id;
        console.log(`[admin/users] break-glass password reset for ${envEmail}`);
      } else {
        const rows = (await sql`
          SELECT password_hash FROM admin_users WHERE id = ${targetId} LIMIT 1
        `) as Array<{ password_hash: string }>;
        if (!rows[0] || !verifyPortalHash(currentPassword, rows[0].password_hash)) {
          return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
        }
      }

      await sql`
        UPDATE admin_users
        SET password_hash = ${hashPortalPassword(newPassword)}, updated_at = NOW()
        WHERE id = ${targetId}
      `;
      // Every OTHER session for this user dies; the current one survives so the
      // person changing their password is not signed out of the tab they are in.
      // On the break-glass path there is no session to preserve, so this clears
      // all of them — correct, since the password just changed underneath them.
      await dropOtherSessions(sql, targetId, req.body?.password);
      return res.status(200).json({ success: true });
    }

    if (op === 'signout-others') {
      // Same as the tail of a password change, without needing to change the
      // password — for "I left myself signed in on someone else's laptop".
      if (!auth.userId) {
        return res.status(409).json({
          success: false,
          error: 'This session is not tied to a database account.',
        });
      }
      const dropped = await dropOtherSessions(sql, auth.userId, req.body?.password);
      return res.status(200).json({ success: true, dropped });
    }

    return res.status(400).json({ success: false, error: `Unknown op '${op}'.` });
  } catch (err) {
    console.error('[admin/users] failed:', err);
    return res.status(500).json({ success: false, error: 'Could not complete that action.' });
  }
}
