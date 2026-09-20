#!/usr/bin/env node
/**
 * Migration ledger and runner.
 *
 *   node scripts/migrate.mjs                 # status. READ ONLY. the default.
 *   node scripts/migrate.mjs status
 *   node scripts/migrate.mjs verify          # introspect the live schema. READ ONLY.
 *   node scripts/migrate.mjs adopt  --yes    # one-time baseline. writes rows, runs no SQL.
 *   node scripts/migrate.mjs up     --yes    # apply pending migrations.
 *   node scripts/migrate.mjs up     --dry-run
 *
 * Flags:
 *   --yes        required for anything that writes. there is no prompt, on
 *                purpose: a prompt is something you learn to press through.
 *   --dry-run    print the plan, touch nothing.
 *   --url-env=X  read the connection string from env var X. default order is
 *                POSTGRES_URL_LOCAL, then POSTGRES_URL.
 *   --only=FILE  with `up`, apply exactly one pending file.
 *
 * WHY THE DEFAULT IS READ ONLY. The connection string in .env.local points at
 * the live database. Every safe-by-default decision in here assumes that the
 * person running it may not have checked which database they are pointed at,
 * because eventually that will be true.
 *
 * PORTABILITY. This service is moving off Neon. Everything vendor-specific is
 * inside connect() and nowhere else: swap that one function for `pg` and the
 * rest of this file is unchanged. The ledger table is plain SQL for the same
 * reason.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'db', 'migrations');
const LEDGER = '036-schema-migrations.sql';

const argv = process.argv.slice(2);
const cmd = (argv.find((a) => !a.startsWith('-')) || 'status').toLowerCase();
const has = (f) => argv.includes(f);
const valOf = (p) => {
  const hit = argv.find((a) => a.startsWith(p));
  return hit ? hit.slice(p.length) : null;
};

const YES = has('--yes');
const DRY = has('--dry-run');
const ONLY = valOf('--only=');

const C = process.stdout.isTTY
  ? { d: '\x1b[2m', r: '\x1b[0m', g: '\x1b[32m', y: '\x1b[33m', e: '\x1b[31m', b: '\x1b[1m' }
  : { d: '', r: '', g: '', y: '', e: '', b: '' };

const die = (msg) => { console.error(`${C.e}${msg}${C.r}`); process.exit(1); };

/* ---------------------------------------------------------------- env ---- */

// Loaded by hand rather than with a dotenv dependency: this script has to run
// in a bare checkout, and one fewer install step is one fewer reason for the
// ledger to go unused.
function loadEnvLocal() {
  for (const name of ['.env.local', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}

function connectionString() {
  const explicit = valOf('--url-env=');
  const order = explicit ? [explicit] : ['POSTGRES_URL_LOCAL', 'POSTGRES_URL'];
  for (const k of order) {
    if (process.env[k]) return { url: process.env[k], via: k };
  }
  die(
    `No connection string. Looked at: ${order.join(', ')}.\n` +
    `Expected one of them in .env.local, in .env, or in the environment.`,
  );
}

// Host only, never the password. This string gets printed, and a script that
// prints credentials once will print them into a log or a screenshot.
function describe(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return '(unparseable connection string)';
  }
}

/* --------------------------------------------------------------- neon ---- */

/** The ONLY vendor-coupled function in this file. */
async function connect(url) {
  const { Client } = await import('@neondatabase/serverless');
  const client = new Client(url);
  await client.connect();
  return {
    // Multi-statement SQL, which is what a migration file is.
    exec: (sql) => client.query(sql),
    // Single parameterised query.
    query: (sql, params) => client.query(sql, params),
    end: () => client.end(),
  };
}

/* ---------------------------------------------------------------- disk ---- */

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Sorted so that 017 < 017a < 017b < 018, which a plain string sort gets right
 * only by luck and a numeric sort gets wrong outright. Split the leading digits
 * from the suffix and compare them separately.
 */
function onDisk() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((filename) => {
      const raw = readFileSync(join(DIR, filename));
      const m = filename.match(/^(\d+)([a-z]*)/i);
      return {
        filename,
        checksum: sha(raw),
        sql: raw.toString('utf8'),
        seq: m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER,
        suffix: m ? m[2] : '',
      };
    })
    .sort((a, b) => (a.seq - b.seq) || a.suffix.localeCompare(b.suffix) || a.filename.localeCompare(b.filename));
}

async function ledgerExists(db) {
  const r = await db.query(`select to_regclass('public.schema_migrations') as t`);
  return r.rows[0]?.t !== null;
}

