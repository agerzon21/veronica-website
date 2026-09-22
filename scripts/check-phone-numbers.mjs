/**
 * Phone extraction and phone normalisation, checked in the build.
 *
 *   node scripts/check-phone-numbers.mjs
 *
 * WHY THIS FILE EXISTS. src/utils/phoneFromText.ts decides two things that
 * both end in a stranger being contacted when they are wrong:
 *
 *   findPhonesInText  offers a number to be written onto a client's record
 *   toE164            turns that record into the thing tel:, sms: and wa.me
 *                     dial, and into the key a WhatsApp wa_id is matched on
 *
 * Every refusal asserted below was earned against the real inbox rather than
 * imagined. Over 261 real inbound messages the extractor returns 8 numbers and
 * all 8 belong to an actual person; the cases here are the specific strings
 * that made it return more than that before the rules existed, including
 * VERO'S OWN NUMBER quoted back at her inside a Gmail reply, a Google Ads
 * customer id shaped exactly like a phone number, and a tel: href in Bark's
 * marketing footer whose digits disagree with the words printed beside it.
 *
 * Relaxing a case here to make the build pass puts a wrong number on a
 * booking. Migration 037's column comment is explicit that this field is
 * "unverified by nature: it drives suggestions, never an automatic identity
 * merge" — these cases are what keeps the suggestion worth trusting.
 *
 * WHY IT DOES NOT USE tsx OR NODE'S TYPE STRIPPING. Same reason as
 * check-send-gate.mjs: Vercel builds on the pinned Node, and on Node 22 an
 * `import` of a .ts file throws ERR_UNKNOWN_FILE_EXTENSION, which would fail
 * the whole production build rather than this check. `typescript` is already a
 * devDependency and phoneFromText.ts imports nothing, which is what makes
 * transpiling it in memory safe.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(here, '..', 'src', 'utils', 'phoneFromText.ts');

const js = ts.transpileModule(readFileSync(SOURCE, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

const mod = await import(
  'data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64')
);

const { findPhonesInText, toE164, toWaId, normalizePhone, formatPhone } = mod;

for (const [name, fn] of Object.entries({ findPhonesInText, toE164, toWaId, normalizePhone, formatPhone })) {
  if (typeof fn !== 'function') {
    console.error(`check-phone-numbers: ${name} is not exported any more.`);
    process.exit(1);
  }
}

let pass = 0;
const failures = [];

function check(note, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push({ note, got: g, want: w });
}

// ── toE164 ──────────────────────────────────────────────────────────────────
// The shape everything outbound needs. Null is a real answer: a half-parsed
// number renders a live button that dials somebody else.

check('plain NANP, the way she types it',        toE164('(732) 330-3426'), '+17323303426');
check('hyphenated',                              toE164('732-330-3426'), '+17323303426');
check('bare ten digits',                         toE164('7323303426'), '+17323303426');
check('with the trunk 1',                        toE164('1 732 330 3426'), '+17323303426');
check('already E.164',                           toE164('+1 (732) 330-3426'), '+17323303426');
check('UK, country code given',                  toE164('+44 20 7946 0958'), '+442079460958');
check('Kazakhstan, country code given',          toE164('+7 701 234 5678'), '+77012345678');
check('00 international prefix',                 toE164('00 44 20 7946 0958'), '+442079460958');

// The refusals. An NANP area code and exchange both start 2-9, so these are
// not phone numbers however much they look like one.
check('NANP cannot start with 0',                toE164('0123456789'), null);
check('NANP cannot start with 1',                toE164('1234567890'), null);
check('011 is a US exit code, not a country code', toE164('011 44 20 7946 0958'), null);
check('too short',                               toE164('123'), null);
check('empty',                                   toE164(''), null);
check('null in, null out',                       toE164(null), null);
check('undefined in, null out',                  toE164(undefined), null);
check('prose',                                   toE164('give me a call sometime'), null);

// ── toWaId ──────────────────────────────────────────────────────────────────
// E.164 with the plus removed. wa.me wants this, and so does the wa_id on an
// inbound WhatsApp webhook, which is the whole reason there is one function
// for it: a stored number and a webhook's sender have to be compared after the
// SAME transformation or the thread cannot be trusted to belong to the client.

check('wa_id is E.164 without the plus',         toWaId('(732) 330-3426'), '17323303426');
check('wa_id of an unparseable number is null',  toWaId('nope'), null);

// ── findPhonesInText: the numbers it MUST find ──────────────────────────────
// All three are real messages from real clients, reduced to the sentence that
// carried the number.

const digitsIn = (body) => findPhonesInText(body).map((f) => f.digits);

check('"my phone number is"',
  digitsIn('That park is nice! Can we do this at 11:30AM? My phone number is 732 330 3426.'),
  ['7323303426']);
check('a number in a signature',
  digitsIn('Thank you again I so appreciate your quick reply! Ainsley 818-400-2153'),
  ['8184002153']);
check('a number beside two email addresses',
  digitsIn('Daria Klabun & Tufan Aksahin dklabun@gmail.com taksahin@gmail.com 973 652 3813'),
  ['9736523813']);
check('unpunctuated, with the claim after it',
  digitsIn('5595997511 this is my number'),
  ['5595997511']);

// ── findPhonesInText: the numbers it MUST NOT find ──────────────────────────
// Each of these came back from the real corpus before the matching rule
// existed. Deleting a rule to make something else pass brings its case back.

check('VERO’S OWN NUMBER, which reaches threads by three routes',
  digitsIn('Thanks! Call me on 570 909 5707 if anything changes.'), []);
check('quoted Gmail history, where her own number lives',
  digitsIn('Sounds good, see you then.\n\nOn Tue, Sep 9, 2026 at 4:02 PM Vero wrote:\n> Any questions, my number is 732 330 3426'),
  []);
check('a Google Ads customer id shaped exactly like a phone number',
  digitsIn('Your Google Ads customer ID 864-349-1203 needs attention'), []);
check('a transaction reference',
  digitsIn('Your Chase transaction 4055512345 has posted'), []);
check('an account number',
  digitsIn('Account 2125551234 is now active'), []);
check('a toll-free support line in marketing mail',
  digitsIn('Questions? Our team is on 800 555 1212 all week.'), []);
check('the 555 exchange, which is fiction',
  digitsIn('Reach me at 212 555 0143'), []);
check('a tel: link target, where Bark’s href disagrees with its own words',
  digitsIn('call our friendly Customer Experience team on (424) 227-5323 <tel:+14242275869>, or email us'),
  []);
check('digits glued to more digits',
  digitsIn('order 99997323303426123 shipped'), []);
check('a run inside a URL',
  digitsIn('see https://example.com/track/7323303426 for details'), []);
check('a repdigit',
  digitsIn('call 111 111 1111'), []);

// ── the pair the UI shows ───────────────────────────────────────────────────
check('normalizePhone drops the trunk 1',        normalizePhone('1 (732) 330-3426'), '7323303426');
check('formatPhone is the grouping the screen uses', formatPhone('7323303426'), '(732) 330-3426');

// ── Report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\ncheck-phone-numbers: ${failures.length} of ${pass + failures.length} FAILED\n`);
  for (const f of failures) {
    console.error(`  ${f.note}`);
    console.error(`    got  ${f.got}`);
    console.error(`    want ${f.want}\n`);
  }
  console.error('These decide which number gets written onto a client record and dialled.');
  console.error('Do not relax a case here to make the build pass.\n');
  process.exit(1);
}

console.log(`phone numbers: ${pass} cases correct (extraction refusals and E.164 normalisation).`);
