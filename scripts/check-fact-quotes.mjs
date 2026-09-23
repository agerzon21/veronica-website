/**
 * The quote a recorded fact has to carry, and what counts as carrying it.
 *
 * The guard exists so a booking detail can only be written down when the
 * words it came from are in the message Vero just sent: a check in code on
 * evidence the model did not author, which is the lesson this repo took from
 * the send-gate incident.
 *
 * It was comparing character for character. She typed "the price is 500$ for
 * the photosoot we agreed change it" and the model quoted "$500", because
 * that is how a price is written. One character of disagreement about which
 * side the dollar sign goes, and the write was refused; the assistant then
 * asked her to supply wording, she said it four more times, and the summary
 * kept showing the old figure. Four rounds, over a dollar sign.
 *
 * So punctuation and spacing no longer have to match. The words and digits
 * still do, and there is now a floor of three characters on BOTH paths,
 * which the strict one never had: "5" is inside "500", inside "2025" and
 * inside most messages ever sent.
 *
 * Kept in step with api/admin/_assistant-chat.ts by hand. If the rule there
 * changes, change it here; a green suite over a stale copy of the rule is
 * worse than no suite.
 */
// The exact exchange that failed, plus the cases the looser key must still refuse.
const norm = (v) => v.replace(/\s+/g, ' ').trim().toLowerCase();
const loose = (v) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const ok = (typed, quote) => {
  const t = norm(typed), tl = loose(typed), q = norm(quote), ql = loose(quote);
  return ql.length >= 3 && (t.includes(q) || tl.includes(ql));
};
const HIS = 'the price is 500$ for the photosoot we agreed change it';
let pass = 0, fail = 0;
const c = (n, got, want) => { const g = got === want; g ? pass++ : fail++;
  console.log(`  ${g ? 'ok  ' : 'FAIL'} ${n}`); };
console.log('\nACCEPTS what is really hers:');
c('"$500" against his "500$"',        ok(HIS, '$500'), true);
c('"500$" verbatim',                  ok(HIS, '500$'), true);
c('"500 $" spaced',                   ok(HIS, '500 $'), true);
c('"the price is 500$"',              ok(HIS, 'the price is 500$'), true);
c('"$500 for the photoshoot" (typo)', ok(HIS, 'the price is $500 for the photosoot'), true);
c('"Mountainview Winery 3:00pm"',     ok('Mountainview Winery 3:00pm-3:30pm', 'Mountainview Winery 3:00 pm'), true);
console.log('\nSTILL REFUSES what is not:');
c('a number she never typed',         ok(HIS, '$750'), false);
c('a place she never named',          ok(HIS, 'Hawk Falls'), false);
c('a one-character quote',            ok(HIS, '5'), false);
c('two characters',                   ok(HIS, '50'), false);
c('an invented sentence',             ok(HIS, 'she agreed to a deposit of 200'), false);
c('empty message',                    ok('', '$500'), false);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
