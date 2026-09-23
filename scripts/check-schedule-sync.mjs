/**
 * Adding a second place to a booking that already exists.
 *
 * The create form and the client screen are two different ways into the same
 * booking, and only one of them was ever wired to the contract. This pins the
 * other one, and pins the three things it must NOT do.
 *
 * WHAT IS ACTUALLY AT RISK
 *   A SIGNED contract is a document somebody agreed to. It must come out of
 *   this byte for byte whatever is done to the bookkeeping beside it, and the
 *   only way to be sure is to run the real handler and watch every statement
 *   it issues.
 *   A sentence VERO TYPED is hers. Deriving over it would silently delete
 *   wording she chose, which is the failure this repo keeps writing guards
 *   against.
 *
 * Runs the shipped api/admin/_portal-update.ts with one file replaced,
 * api/_db.js, by a recorder. Every statement it issues is captured, so an
 * assertion can be about what was NOT written.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(ROOT, 'node_modules', `.sched-check-${process.pid}`);

const emit = (rel, src) => {
  const out = join(TMP, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, src);
};
const port = (rel) =>
  emit(
    rel.replace(/\.ts$/, '.js'),
    ts.transpileModule(readFileSync(join(ROOT, rel), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  );

let pass = 0, fail = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n.padEnd(62)}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`);
};

try {
  emit('package.json', '{"type":"module"}');
  for (const f of [
    'api/admin/_portal-update.ts',
    'api/_admin-auth.ts',
    'api/portal/_password.ts',
    'src/data/contract-template.ts',
    'src/data/sessionLocations.ts',
  ]) port(f);

  // Auth is not what this file is about; replaced so the cases read as edits
  // rather than as logins.
  emit('api/_admin-auth.js', `export async function requireAdmin() { return { ok: true, level: 'super' }; }`);

  emit(
    'api/_db.js',
    `
export const db = { row: null, statements: [] };
export function getDb() {
  return async function sql(strings, ...vals) {
    const q = strings.join(' ? ').replace(/\\s+/g, ' ').trim();
    db.statements.push({ q, vals });
    if (q.startsWith('select id, contract_status')) return [db.row];
    if (q.startsWith('select 1 from client_portals')) return [];
    return [];
  };
}
`,
  );

  const { default: update } = await import(join(TMP, 'api/admin/_portal-update.js'));
  const { db } = await import(join(TMP, 'api/_db.js'));
  const { CONTRACT_TEMPLATES, fillTemplate, pruneEmptyOptionalSections } =
    await import(join(TMP, 'src/data/contract-template.js'));

  const VINEYARD = { label: '', address: 'Mountain View Vineyard, Hawley, PA', starts_at: '3:00 PM', ends_at: '3:30 PM' };
  const PARK = { label: 'Engagement', address: 'Gouldsboro State Park, Gouldsboro, PA', starts_at: '6:30 PM', ends_at: '7:00 PM' };
  const BOTH = 'Mountain View Vineyard, Hawley, PA, 3:00 PM to 3:30 PM\nEngagement, Gouldsboro State Park, Gouldsboro, PA, 6:30 PM to 7:00 PM';

  const baseVars = {
    client_names: 'Pagiel Torres',
    event_date: 'October 17, 2026',
    event_time: '3:00 PM to 3:30 PM',
    event_location: 'Mountain View Vineyard, Hawley, PA',
    total_amount: '$500.00',
    retainer_amount: '$250.00',
    remaining_balance: '$250.00',
    session_schedule: '',
  };

  const run = async (row, patch) => {
    db.row = row;
    db.statements = [];
    const res = {
      code: 0, body: null,
      status(c) { this.code = c; return this; },
      json(b) { this.body = b; return this; },
      setHeader() { return this; },
    };
    // The handler reads the edit from body.patch, not from the body itself.
    await update({ method: 'POST', body: { password: 'x', id: 'p1', patch } }, res);
    return res;
  };
  const dump = () => db.statements.map((s) => s.q.slice(0, 80));
  const rendered = () => db.statements.find((s) => s.q.includes('contract_body ='));
  const listWrite = () => db.statements.find((s) => s.q.includes('session_locations ='));
  const varsOf = (st) => (st ? JSON.parse(st.vals[1]) : null);
  const bodyOf = (st) => (st ? JSON.parse(st.vals[2]) : null);

  const PENDING = {
    id: 'p1', contract_status: 'pending', contract_template_key: 'engagement',
    contract_variables: { ...baseVars }, contract_total_amount: '500', contract_retainer_amount: '250',
    session_locations: [VINEYARD],
  };

  console.log('\nA SECOND PLACE ON AN UNSIGNED BOOKING:');
  {
    const r = await run(PENDING, { session_locations: [VINEYARD, PARK] });
    check('the edit is accepted', r.code, 200);
    check('the list is written', JSON.parse(listWrite().vals[0]).length, 2);
    check('and the single address still mirrors the FIRST place, not a summary',
      listWrite().vals[1], 'Mountain View Vineyard, Hawley, PA');
    check('the contract is re-rendered', Boolean(rendered()), true);
    check('with both places in the schedule variable', varsOf(rendered()).session_schedule, BOTH);
    const text = JSON.stringify(bodyOf(rendered()));
    check('and SESSION SCHEDULE now appears in the document', text.includes('SESSION SCHEDULE'), true);
    check('naming the evening place', text.includes('Gouldsboro State Park'), true);
    check('and saying the one fee covers both', text.includes('as one session'), true);
  }

  console.log('\nA SENTENCE VERO TYPED HERSELF:');
  {
    const hers = 'Meet at the vineyard gate at 2:45, park by the barn.';
    const r = await run(
      { ...PENDING, contract_variables: { ...baseVars, session_schedule: hers } },
      { session_locations: [VINEYARD, PARK] },
    );
    check('the list still updates', JSON.parse(listWrite().vals[0]).length, 2);
    check('and the contract is not touched at all', rendered(), undefined);
    check('so her sentence is still the stored one', db.row.contract_variables.session_schedule, hers);
    // The same edit on an UNTOUCHED sentence does re-render, which is what
    // makes the assertion above about her words rather than about the
    // handler never rendering.
    await run(PENDING, { session_locations: [VINEYARD, PARK] });
    check('while the identical edit DOES render when nobody had typed over it',
      varsOf(rendered()).session_schedule, BOTH);
    check('the edit is still accepted', r.code, 200);
  }

  // Two independent guards stop this, and removing either one alone still
  // passes: the fold refuses to run on a frozen contract, and the render
  // refuses to fire on one. Verified by removing each in turn. The suite
  // fails when BOTH go, which is the property worth having.
  console.log('\nA SIGNED CONTRACT, which is somebody’s agreement:');
  {
    const r = await run(
      { ...PENDING, contract_status: 'signed' },
      { session_locations: [VINEYARD, PARK] },
    );
    check('the bookkeeping list still updates, because that is not the document',
      JSON.parse(listWrite().vals[0]).length, 2);
    check('the contract body is NOT rewritten', rendered(), undefined);
    check('nor are its variables', db.statements.some((s) => s.q.includes('contract_variables =')), false);
    check('and the edit is accepted rather than refused', r.code, 200);
  }

  console.log('\nBACK DOWN TO ONE PLACE:');
  {
    const r = await run(
      { ...PENDING, contract_variables: { ...baseVars, session_schedule: BOTH },
        session_locations: [VINEYARD, PARK] },
      { session_locations: [VINEYARD] },
    );
    check('the schedule variable is blanked', varsOf(rendered()).session_schedule, '');
    const text = JSON.stringify(bodyOf(rendered()));
    check('so the section prunes away entirely', text.includes('SESSION SCHEDULE'), false);
    check('leaving no orphan mention of a second location', text.includes('Gouldsboro'), false);
    check('the edit is accepted', r.code, 200);
  }

  console.log('\nA BOOKING WITH NO CONTRACT AT ALL:');
  {
    // A gallery-only portal. There is no document to keep in step, and
    // inventing the key would add a field no template asked for.
    await run(
      { id: 'p1', contract_status: 'none', contract_template_key: 'engagement',
        contract_variables: null, contract_total_amount: null, contract_retainer_amount: null,
        session_locations: [] },
      { session_locations: [VINEYARD, PARK] },
    );
    check('the list is written', JSON.parse(listWrite().vals[0]).length, 2);
    check('and nothing is rendered', rendered(), undefined);
  }

  console.log('\nTHE STANDING CONSTRAINT, stated as a test:');
  {
    // An ordinary edit that has nothing to do with locations must leave the
    // contract exactly where it was.
    const r = await run(PENDING, { client_email: 'new@example.com' });
    check('changing an email does not touch the contract', rendered(), undefined);
    check('nor the location list', listWrite(), undefined);
    check('and succeeds', r.code, 200);
  }
  {
    // The document a one-place booking produces today, against the document
    // it produced before any of this existed: the SESSION SCHEDULE section is
    // optional and gated, so a blank gate has to leave the body identical.
    const spec = CONTRACT_TEMPLATES.engagement;
    const withKey = pruneEmptyOptionalSections(fillTemplate(spec.template, { ...baseVars }), { ...baseVars });
    const withoutKey = (() => {
      const v = { ...baseVars };
      delete v.session_schedule;
      return pruneEmptyOptionalSections(fillTemplate(spec.template, v), v);
    })();
    check('a one-place contract renders the same with the key as without it',
      JSON.stringify(withKey), JSON.stringify(withoutKey));
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail) process.exit(1);
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
