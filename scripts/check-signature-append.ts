/**
 * Regression check for the double-signature bug (2026-09-11).
 *
 *   npx tsx scripts/check-signature-append.ts
 *
 * The first case is byte-for-byte the tail of the reply the assistant sent
 * to a real enquiry: the model wrote its own sign-off using Markdown's
 * two-trailing-space line breaks ("Warmly,  \n"), the old exact endsWith
 * guard missed it, and the customer received the signature twice. Every
 * case asserts the delivered text carries EXACTLY one signature, and that
 * the HTML body (built from the stripped text) carries none in the body
 * paragraphs.
 *
 * No DB, no network — pure functions only. Safe to run anywhere.
 */
import {
  appendSignatureText,
  stripTrailingSignature,
  buildReplyHtml,
} from '../api/_email-signature.js';

const SIG = 'Warmly,\nVeronika\nVero Photography';
const SIG_HTML =
  '<p style="margin:24px 0 0;">Warmly,<br><em>Veronika</em></p>' +
  '<p>Vero Photography</p>';

const count = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

let failures = 0;
const check = (note: string, cond: boolean, detail?: string) => {
  if (cond) {
    console.log(`  ok — ${note}`);
  } else {
    failures++;
    console.error(`  FAIL — ${note}${detail ? `\n    ${detail}` : ''}`);
  }
};

// 1. The real incident: model-written sign-off with Markdown two-space
//    line breaks. Must ship with exactly one signature.
{
  const body =
    'Looking forward to capturing these special moments for you both!\n\n' +
    'Warmly,  \nVeronika  \nVero Photography';
  const out = appendSignatureText(body, SIG);
  check('markdown two-space sign-off collapses to one signature', count(out, 'Warmly,') === 1, JSON.stringify(out));
  check('canonical delimiter used', out.includes('\n\n-- \nWarmly,'), JSON.stringify(out));
}

// 2. A draft that round-tripped already canonically signed must not stack.
{
  const once = appendSignatureText('Thanks for reaching out!', SIG);
  const twice = appendSignatureText(once, SIG);
  check('round-tripped signed draft stays single-signed', twice === once, JSON.stringify(twice));
}

// 3. Model sign-off AND an old canonical signature stacked — both collapse.
{
  const body = `Hi there!\n\nWarmly,  \nVeronika\nVero Photography\n\n-- \n${SIG}`;
  const out = appendSignatureText(body, SIG);
  check('stacked signatures collapse to one', count(out, 'Vero Photography') === 1, JSON.stringify(out));
}

// 4. CRLF line endings still match.
{
  const body = 'See you soon!\r\n\r\nWarmly,\r\nVeronika\r\nVero Photography';
  const out = appendSignatureText(body, SIG);
  check('CRLF sign-off recognized', count(out, 'Warmly,') === 1, JSON.stringify(out));
}

// 5. A body that merely ENDS warmly must not be over-stripped.
{
  const body = 'Thanks so much for the photos!';
  const out = appendSignatureText(body, SIG);
  check('non-signature tail left intact', out.startsWith(body) && count(out, 'Warmly,') === 1, JSON.stringify(out));
}

// 6. Signature mid-body (quoted earlier email) is untouched; only tail handled.
{
  const body = `On Tuesday you wrote:\n> ${SIG.split('\n').join('\n> ')}\n\nSounds great, let's do 4pm.`;
  const out = appendSignatureText(body, SIG);
  check('quoted signature in body preserved', out.includes('> Warmly,'), JSON.stringify(out));
  check('quoted case still gets exactly one live signature appended', out.endsWith(SIG) && count(out, '-- \n') === 1, JSON.stringify(out));
}

// 7. Empty signature = Vero's deliberate "no signature" choice. Nothing added.
{
  const out = appendSignatureText('Just the message.', '');
  check('empty signature appends nothing', out === 'Just the message.', JSON.stringify(out));
}

// 8. HTML path: built from the STRIPPED body, so the model's sign-off must
//    not appear in the paragraphs — only the signature block carries it.
{
  const body =
    'Looking forward to it!\n\nWarmly,  \nVeronika  \nVero Photography';
  const stripped = stripTrailingSignature(body, SIG);
  const html = buildReplyHtml(stripped, SIG_HTML);
  check('html body carries the signature exactly once', count(html, 'Warmly,') === 1, html);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log('\nAll signature-append cases pass.');