async function applied(db) {
  const r = await db.query(
    `select filename, checksum, applied_at, applied_by, adopted, run_ms
       from schema_migrations`,
  );
  return new Map(r.rows.map((x) => [x.filename, x]));
}

/* -------------------------------------------------------------- status ---- */

async function cmdStatus(db, conn) {
  const files = onDisk();
  console.log(`\n${C.b}Migration status${C.r}  ${C.d}${describe(conn.url)}  (via ${conn.via})${C.r}\n`);

  if (!(await ledgerExists(db))) {
    console.log(`${C.y}No ledger table yet.${C.r} The database cannot report what it has.\n`);
    console.log(`  ${files.length} migration files on disk, 000 recorded.\n`);
    console.log(`  To start tracking:`);
    console.log(`    1. Run ${C.b}${LEDGER}${C.r} in the Neon console (it only creates one table).`);
    console.log(`    2. ${C.b}node scripts/migrate.mjs adopt --yes${C.r}  to baseline the ${files.length - 1} files already applied.`);
    console.log(`    3. ${C.b}node scripts/migrate.mjs status${C.r}       to confirm.\n`);
    return 0;
  }

  const rows = await applied(db);
  let pending = 0, drift = 0, adopted = 0;

  for (const f of files) {
    const rec = rows.get(f.filename);
    if (!rec) {
      pending++;
      console.log(`  ${C.y}PENDING ${C.r} ${f.filename}`);
    } else if (rec.checksum !== f.checksum) {
      drift++;
      console.log(`  ${C.e}CHANGED ${C.r} ${f.filename}`);
      console.log(`            ${C.d}applied ${new Date(rec.applied_at).toISOString().slice(0, 10)}, but the file has been edited since.${C.r}`);
      console.log(`            ${C.d}recorded ${rec.checksum.slice(0, 12)}, on disk ${f.checksum.slice(0, 12)}${C.r}`);
    } else if (rec.adopted) {
      adopted++;
      console.log(`  ${C.d}adopted ${C.r} ${f.filename}`);
    } else {
      console.log(`  ${C.g}applied ${C.r} ${f.filename} ${C.d}${new Date(rec.applied_at).toISOString().slice(0, 10)}${rec.run_ms != null ? `  ${rec.run_ms}ms` : ''}${C.r}`);
    }
  }

  // A row in the ledger with no file on disk. Means someone deleted or renamed
  // a migration that has already run somewhere, which is how two environments
  // quietly stop matching.
  const diskNames = new Set(files.map((f) => f.filename));
  const orphans = [...rows.keys()].filter((n) => !diskNames.has(n));
  for (const o of orphans) console.log(`  ${C.e}ORPHAN  ${C.r} ${o} ${C.d}recorded as applied, but no such file on disk${C.r}`);

  console.log(
    `\n  ${files.length} on disk, ${files.length - pending - drift} recorded` +
    (adopted ? ` ${C.d}(${adopted} adopted)${C.r}` : '') +
    (pending ? `, ${C.y}${pending} pending${C.r}` : '') +
    (drift ? `, ${C.e}${drift} changed after apply${C.r}` : '') +
    (orphans.length ? `, ${C.e}${orphans.length} orphaned${C.r}` : '') + '\n',
  );

  if (pending) console.log(`  Apply them with: ${C.b}node scripts/migrate.mjs up --yes${C.r}\n`);
  return drift || orphans.length ? 1 : 0;
}

/* -------------------------------------------------------------- adopt ---- */

async function cmdAdopt(db, conn) {
  if (!(await ledgerExists(db))) die(`No schema_migrations table. Run ${LEDGER} first.`);

  const files = onDisk();
  const rows = await applied(db);
  // The ledger file itself is adopted along with everything else. It was run
  // by hand exactly like the other 37, and the table we are writing into
  // existing is proof that it ran. Skipping it would leave it reading PENDING
  // forever, and a status report with a permanent false entry is one nobody
  // reads.
  const todo = files.filter((f) => !rows.has(f.filename));

  console.log(`\n${C.b}Baseline${C.r}  ${C.d}${describe(conn.url)}${C.r}\n`);
  if (!todo.length) { console.log(`  Nothing to adopt. Every file is already recorded.\n`); return 0; }

  console.log(`  ${todo.length} files will be RECORDED AS APPLIED WITHOUT BEING RUN.`);
  console.log(`  ${C.d}This asserts the schema already reflects them, which is true only`);
  console.log(`  because this database has been serving them for months. Never adopt`);
  console.log(`  against a fresh database: use 'up' there.${C.r}\n`);
  todo.forEach((f) => console.log(`    ${f.filename}`));

  if (DRY) { console.log(`\n  ${C.y}--dry-run, nothing written.${C.r}\n`); return 0; }
  if (!YES) { console.log(`\n  ${C.y}Add --yes to write these rows.${C.r}\n`); return 0; }

  for (const f of todo) {
    await db.query(
      `insert into schema_migrations (filename, checksum, adopted)
         values ($1, $2, true)
       on conflict (filename) do nothing`,
      [f.filename, f.checksum],
    );
  }
  console.log(`\n  ${C.g}Recorded ${todo.length}.${C.r} Run status to confirm.\n`);
  return 0;
}

