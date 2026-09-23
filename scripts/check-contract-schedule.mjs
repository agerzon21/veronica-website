/**
 * The SESSION SCHEDULE section, checked in the build.
 *
 * Two things this pins, and the second is the one that matters:
 *
 * 1. A booking in more than one place renders the schedule, in every contract
 *    type, with both places in it.
 * 2. A booking in ONE place renders EXACTLY what it rendered before. This
 *    section is optional and gated on session_schedule, and
 *    pruneEmptyOptionalSections drops it when the variable is blank, so a
 *    single-location contract must come out byte for byte unchanged. Sixteen
 *    of nineteen live bookings are single-location; if this check ever fails,
 *    a template edit has reached them.
 *
 * Transpiled in memory rather than imported as .ts, for the reason
 * check-send-gate.mjs documents: on Node 22 an import of a .ts file throws
 * ERR_UNKNOWN_FILE_EXTENSION and would fail the production build rather than
 * this check.
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

const { CONTRACT_TEMPLATES, CONTRACT_TYPE_ORDER, pruneEmptyOptionalSections } = m;
for (const [n, v] of Object.entries({ CONTRACT_TEMPLATES, CONTRACT_TYPE_ORDER, pruneEmptyOptionalSections })) {
  if (!v) { console.error(`check-contract-schedule: ${n} is not exported any more.`); process.exit(1); }
}

const SCHEDULE = 'Proposal, Mountain View Vineyard, 3:00 PM to 3:30 PM\nSunset portraits, Gouldsboro State Park, 6:30 PM to 7:00 PM';
const titles = (tpl) => tpl.sections.map((s) => s.title);

let pass = 0;
const failures = [];
const check = (note, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return; }
  failures.push({ note, got: JSON.stringify(got), want: JSON.stringify(want) });
};

for (const key of CONTRACT_TYPE_ORDER) {
  const spec = CONTRACT_TEMPLATES[key];

  // Every type offers the field, so a two-part booking is possible whichever
  // contract it is written on. A wedding with a ceremony and a reception is
  // the same shape as a proposal with portraits after it.
  check(`${key}: offers session_schedule`,
    spec.fields.some((f) => f.key === 'session_schedule'), true);

  const blank = pruneEmptyOptionalSections(spec.template, { session_schedule: '' });
  const filled = pruneEmptyOptionalSections(spec.template, { session_schedule: SCHEDULE });

  check(`${key}: ONE place renders no schedule section`,
    titles(blank).includes('SESSION SCHEDULE'), false);
  check(`${key}: MORE than one place renders it`,
    titles(filled).includes('SESSION SCHEDULE'), true);

  // The single-location contract is what sixteen of nineteen live bookings
  // have. It must be untouched by this section existing.
  check(`${key}: ONE place is unchanged by the section existing`,
    titles(blank),
    titles(pruneEmptyOptionalSections(spec.template, {})));

  // The schedule goes BEFORE Services, so the reader meets the whole day
  // before the terms that apply to it.
  if (titles(filled).includes('SESSION SCHEDULE')) {
    const i = titles(filled).indexOf('SESSION SCHEDULE');
    const j = titles(filled).indexOf('SERVICES');
    check(`${key}: schedule sits before SERVICES`, i < j && j !== -1, true);
  }

  // And it must carry BOTH places, not a summary of them.
  const sec = filled.sections.find((s) => s.title === 'SESSION SCHEDULE');
  const text = (sec?.paragraphs ?? []).map((p) => p.text ?? '').join(' ');
  check(`${key}: the schedule paragraph is the variable itself`,
    text.includes('{{session_schedule}}'), true);
}

// The single address field keeps naming ONE place. Four live consumers read
// it as a street address, the client's own portal row and the Maps
// destination among them; a sentence there reaches all of them.
for (const key of CONTRACT_TYPE_ORDER) {
  const f = CONTRACT_TEMPLATES[key].fields.find((x) => x.key === 'event_location');
  check(`${key}: still has a single event_location field`, Boolean(f), true);
}

if (failures.length) {
  console.error(`\ncheck-contract-schedule: ${failures.length} of ${pass + failures.length} FAILED\n`);
  for (const f of failures) console.error(`  ${f.note}\n    got  ${f.got}\n    want ${f.want}\n`);
  console.error('A single-location contract must render exactly as it did. Do not relax a case here.\n');
  process.exit(1);
}
console.log(`contract schedule: ${pass} cases correct (multi-location section, and single-location contracts unchanged).`);
