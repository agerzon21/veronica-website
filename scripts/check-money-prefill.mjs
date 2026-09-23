/**
 * A price on its way from the assistant into the New Client form.
 *
 * It arrives from two places that disagree about shape. The summariser
 * returns a bare "500". A fact Vero recorded by hand carries whatever she and
 * the model wrote between them, and for a price that is almost always "$500".
 *
 * Passed along as it stood, that produced a card reading "$$500", because the
 * card adds its own currency symbol, and a Total field showing 0, because the
 * input is type="number" and "$500" is not one. No error anywhere. She had
 * just spent four attempts getting the value recorded at all, and then
 * watched it fail to arrive.
 *
 * The rule is lifted out of the shipped module, so a rename breaks this
 * loudly rather than leaving a green suite over code that moved.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(ROOT, 'node_modules', `.money-check-${process.pid}`);

let pass = 0, fail = 0;
const check = (n, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n.padEnd(52)}${ok ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

try {
  const src = readFileSync(join(ROOT, 'src/components/clientPrefill.ts'), 'utf8');
  const fn = src.match(/export function moneyDigits\([\s\S]*?\n\}/);
  if (!fn) { console.error('check-money-prefill: moneyDigits is not where this expects it.'); process.exit(1); }
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, 'package.json'), '{"type":"module"}');
  writeFileSync(join(TMP, 'money.js'),
    ts.transpileModule(fn[0], { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  const { moneyDigits } = await import(join(TMP, 'money.js'));

  console.log('\nWHAT THE ASSISTANT ACTUALLY RECORDS:');
  check('"$500", which is what it wrote for Pagiel', moneyDigits('$500'), '500');
  check('"500$", the way she typed it', moneyDigits('500$'), '500');
  check('"500", the way the summariser sends it', moneyDigits('500'), '500');
  check('"$1,200" with a separator', moneyDigits('$1,200'), '1200');
  check('"$500.00"', moneyDigits('$500.00'), '500');
  check('"$450.50", a real half-dollar', moneyDigits('$450.50'), '450.5');
  check('"USD 500"', moneyDigits('USD 500'), '500');
  check('"500 dollars"', moneyDigits('500 dollars'), '500');
  check('" $500 " with spaces', moneyDigits('  $500  '), '500');

  console.log('\nWHAT IT REFUSES TO GUESS AT:');
  // null, never 0. Zero is a price; "I could not read this" is not, and a
  // silent 0 in a Total field is a contract for nothing.
  check('empty', moneyDigits(''), null);
  check('null', moneyDigits(null), null);
  check('undefined', moneyDigits(undefined), null);
  check('prose with no number', moneyDigits('we agreed on the usual'), null);
  check('a negative', moneyDigits('-500'), null);
  check('just a currency symbol', moneyDigits('$'), null);
  check('a real zero still comes through', moneyDigits('$0'), '0');

  console.log('\nTHE CARD SHOWS ONE DOLLAR SIGN, NOT TWO:');
  const card = (v) => (moneyDigits(v) ? `$${moneyDigits(v)}` : null);
  check('from "$500"', card('$500'), '$500');
  check('from "500"', card('500'), '$500');
  check('from nothing', card(''), null);

  console.log('\nAND THE NUMBER INPUT CAN READ IT:');
  // type="number" shows nothing at all for a value it cannot parse, which is
  // exactly how a Total sat at 0 with no error on screen.
  const asInput = (v) => { const d = moneyDigits(v); return d !== null && String(Number(d)) === d; };
  check('"$500" is usable after normalising', asInput('$500'), true);
  check('"$1,200" too', asInput('$1,200'), true);
  check('raw "$500" would NOT have been', Number.isFinite(parseFloat('$500')), false);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail) process.exit(1);
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