/* ----------------------------------------------------------------- up ---- */

async function cmdUp(db, conn) {
  if (!(await ledgerExists(db))) die(`No schema_migrations table. Run ${LEDGER} first.`);

  const files = onDisk();
  const rows = await applied(db);
  let todo = files.filter((f) => !rows.has(f.filename));
  if (ONLY) {
    todo = todo.filter((f) => f.filename === ONLY);
    if (!todo.length) die(`${ONLY} is not pending (already applied, or not on disk).`);
  }

  console.log(`\n${C.b}Apply${C.r}  ${C.d}${describe(conn.url)}  (via ${conn.via})${C.r}\n`);
  if (!todo.length) { console.log(`  Nothing pending.\n`); return 0; }

  todo.forEach((f) => console.log(`    ${C.y}${f.filename}${C.r}  ${C.d}${f.sql.split('\n').length} lines${C.r}`));

  if (DRY) { console.log(`\n  ${C.y}--dry-run, nothing executed.${C.r}\n`); return 0; }
  if (!YES) { console.log(`\n  ${C.y}Add --yes to run these against ${describe(conn.url)}.${C.r}\n`); return 0; }

  for (const f of todo) {
    const t0 = Date.now();
    process.stdout.write(`  ${f.filename} ... `);
    try {
      // The file supplies its own BEGIN/COMMIT. Wrapping it here as well would
      // nest, and Postgres does not nest transactions: the inner COMMIT would
      // end the outer one and the rest would run unprotected. Files that omit
      // BEGIN are on their own, which is why every file in this repo has it.
      await db.exec(f.sql);
      const ms = Date.now() - t0;
      await db.query(
        `insert into schema_migrations (filename, checksum, run_ms) values ($1, $2, $3)`,
        [f.filename, f.checksum, ms],
      );
      console.log(`${C.g}ok${C.r} ${C.d}${ms}ms${C.r}`);
    } catch (err) {
      console.log(`${C.e}FAILED${C.r}`);
      console.error(`\n  ${C.e}${err.message}${C.r}`);
      console.error(`\n  ${C.b}Stopped.${C.r} ${f.filename} is NOT recorded, so it will be retried next run.`);
      console.error(`  Everything before it is applied and recorded. Fix the file and run again.\n`);
      return 1;
    }
  }
  console.log(`\n  ${C.g}Applied ${todo.length}.${C.r}\n`);
  return 0;
}

/* -------------------------------------------------------------- verify ---- */

/**
 * Does the live schema actually look like the files claim?
 *
 * The ledger records intent; this reads reality. They disagree whenever a
 * migration was edited after running, partially applied, or run by hand with a
 * typo. Each check names the migration it belongs to so a failure points
 * somewhere.
 */
