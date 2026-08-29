/**
 * Seed admin_users from the CURRENT environment variables.
 *
 *   node scripts/seed-admin-users.mjs --dry-run
 *   node scripts/seed-admin-users.mjs
 *
 * Reads LOGIN_ADMIN_EMAIL/ADMIN_PASSWORD and LOGIN_SUPER_EMAIL/
 * SUPER_ADMIN_PASSWORD, hashes those passwords, and writes them into the
 * admin_users table created by migration 026.
 *
 * The point is that the switch to database-backed auth is INVISIBLE: the same
 * two people sign in with the same two passwords they already use, and nothing
 * has to be communicated or reset. api/_admin-auth.ts checks the database
 * first and falls back to the env vars, so this script changes which branch
 * answers, not whether login works.
 *
 * Safe to re-run: upserts on LOWER(email) and only ever rewrites the hash for
 * an email it already owns.
 *
 * NOTE: this needs the plaintext admin passwords, which means running it from a
 * machine that has them in .env.local. That is a one-time cost to get OFF
 * plaintext-in-env; after this, password changes happen in the panel and the
 * env vars can eventually be deleted.
 */

import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { randomBytes, scryptSync } from 'node:crypto';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

// Byte-identical to api/portal/_password.ts. A mismatch here would seed hashes
// the app cannot verify, silently pushing every login onto the env-var
// fallback — working, but not actually migrated.
const hash = (plain) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(plain, salt, 64).toString('hex')}`;
};

const isDryRun = process.argv.includes('--dry-run');

const url = process.env.POSTGRES_URL_LOCAL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('[seed-admins] No POSTGRES_URL / DATABASE_URL. Aborting.');
  process.exit(1);
}

const candidates = [
  {
    email: process.env.LOGIN_ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    level: 'admin',
    display: 'Veronika',
  },
  {
    email: process.env.LOGIN_SUPER_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
    level: 'super',
    display: 'Alex',
  },
].filter((c) => c.email && c.password);

if (candidates.length === 0) {
  console.error('[seed-admins] No admin env vars found. Nothing to seed.');
  process.exit(1);
}

const sql = neon(url);

console.log(`[seed-admins] ${candidates.length} account(s) from env:`);
candidates.forEach((c) => console.log(`  ${c.level.padEnd(5)}  ${c.email}`));

if (isDryRun) {
  console.log('\n[seed-admins] DRY RUN — nothing written.');
  process.exit(0);
}

for (const c of candidates) {
  const emailLc = c.email.trim().toLowerCase();
  await sql`
    INSERT INTO admin_users (email, password_hash, display_name, level)
    VALUES (${emailLc}, ${hash(c.password)}, ${c.display}, ${c.level})
    ON CONFLICT (LOWER(email)) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          level         = EXCLUDED.level,
          is_active     = TRUE,
          updated_at    = NOW()
  `;
  console.log(`  ✓ ${emailLc} (${c.level})`);
}

const rows = await sql`SELECT email, level, is_active FROM admin_users ORDER BY level DESC, email`;
console.log(`\n[seed-admins] admin_users now holds ${rows.length} account(s):`);
rows.forEach((r) => console.log(`  ${r.level.padEnd(5)}  ${r.email}  active=${r.is_active}`));
console.log(
  '\n[seed-admins] Sign in exactly as before — the same passwords now resolve\n' +
    '              against the database instead of the env vars.',
);
