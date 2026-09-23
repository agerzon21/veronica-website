/**
 * What Vero recorded by hand, against what the model read off the thread.
 *
 * THE FAILURE THIS PINS is a real one. She settled a booking over text, told
 * the assistant, it wrote seven details down, and the Summary tab carried on
 * showing the old location and the old price underneath. Two things were
 * wrong: the panel never re-read the conversation, and even once it did, the
 * model's own GATHERED list still asserted the values she had just corrected.
 *
 * This file is about the second one. A recorded fact SUPERSEDES the model's
 * line about the same thing, and the dangerous direction is dropping a line
 * it should have kept, because that is information vanishing with nothing
 * left on screen to show it was ever there. So most of what follows is cases
 * where a line must SURVIVE.
 *
 * The rule under test is a pure function, lifted out of the component by
 * transpiling the file and reading the two declarations it needs. If it moves
 * or is renamed, this fails loudly rather than silently testing nothing.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(ROOT, 'node_modules', `.overlay-check-${process.pid}`);

let pass = 0, fail = 0;
const check = (n, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n.padEnd(64)}${ok ? '' : ` got ${got} want ${want}`}`);
};

try {
  const src = readFileSync(join(ROOT, 'src/components/AdminMessages.tsx'), 'utf8');

  // The two declarations, taken from the shipped file by matching their own
  // text. A rename breaks this immediately, which is the point: a suite that
  // quietly stops covering the thing it names is worse than no suite.
  const table = src.match(/const FACT_SUPERSEDES: Record<string, string\[\]> = \{[\s\S]*?\n\};/);
  const fn = src.match(/const supersededBy = \(label: string, fields: string\[\]\): boolean => \{[\s\S]*?\n\};/);
  if (!table || !fn) {
    console.error('check-summary-overlay: FACT_SUPERSEDES or supersededBy is not where this expects it.');
    process.exit(1);
  }
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, 'package.json'), '{"type":"module"}');
  writeFileSync(
    join(TMP, 'rule.js'),
    ts.transpileModule(`${table[0]}\n${fn[0]}\nexport { FACT_SUPERSEDES, supersededBy };`, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  );
  const { supersededBy } = await import(join(TMP, 'rule.js'));

  // The line as the summary holds it, split the way the component splits it.
  const drops = (line, fields) => {
    const colon = line.indexOf(':');
    if (colon < 0) return false;
    return supersededBy(line.slice(0, colon), fields);
  };

  console.log('\nHER VALUE REPLACES THE MODEL’S, which is the whole point:');
  check('the price she corrected', drops('Total amount quoted: $300 for a one-hour session', ['total_amount']), true);
  check('the location she changed', drops('Location: Hawk Falls', ['event_location']), true);
  check('the venue, said another way', drops('Venue: Hawk Falls', ['event_location']), true);
  check('the time', drops('Event time: around lunchtime', ['event_time']), true);
  check('the date', drops('Preferred date: 2026-09-25', ['event_date']), true);
  check('the email', drops("Customer's email: old@example.com", ['client_email']), true);
  check('the phone', drops('Phone number: (570) 555-0000', ['client_phone']), true);
  check('the deposit', drops('Deposit: $100', ['retainer_amount']), true);
  check('how they are paying', drops('Payment method: cash', ['payment_method']), true);
  check('the session type', drops('Session type: portrait', ['session_type']), true);
  check('and it is case insensitive', drops('LOCATION: Hawk Falls', ['event_location']), true);

  console.log('\nIT KEEPS WHAT SHE NEVER ANSWERED:');
  check('a field she recorded nothing for', drops('Location: Hawk Falls', ['total_amount']), false);
  check('nothing recorded at all', drops('Location: Hawk Falls', []), false);
  check('a line about something else entirely', drops('Session duration: an hour', ['event_time']), false);
  check('a line with no label to match on', drops('She wants it before the leaves turn', ['event_location']), false);
  check('a sentence that merely mentions a location', drops('Pagiel asked whether the location has parking', ['event_location']), false);
  check('a heading that claims no field', drops('Other: they have a dog', ['event_location', 'total_amount']), false);

  console.log('\nTHE COLLISION THAT WOULD HAVE DELETED A NAME:');
  // 'partner' and 'name' both match "Partner's name", and 'name' alone
  // matches "Customer's name". Without longest-keyword-wins, recording a
  // partner would have deleted the line naming the client.
  check('recording a PARTNER keeps the client’s name', drops("Customer's name: Pagiel Torres", ['partner_name']), false);
  check('and does replace the partner line', drops("Partner's name: not given", ['partner_name']), true);
  check('recording the CLIENT name keeps the partner line', drops("Partner's name: not given", ['client_name']), false);
  check('and does replace the client line', drops("Customer's name: Pagiel Torres", ['client_name']), true);

  console.log('\nTHE OTHER NEAR MISSES:');
  check('a retainer does not eat the total', drops('Total amount quoted: $300', ['retainer_amount']), false);
  check('a total does not eat the retainer', drops('Retainer: $150', ['total_amount']), false);
  check('a time does not eat the date', drops('Preferred date: 2026-09-25', ['event_time']), false);
  check('a date does not eat the time', drops('Event time: 3pm', ['event_date']), false);
  check('a phone does not eat an email', drops("Customer's email: a@b.c", ['client_phone']), false);

  console.log('\nTHE REAL BOOKING, end to end:');
  // Exactly the seven fields the database holds for Pagiel Torres, against
  // exactly the GATHERED list his summary was showing.
  const recorded = ['client_name', 'client_email', 'event_location', 'event_time', 'payment_method'];
  const gathered = [
    "Customer's name: Pagiel Torres",
    "Customer's email: pfranklintorres@gmail.com",
    'Session type: engagement',
    'Preferred date: 2026-09-25',
    'Location: Hawk Falls',
    'Event time: around lunchtime',
    'Session duration: an hour (mentioned by client)',
    'Total amount quoted: $300 for a one-hour session (quoted by Vero)',
  ];
  const kept = gathered.filter((l) => !drops(l, recorded));
  check('the stale location goes', kept.includes('Location: Hawk Falls'), false);
  check('the stale time goes', kept.includes('Event time: around lunchtime'), false);
  check('the duration stays, nobody corrected it', kept.includes('Session duration: an hour (mentioned by client)'), true);
  check('the session type stays', kept.includes('Session type: engagement'), true);
  check('the date stays, she never changed it', kept.includes('Preferred date: 2026-09-25'), true);
  // The one that matters most, and it is a WARNING rather than a fix: the
  // $500 correction was never written down, so the $300 line is still the
  // only price on the screen and it is still the wrong one.
  check('the price stays, because the price was never recorded',
    kept.includes('Total amount quoted: $300 for a one-hour session (quoted by Vero)'), true);
  // Four of the eight go: name, email, location and time are all hers now.
  check('four of the eight lines survive', kept.length, 4);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail) process.exit(1);
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