const CHECKS = [
  { m: '017b', q: `select column_default from information_schema.columns where table_name='messages' and column_name='channel'`,
    ok: (r) => r.rows.length === 1 && r.rows[0].column_default === null,
    pass: 'messages.channel has no default',
    fail: 'messages.channel STILL HAS A DEFAULT, so 017b never ran. An insert path that forgets to set channel is silently filing messages under the old default instead of throwing.' },
  { m: '017b', q: `select is_nullable from information_schema.columns where table_name='messages' and column_name='channel'`,
    ok: (r) => r.rows[0]?.is_nullable === 'NO',
    pass: 'messages.channel is NOT NULL', fail: 'messages.channel is nullable, which no migration intends' },
  { m: '005/017', q: `select pg_get_constraintdef(oid) d from pg_constraint where conname like '%channel%' and contype='c'`,
    ok: (r) => r.rows.some((x) => /whatsapp/i.test(x.d)) && r.rows.some((x) => /sms/i.test(x.d)),
    pass: `'whatsapp' and 'sms' are already legal channel values`,
    fail: `the channel CHECK does not allow 'whatsapp'/'sms', so adding those channels needs a migration after all` },
  { m: '035', q: `select to_regclass('public.portal_charges') t`,
    ok: (r) => r.rows[0]?.t !== null, pass: 'portal_charges exists', fail: 'portal_charges missing, so 035 never ran and every balance is wrong' },
  // 'writing_rules' is a CATEGORY inside ai_context, not a table. 034 creates a
  // unique index, and that index is the whole point of the migration: without
  // it, three restatements of one rule become three rows, which is exactly the
  // duplication migration 029 had to clean up by hand.
  { m: '034', q: `select indexdef from pg_indexes where indexname='ai_context_writing_rule_key'`,
    ok: (r) => r.rows.length === 1,
    pass: 'the writing-rule dedupe index exists on ai_context',
    fail: 'ai_context_writing_rule_key is missing, so 034 never ran and restating a writing rule adds a duplicate row instead of updating one' },
  // Nullable matters as much as present. A NOT NULL phone column would refuse
  // every booking that does not have one, which is most of them.
  { m: '037', q: `select data_type, is_nullable from information_schema.columns where table_name='client_portals' and column_name='client_phone'`,
    ok: (r) => r.rows.length === 1 && r.rows[0].data_type === 'text' && r.rows[0].is_nullable === 'YES',
    pass: 'client_portals.client_phone exists and is nullable text',
    fail: 'client_phone is missing, or is not nullable text, which would block saving a booking without a number' },
  // The idempotency guarantee for card payments. Asserted as PARTIAL, because
  // a plain unique index here would break every manual cash row, and a missing
  // one would let a retried webhook insert a second payment for one charge.
  { m: '040', q: `select indexdef from pg_indexes where indexname='payment_entries_processor_payment_id_key'`,
    ok: (r) => r.rows.length === 1 && /WHERE \(processor_payment_id IS NOT NULL\)/i.test(r.rows[0].indexdef),
    pass: 'the card-payment idempotency index exists and is partial',
    fail: 'payment_entries_processor_payment_id_key is missing or is not partial, so a retried webhook could double-charge the ledger' },
  { m: '040', q: `select column_name from information_schema.columns where table_name='payment_entries' and column_name in ('source','status','processor_payment_id','fee_amount')`,
    ok: (r) => r.rows.length === 4,
    pass: 'payment_entries carries the card-payment columns',
    fail: 'payment_entries is missing card-payment columns, so a card payment cannot be recorded' },
  { m: '042', q: `select column_name from information_schema.columns where table_name='messages' and column_name='sent_via'`,
    ok: (r) => r.rows.length === 1,
    pass: 'messages.sent_via exists, so an assistant send is distinguishable from a composer send',
    fail: 'messages.sent_via is missing, so every panel send looks identical and an unauthorised send by the assistant cannot be identified after the fact' },
  { m: '036', q: `select to_regclass('public.schema_migrations') t`,
    ok: (r) => r.rows[0]?.t !== null, pass: 'schema_migrations exists', fail: 'the ledger itself is missing' },
];

async function cmdVerify(db, conn) {
  console.log(`\n${C.b}Schema verification${C.r}  ${C.d}${describe(conn.url)}${C.r}\n`);
  let bad = 0;
  for (const c of CHECKS) {
    let r;
    try { r = await db.query(c.q); } catch (e) { console.log(`  ${C.e}ERROR  ${C.r} [${c.m}] ${e.message}`); bad++; continue; }
    if (c.ok(r)) console.log(`  ${C.g}ok     ${C.r} ${C.d}[${c.m}]${C.r} ${c.pass}`);
    else { bad++; console.log(`  ${C.e}PROBLEM${C.r} ${C.d}[${c.m}]${C.r} ${c.fail}`); }
  }
  console.log(`\n  ${CHECKS.length} checks, ${bad ? `${C.e}${bad} failed${C.r}` : `${C.g}all passed${C.r}`}\n`);
  return bad ? 1 : 0;
}

/* ---------------------------------------------------------------- main ---- */

const COMMANDS = { status: cmdStatus, adopt: cmdAdopt, up: cmdUp, verify: cmdVerify };

async function main() {
  const run = COMMANDS[cmd];
  if (!run) die(`Unknown command '${cmd}'. Expected one of: ${Object.keys(COMMANDS).join(', ')}.`);

  loadEnvLocal();
  const conn = connectionString();

  let db;
  try { db = await connect(conn.url); }
  catch (e) { die(`Could not connect to ${describe(conn.url)}: ${e.message}`); }

  let code = 1;
  try { code = await run(db, conn); }
  finally { await db.end().catch(() => {}); }
  process.exit(code);
}

main().catch((e) => die(e.stack || String(e)));
