/**
 * PRICE REVIEW and IF THE PHOTOGRAPHER CANNOT PERFORM, checked in the build.
 *
 * Two clauses ship together and each has a way of going quietly wrong.
 *
 * PRICE REVIEW is optional, gated on three variables, and must be invisible on
 * every booking that is not more than a year out. That is almost every booking,
 * and it includes all nine signed contracts on file. If this check ever fails
 * with "section present on a blank booking", a default has been added to one of
 * the three fields and a template edit is now reaching contracts it must not.
 *
 * It gates on all THREE keys together for the reason TRAVEL gates on two: the
 * pruner can only ask whether a variable is filled, so a two-of-three fill has
 * to prune, or the contract prints a cap with no ceiling beside it.
 *
 * IF THE PHOTOGRAPHER CANNOT PERFORM replaced FORCE MAJEURE on all six types.
 * It must stay numbered VII everywhere, because the numbering runs I to XIII and
 * the PDF finds the signature block by searching for its heading.
 *
 * Transpiled in memory rather than imported as .ts, for the reason
 * check-send-gate.mjs documents: on Node 22 an import of a .ts file throws
 * ERR_UNKNOWN_FILE_EXTENSION and would fail the production build.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(here, '..', 'src', 'data', 'contract-template.ts');
const js = ts.transpileModule(readFileSync(SOURCE, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const m = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));

const {
  CONTRACT_TEMPLATES, CONTRACT_TYPE_ORDER, pruneEmptyOptionalSections,
  stripForeignTypeVariables, ownedGatedVariables,
} = m;
for (const [n, v] of Object.entries({
  CONTRACT_TEMPLATES, CONTRACT_TYPE_ORDER, pruneEmptyOptionalSections,
  stripForeignTypeVariables, ownedGatedVariables,
})) {
  if (!v) { console.error(`check-price-review: ${n} is not exported any more.`); process.exit(1); }
}

const PR = 'PRICE REVIEW FOR DATES BOOKED MORE THAN A YEAR AHEAD';
const CP = 'IF THE PHOTOGRAPHER CANNOT PERFORM';
const GATE = 'price_review_enabled';
const ON = { [GATE]: 'yes' };

const titles = (t) => t.sections.map((s) => s.title);
const strings = (t) => {
  const o = [];
  for (const s of t.sections) {
    o.push(s.title);
    for (const p of s.paragraphs) {
      if (p.kind === 'text') o.push(p.text);
      else if (p.kind === 'bullets') o.push(...p.items);
      else if (p.kind === 'fields') for (const f of p.items) o.push(f.label, f.value);
    }
  }
  return o;
};
const failures = [];
let pass = 0;
const check = (note, cond) => { if (cond) pass++; else failures.push(note); };

// 1. blank: the clause is absent on every type. This is almost every booking.
for (const key of CONTRACT_TYPE_ORDER) {
  const t = pruneEmptyOptionalSections(CONTRACT_TEMPLATES[key].template, {});
  check(`${key}: PRICE REVIEW absent on a blank booking`, !titles(t).includes(PR));
}

// 2. THE DANGLING REFERENCE GUARD. A mandatory clause must never name an
//    optional one, because the optional one is gone on almost every contract
//    and a term referring to a missing clause is read against the drafter.
//    This is general: no surviving string may name ANY pruned section title.
for (const key of CONTRACT_TYPE_ORDER) {
  const full = CONTRACT_TEMPLATES[key].template;
  for (const vars of [{}, ON]) {
    const t = pruneEmptyOptionalSections(full, vars);
    const kept = new Set(titles(t));
    const pruned = full.sections.map((x) => x.title).filter((x) => !kept.has(x));
    for (const gone of pruned) {
      const namers = strings(t).filter((str) => str.includes(gone));
      check(`${key}: no rendered text may name the pruned section "${gone}"`, namers.length === 0);
    }
  }
}

// 3. the gate must never carry a default, or it reaches contracts made before it existed.
for (const key of CONTRACT_TYPE_ORDER) {
  const spec = CONTRACT_TEMPLATES[key];
  const f = spec.fields.find((x) => x.key === GATE);
  check(`${key}: ${GATE} must not be a field with a defaultValue`, !f || f.defaultValue === undefined);
  check(`${key}: ${GATE} must not be forced on via defaultVariables`, !(spec.defaultVariables || {})[GATE]);
}

// 4. on: wedding only, unnumbered, between PAYMENT and PAYMENT METHODS.
{
  const t = pruneEmptyOptionalSections(CONTRACT_TEMPLATES.wedding.template, ON);
  const ts_ = titles(t);
  check('wedding: PRICE REVIEW appears when enabled', ts_.includes(PR));
  const sec = t.sections.find((x) => x.title === PR);
  check('wedding: PRICE REVIEW is UNNUMBERED', sec && sec.number === undefined);
  const a = ts_.indexOf('PAYMENT'), b = ts_.indexOf(PR), c = ts_.indexOf('PAYMENT METHODS');
  check('wedding: PRICE REVIEW sits between PAYMENT and PAYMENT METHODS', a < b && b < c);

  const body = sec ? strings({ sections: [sec] }).join(' ') : '';
  // The sentence that makes a revision collectable. Without it, silence wins:
  // the balance falls due after the event, so a client can ignore the notice,
  // take the wedding, then refuse the increase.
  check('wedding: PRICE REVIEW states DEEMED ACCEPTANCE on silence',
    /does not cancel within those fourteen \(14\) days, the revised Total Payment takes effect/.test(body));
  // The override, so Section VI's forfeiture cannot eat the refund promised here.
  check('wedding: PRICE REVIEW overrides CANCELLATION / RESCHEDULING',
    /notwithstanding CANCELLATION \/ RESCHEDULING/.test(body));
  // The floor the owner did not ask for and must not lose silently.
  check('wedding: PRICE REVIEW keeps the 90 day floor before the event',
    /within ninety \(90\) days of the Event Date/.test(body));
  // Silence in January resolves in the client's favour.
  check('wedding: a January with no notice fixes the price',
    /If no such notice is given during a January, the Total Payment is fixed/.test(body));
  check('wedding: PRICE REVIEW names no percentage or index', !/%|CPI|Consumer Price Index/.test(body));
}

// 5. cross-type isolation, both directions.
for (const key of CONTRACT_TYPE_ORDER.filter((k) => k !== 'wedding')) {
  const t = pruneEmptyOptionalSections(CONTRACT_TEMPLATES[key].template, ON);
  check(`${key}: must never print PRICE REVIEW`, !titles(t).includes(PR));
  check(`${key}: ${GATE} is stripped`, !(GATE in stripForeignTypeVariables(key, { ...ON })));
}
check('wedding: keeps its own gate', stripForeignTypeVariables('wedding', { ...ON })[GATE] === 'yes');

// 6. the withdrawal clause, on all six, still numbered VII, and Section VI
//    must carve the retainer out for it or the two clauses contradict.
for (const key of CONTRACT_TYPE_ORDER) {
  const t = pruneEmptyOptionalSections(CONTRACT_TEMPLATES[key].template, {});
  const vii = t.sections.find((x) => x.title === CP);
  check(`${key}: has ${CP}`, !!vii);
  check(`${key}: ${CP} is numbered VII`, vii && vii.number === 'VII');
  check(`${key}: no FORCE MAJEURE left behind`, !titles(t).includes('FORCE MAJEURE'));
  const vi = t.sections.find((x) => x.number === 'VI');
  const bullets = vi ? vi.paragraphs.flatMap((p) => (p.kind === 'bullets' ? p.items : [])) : [];
  check(`${key}: Section VI carves the retainer out for ${CP}`,
    bullets.some((b) => b.includes('non-refundable') && b.includes(CP)));
}

// 7. numbering unchanged, I..XIII, on every type and both variable fixtures.
const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII'];
for (const key of CONTRACT_TYPE_ORDER) {
  for (const vars of [{}, ON]) {
    const t = pruneEmptyOptionalSections(CONTRACT_TEMPLATES[key].template, vars);
    check(`${key}: numbering is I..XIII in order`,
      JSON.stringify(t.sections.map((x) => x.number).filter(Boolean)) === JSON.stringify(ROMAN));
  }
}

// 8. no long dashes in rendered copy, by CODEPOINT. grep lies on these.
const BAD = new Set([0x2014, 0x2013, 0x2012, 0x2015, 0x2212, 0x2010, 0x2011]);
for (const key of CONTRACT_TYPE_ORDER) {
  for (const vars of [{}, ON]) {
    const t = pruneEmptyOptionalSections(CONTRACT_TEMPLATES[key].template, vars);
    const hits = strings(t).filter((str) => [...str].some((c) => BAD.has(c.codePointAt(0))));
    check(`${key}: no long dashes in rendered copy`, hits.length === 0);
  }
}

if (failures.length) {
  console.error(`check-price-review: ${failures.length} FAILED (${pass} passed)`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`check-price-review: ${pass} checks passed`);
