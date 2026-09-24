/**
 * The agreed time, on its way from the thread into the New Client form.
 *
 * WHAT HAPPENED. Vero and a client settled on 4pm. Her own message said "I
 * recommend meeting around 4 o'clock, because the sunlight is better closer
 * to sunset". The summariser stored event_time as "4 o'clock", exactly as
 * asked: its rule is to keep the thread's own wording. The form then opened
 * on 5:00 PM to 6:00 PM.
 *
 * WHY. parseStartTime refused any reading that carried neither a colon nor an
 * am/pm marker, which is right for a bare "4" and wrong for "4 o'clock". It
 * returned null, so to the form the thread looked like a thread with no time
 * in it at all, and BOTH fallbacks applied: FALLBACK_START and FALLBACK_END,
 * 17:00 and 18:00. Two numbers nobody in the conversation had ever said, on
 * a contract, with nothing on screen to say where they came from.
 *
 * The fallbacks are deliberate and stay. The bug was the parser making the
 * thread look empty.
 *
 * WHAT IS PINNED HERE. That "4 o'clock" reads as 16:00; that a bare number
 * still reads as nothing, because "sometime around 4" is not a time; and
 * that when only the hour was stated the result says so, because the half of
 * the day is then a guess and a guessed value on a contract has to be visible
 * as one.
 *
 * Runs the shipped module, so a rename breaks this loudly rather than leaving
 * a green suite over code that moved.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(ROOT, 'node_modules', `.time-check-${process.pid}`);

let pass = 0, fail = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n.padEnd(58)}${ok ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

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

try {
  emit('package.json', '{"type":"module"}');
  for (const f of [
    'src/components/clientPrefill.ts',
    'src/data/contract-template.ts',
    'src/data/sessionLocations.ts',
  ]) port(f);

  const m = await import(join(TMP, 'src/components/clientPrefill.js'));
  const { parseStartTime, readStartTime, resolveCoverage, FALLBACK_START } = m;

  console.log('\nTHE ONE THAT WENT WRONG:');
  check('"4 o\'clock", the exact string the summariser stored', parseStartTime("4 o'clock"), '16:00');
  check('and it is NOT the 5pm fallback', parseStartTime("4 o'clock") === FALLBACK_START, false);
  check('the whole window, with her own 2 hour package',
    resolveCoverage("4 o'clock", [{ speaker: 'photographer', text: '2 hours', quote: 'I would recommend booking a 2-hour package for $400.' }]),
    { start: '16:00', end: '18:00', endSource: { speaker: 'photographer', text: '2 hours', quote: 'I would recommend booking a 2-hour package for $400.' }, startMeridiemInferred: true });

  console.log('\nOTHER WAYS TO SAY AN HOUR WITHOUT SAYING WHICH HALF OF THE DAY:');
  check('"around 4 o\'clock", as she actually wrote it', parseStartTime("around 4 o'clock"), '16:00');
  check('"4 oclock" without the apostrophe', parseStartTime('4 oclock'), '16:00');
  check('"4 o’clock" with a typographic one', parseStartTime('4 o’clock'), '16:00');
  check('"9 o\'clock" is a morning session', parseStartTime("9 o'clock"), '09:00');
  check('"12 o\'clock" is noon, not midnight', parseStartTime("12 o'clock"), '12:00');
  check('"в 4 часа", which is how Vero says it', parseStartTime('в 4 часа'), '16:00');
  check('"в 9 часов"', parseStartTime('в 9 часов'), '09:00');

  console.log('\nAND IT SAYS WHEN IT GUESSED:');
  check('"4 o\'clock" flags the half of the day as inferred', readStartTime("4 o'clock").meridiemInferred, true);
  check('"4:00 PM" does not, because she said it', readStartTime('4:00 PM').meridiemInferred, false);
  check('"16:00" does not either', readStartTime('16:00').meridiemInferred, false);
  check('a stated window does not', resolveCoverage('3:00 PM to 6:00 PM', []).startMeridiemInferred, false);

  console.log('\nWHAT MUST STILL READ AS NOTHING, so the fallbacks keep their job:');
  check('a bare "4"', parseStartTime('4'), null);
  check('"sometime around 4"', parseStartTime('sometime around 4'), null);
  check('"sometime in the afternoon"', parseStartTime('sometime in the afternoon'), null);
  check('"2 hours", which is a length and not a time', parseStartTime('2 hours'), null);
  check('empty', parseStartTime(''), null);
  check('null', parseStartTime(null), null);

  console.log('\nEVERYTHING THAT ALREADY WORKED, unchanged:');
  check('"4:00 PM"', parseStartTime('4:00 PM'), '16:00');
  check('"4pm"', parseStartTime('4pm'), '16:00');
  check('"11:30 AM"', parseStartTime('11:30 AM'), '11:30');
  check('"15:00"', parseStartTime('15:00'), '15:00');
  check('"3:00 PM to 6:00 PM" takes the first', parseStartTime('3:00 PM to 6:00 PM'), '15:00');
  check('a stated window is still read whole',
    resolveCoverage('3:00 PM to 6:00 PM', []),
    { start: '15:00', end: '18:00', endSource: null, startMeridiemInferred: false });
  check('a start with no readable length still leaves the end empty',
    resolveCoverage('11:30 AM', []),
    { start: '11:30', end: null, endSource: null, startMeridiemInferred: false });
  check('a thread with no time at all still says nothing',
    resolveCoverage(null, []),
    { start: null, end: null, endSource: null, startMeridiemInferred: false });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail) process.exit(1);
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
