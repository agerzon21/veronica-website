/**
 * One-shot backfill: hash every remaining plaintext client portal password.
 *
 *   node scripts/hash-client-passwords.mjs --dry-run   # report only
 *   node scripts/hash-client-passwords.mjs             # hash + clear plaintext
 *
 * WHY THIS EXISTS (and why the original plan was wrong)
 * The first version of the password work relied only on lazy upgrade: verify
 * against plaintext, write a hash on the next successful login. The argument
 * against a backfill was that it would mean "reading every client's password
 * out of the database into a process".
 *
 * That argument does not hold. The plaintext is ALREADY in the database — that
 * is the whole problem. Reading it once, in a script that immediately replaces
 * it with a hash, is how the exposure ENDS. Waiting for logins means the
 * passwords stay readable indefinitely for any client who never signs in
 * again, which is most of them once a wedding is delivered.
 *
 * So: hash everything now. The lazy-upgrade path in api/portal/_password.ts
 * stays as a safety net for any row created between deploy and this run, but
 * after this there should be nothing left for it to do.
 *
 * SAFE TO RE-RUN. Only touches rows where client_password IS NOT NULL, and
 * verifies each hash against the original before clearing the plaintext — a row
 * is only cleared once its replacement is proven to work.
 */

import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

const KEYLEN = 64;
const SALT_BYTES = 16;

// Kept byte-identical to api/portal/_password.ts. If that format ever changes,
// this script must change with it — a mismatch here silently locks clients out.
const hashPortalPassword = (plain) => {
  const salt = randomBytes(SALT_BYTES);
  return `scrypt$${salt.toString('hex')}$${scryptSync(plain, salt, KEYLEN).toString('hex')}`;
};

const verifyPortalHash = (plain, stored) => {
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    return timingSafeEqual(scryptSync(plain, salt, expected.length), expected);
  } catch {
    return false;
  }
};

const isDryRun = process.argv.includes('--dry-run');

const url = process.env.POSTGRES_URL_LOCAL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('[hash-passwords] No POSTGRES_URL / DATABASE_URL. Aborting.');
  process.exit(1);
}
const sql = neon(url);

const rows = await sql`
  SELECT id, client_email, client_password
  FROM client_portals
  WHERE client_password IS NOT NULL
  ORDER BY created_at
`;

console.log(`[hash-passwords] ${rows.length} row(s) still holding a plaintext password.`);
if (rows.length === 0) {
  console.log('[hash-passwords] Nothing to do.');
  process.exit(0);
}

if (isDryRun) {
  rows.forEach((r) => console.log(`  WOULD HASH  ${r.client_email ?? r.id}`));
  console.log('\n[hash-passwords] DRY RUN — nothing written.');
  process.exit(0);
}

let hashed = 0;
let failed = 0;

for (const row of rows) {
  const plain = row.client_password;
  try {
    const hash = hashPortalPassword(plain);

    // Prove the hash actually verifies against the original BEFORE destroying
    // the only other copy of the credential. A silent mismatch here would lock
    // the client out of their own portal with no way back.
    if (!verifyPortalHash(plain, hash)) {
      throw new Error('self-check failed — hash does not verify against the original');
    }

    await sql`
      UPDATE client_portals
      SET client_password_hash = ${hash},
          client_password = NULL
      WHERE id = ${row.id}
    `;
    hashed++;
    console.log(`  ✓ ${row.client_email ?? row.id}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${row.client_email ?? row.id}: ${err instanceof Error ? err.message : err}`);
  }
}

const after = await sql`
  SELECT count(*) FILTER (WHERE client_password_hash IS NOT NULL)::int AS hashed,
         count(*) FILTER (WHERE client_password IS NOT NULL)::int      AS plaintext_left
  FROM client_portals
`;

console.log(
  `\n[hash-passwords] done — ${hashed} hashed, ${failed} failed. ` +
    `Now ${after[0].hashed} hashed, ${after[0].plaintext_left} plaintext remaining.`,
);
process.exit(failed ? 1 : 0);
