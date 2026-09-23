/**
 * The rules-of-hooks check, as a BUILD GATE.
 *
 * On 2026-09-23 a `useMemo` written inline in a JSX attribute, below two
 * early returns, shipped. Every full-mode client screen then threw React
 * #310, "rendered more hooks than during the previous render", and showed
 * "Something went wrong" over a booking that was perfectly fine underneath.
 * Alex found it by opening a real client he had just created.
 *
 * ESLint had caught it the whole time, with the exact message and the exact
 * line. Nothing ran ESLint: `npm run build` is tsc plus vite plus the check
 * scripts, and `npm run lint` is a thing a person has to remember. A rule
 * that fires only when somebody thinks to ask is not a gate.
 *
 * WHY NOT JUST PUT `npm run lint` IN THE BUILD. Because the repo carries five
 * unrelated ESLint errors today (a deliberate switch fallthrough, some
 * harmless regex escapes) and 107 warnings, so the build would fail red on
 * day one for reasons that have nothing to do with correctness, and the gate
 * would be taken straight back out. This one asks a narrower question:
 * did anybody break the rules of hooks. That answer is never stylistic. A
 * violation is a component that crashes on its second render.
 */
import { loadESLint } from 'eslint';

// This repo uses a flat config (eslint.config.js). loadESLint picks the class
// that matches, rather than the legacy cascade the bare ESLint export still
// resolves in this version.
const FlatESLint = await loadESLint({ useFlatConfig: true });
const eslint = new FlatESLint();
const results = await eslint.lintFiles(['src/**/*.{ts,tsx}']);

const violations = [];
for (const r of results) {
  for (const m of r.messages) {
    // Errors only, and only the two hook rules. exhaustive-deps is a warning
    // about staleness; rules-of-hooks is a crash.
    if (m.severity !== 2) continue;
    if (!m.ruleId?.startsWith('react-hooks/')) continue;
    violations.push({ file: r.filePath.replace(process.cwd() + '/', ''), line: m.line, rule: m.ruleId, message: m.message });
  }
}

if (violations.length === 0) {
  console.log(`hooks: ${results.length} files, no rules-of-hooks violations.`);
  process.exit(0);
}

console.error('\nRULES OF HOOKS VIOLATION. This crashes the component at runtime:\n');
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.message}`);
  console.error(`    (${v.rule})\n`);
}
console.error('A hook has to run the same number of times on every render, so it');
console.error('cannot sit after an early return, inside a condition, or inside JSX');
console.error('that is only sometimes drawn. Move it to the top of the component.\n');
process.exit(1);
