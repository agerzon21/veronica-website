/**
 * The send gate, checked in the build.
 *
 *   node scripts/check-send-gate.mjs
 *
 * WHY THIS FILE EXISTS. looksLikeSendApproval in api/_house-style.ts is the
 * one piece of code standing between the assistant and an email to a real
 * customer. On 2026-09-18 the model read "stop messing with the signature, we
 * dont need to include our email" as approval and mailed a paying client,
 * because the only thing checked was a boolean the model itself filled in.
 * The gate was the answer to that. It was not covered by anything.
 *
 * Worse, the gate's own comments cited "scratchpad/test-send-approval.mjs" as
 * its coverage, and that file was never in the repo. A comment claiming a test
 * exists is worse than no comment: the next person to touch these regexes
 * reads it and believes the branches are pinned.
 *
 * WHY IT DOES NOT USE tsx OR NODE'S TYPE STRIPPING. Node 24 imports a .ts file
 * directly and tsx would also work locally, but Vercel builds on whatever Node
 * the project is pinned to, and on Node 22 an `import` of a .ts file throws
 * ERR_UNKNOWN_FILE_EXTENSION. That would not fail this check, it would fail
 * the whole production build. `typescript` is already a devDependency, so the
 * file is transpiled in memory and imported as a data: URL. api/_house-style.ts
 * imports nothing, which is what makes that safe.
 *
 * Nothing here touches the network, a model, or the database. It is pure
 * string in, verdict out, so it belongs in the build in a way the two
 * check-reply-*.ts scripts never could: those call a real model, cost money
 * per run, and need keys the build has no business holding.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(here, '..', 'api', '_house-style.ts');

const js = ts.transpileModule(readFileSync(SOURCE, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

const gate = await import(
  'data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64')
);

const {
  looksLikeSendApproval,
  ALLOW_DRAFT_AND_SEND_IN_ONE_MESSAGE,
  ACCEPT_LOOSE_AFFIRMATIVES,
} = gate;

if (typeof looksLikeSendApproval !== 'function') {
  console.error('check-send-gate: looksLikeSendApproval is not exported any more.');
  process.exit(1);
}

let pass = 0;
const failures = [];

/**
 * @param want    'send' or 'refuse'. What the gate must decide.
 * @param message What Vero typed this turn.
 * @param offer   The assistant's previous turn, which decides whether a bare
 *                "yes" is answering an offer to send or something else.
 */
function expect(want, message, offer, note) {
  const got = looksLikeSendApproval(message, offer ?? '');
  const decided = got.ok ? 'send' : 'refuse';
  if (decided === want) {
    pass++;
  } else {
    failures.push({ want, got: decided, why: got.why, message, note });
  }
}

const OFFERED = 'Here is the draft. Shall I send it?';
const NO_OFFER = 'Here is the draft. Does the tone look right to you?';

// ── The incident this gate was built for ────────────────────────────────────
expect('refuse',
  "stop messing with the signature, we dont need to include our email",
  'I have updated the draft. Would you like me to send it?',
  'THE message that mailed a real customer');

// ── Plain approvals ─────────────────────────────────────────────────────────
expect('send', 'send it', NO_OFFER, 'the ordinary case');
expect('send', 'Send it to her please', NO_OFFER, 'an explicit send verb needs no offer');
expect('send', 'отправь', NO_OFFER, 'Russian, same thing');
expect('send', 'resend it', NO_OFFER, 'resend counts');

// ── Every ordinary Russian verb for "send", not just the one ────────────────
// Vero typed "Хорошо отсылай" and was refused twice, because отсылать was not
// on the list. A verb this gate does not know is not a safer gate; it is a
// gate that tells her the product is broken. Each of these is unambiguously
// an instruction to send.
expect('send', 'Хорошо отсылай', NO_OFFER, 'THE message that was wrongly refused');
expect('send', 'отсылай', NO_OFFER, 'отсылать, imperative');
expect('send', 'отсылайте', NO_OFFER, 'and its polite form');
expect('send', 'отправляй', NO_OFFER, 'отправлять, imperative');
expect('send', 'отправьте', NO_OFFER, 'and its polite form');
expect('send', 'отошли', NO_OFFER, 'отослать, imperative');
expect('send', 'отошлите', NO_OFFER, 'and its polite form');
expect('send', 'высылай', NO_OFFER, 'высылать, imperative');
expect('send', 'скинь', NO_OFFER, 'скинуть, the informal one');
expect('send', 'ок отсылай', NO_OFFER, 'with an affirmative in front of it');

// Widening the verb list must not widen anything else. Each of these still
// refuses, for a reason that has nothing to do with which verb was used.
expect('refuse', 'не отсылай', OFFERED, 'a refusal, in the newly added verb');
expect('refuse', 'не высылай пока', OFFERED, 'a hold, in the newly added verb');
expect('refuse', 'отсылай после того как исправишь приветствие', OFFERED,
  'a condition, in the newly added verb');
expect('refuse', 'ты уже отослал?', OFFERED, 'a question about the past');
// "пошли" stays OFF the verb list on purpose: it is far more often "let's
// go" than "send them". It can still approve, but only down the STRICTER
// path, where the assistant has to have asked whether to send.
expect('send',   'пошли', OFFERED,  'a bare affirmative, and the assistant did ask');
expect('refuse', 'пошли', NO_OFFER, 'the same word with nothing to answer');

// ── A bare yes only counts when the assistant asked ─────────────────────────
expect('send',   'yes', OFFERED,  'yes, to an offer to send');
expect('refuse', 'yes', NO_OFFER, 'yes, to a question about TONE');
expect('send',   'да',  OFFERED,  'Russian yes, to an offer');
expect('refuse', 'да',  NO_OFFER, 'Russian yes, to something else');
expect('refuse', 'yes', '',       'yes, with no previous turn at all');
expect('refuse', 'looks good', NO_OFFER, 'praise is not permission');

// A draft almost always contains the word "send" and almost always ends in a
// question. If the whole previous message were searched instead of its
// question clauses, every "yes" in the chat would become an approval.
expect('refuse', 'yes',
  'Draft: "I will send the gallery link over tomorrow." Does that read right?',
  'the send verb is in the DRAFT, not in the question');

// ── Not-yet, not-like-that, and questions ───────────────────────────────────
expect('refuse', 'send it after you fix the greeting', OFFERED, 'a condition, not consent');
expect('refuse', 'send it but make it shorter first', OFFERED, 'an edit request');
expect('refuse', 'do not send that', OFFERED, 'a refusal containing a send verb');
expect('refuse', "don't send it yet", OFFERED, 'contraction');
expect('refuse', 'не отправляй', OFFERED, 'Russian refusal');
expect('refuse', 'did you send it already?', OFFERED, 'a question about the past');
expect('refuse', 'should I send this one first?', OFFERED, 'a question about order');
expect('refuse', 'why did you send that', OFFERED, 'an accusation, not an instruction');
expect('refuse', 'hold off on sending', OFFERED, 'an explicit hold');
expect('refuse', 'it has been a day since I sent them the portal link', NO_OFFER,
  'past tense "sent" is not an instruction');

// ── A quoted send verb is in the text, not in the request ───────────────────
expect('refuse', 'use this line: "I will send the gallery tomorrow"', OFFERED,
  'the verb is inside the quotes');
expect('refuse', 'here is the wording I want:\n> I will send it over\nuse that', OFFERED,
  'quoted with a blockquote');

// ── Length ──────────────────────────────────────────────────────────────────
expect('refuse',
  'ok so for this one she asked about the two hour package and whether we travel, ' +
  'and I said we do, so mention the travel fee and then send it',
  OFFERED,
  'a briefing is not an approval, however it ends');

// ── Empty and whitespace ────────────────────────────────────────────────────
expect('refuse', '', OFFERED, 'nothing typed');
expect('refuse', '   ', OFFERED, 'whitespace only');

// ── The two owner decisions, pinned to whatever they are set to ─────────────
// Asserted against the exported constant rather than hardcoded, so flipping a
// flag changes the expectation with it and this check keeps telling the truth
// either way. The earlier comment claimed a test exercised both branches; a
// compile-time constant has only one branch at a time, and pretending
// otherwise is how a claim like that goes stale.
expect(
  ALLOW_DRAFT_AND_SEND_IN_ONE_MESSAGE ? 'send' : 'refuse',
  'draft a reply to Sarah and send it',
  NO_OFFER,
  `compose and send in one message (flag is ${ALLOW_DRAFT_AND_SEND_IN_ONE_MESSAGE})`,
);
expect(
  ACCEPT_LOOSE_AFFIRMATIVES ? 'send' : 'refuse',
  'fire away',
  OFFERED,
  `a loose yes, after an offer (flag is ${ACCEPT_LOOSE_AFFIRMATIVES})`,
);
expect(
  ACCEPT_LOOSE_AFFIRMATIVES ? 'send' : 'refuse',
  '👍',
  OFFERED,
  `a thumbs up, after an offer (flag is ${ACCEPT_LOOSE_AFFIRMATIVES})`,
);
// The loose list widens what counts as a yes. It never removes the
// requirement that the assistant actually offered to send.
expect('refuse', 'fire away', NO_OFFER, 'a loose yes with no offer is still refused');
expect('refuse', '👍', NO_OFFER, 'a thumbs up with no offer is still refused');

// ── Known false refusals, recorded on purpose ───────────────────────────────
// These cost Vero a retyped message. They are asserted so that if someone
// widens the gate to accept them, they do it deliberately and this line is
// what tells them they did.
expect('refuse', 'sure, go ahead', OFFERED,
  'two affirmatives joined by a comma match neither entry in the list');

// ── Does Vero HEAR about a refusal? ─────────────────────────────────────────
//
// `sendish` decides that, and it is not the gate. The gate is `ok` and only
// `ok`; every case below is refused either way. What this pins is the
// difference between the two refusals as Vero experiences them.
//
// She typed "end it with an exclamation mark not a period and youre good to
// send it". Refused, correctly, for being 78 characters of edit with an
// approval welded on. She then had every reason to believe the mail had gone
// out, and the panel said nothing she could act on: it printed six lines of
// instructions meant for the model. That case has to produce a short note.
//
// The opposite case is the model reaching for send_reply on a turn where she
// said nothing about sending. She is not waiting for anything, and a warning
// about a send she never asked for is noise in a column she reads all day.
// Logged, and nothing more.
const sendish = (want, message, offer, note) => {
  const got = looksLikeSendApproval(message, offer ?? '');
  if (got.sendish === want) { pass++; return; }
  failures.push({
    want: `sendish=${want}`, got: `sendish=${got.sendish}`, why: got.why, note, message,
  });
};

// Near misses. She is expecting a send and is not getting one.
sendish(true, 'end it with an exclamation mark not a period and youre good to send it', OFFERED,
  'THE ONE THAT BIT: a long edit with an approval on the end');
sendish(true, 'ok looks good, change the last line and then send it to her please', OFFERED,
  'an edit and a send in one breath');
sendish(true, 'yes', NO_OFFER, 'a bare yes with nothing offered behind it');
sendish(true, 'did you send it already?', OFFERED, 'asking whether it went is her looking for exactly this');

// A negation sitting right on the verb. She knows nothing went.
sendish(false, "don't send it yet", OFFERED, 'an explicit hold, with the verb right there');
sendish(false, 'do not send that', OFFERED, 'the same, spelled out');
sendish(false, 'не отправляй пока', OFFERED, 'the same in Russian');
sendish(false, 'hold off on sending it', OFFERED, 'a hold phrased as a hold');
// ...and a negation that is NOT on the verb must not suppress the note.
sendish(true, 'wait, actually go ahead and send it', OFFERED,
  'a false start followed by a real approval');
sendish(true, 'no not that one, send the other draft', OFFERED,
  'two negations, neither of them attached to the verb');

// Not near misses. She said nothing about sending.
sendish(false, "that's too formal, warm it up", OFFERED, 'a plain edit request');
sendish(false, 'no not yet', OFFERED, 'an explicit do-not-send');
sendish(false, 'what do you know about my pricing?', NO_OFFER, 'an unrelated question');
sendish(false, '', NO_OFFER, 'an empty message');

// And the accepting cases carry it too, so the field is never just "the
// refusal reason in disguise".
sendish(true, 'send it', OFFERED, 'a plain approval');
sendish(true, 'отправляй', OFFERED, 'a plain approval in Russian');

// ── Report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\ncheck-send-gate: ${failures.length} of ${pass + failures.length} FAILED\n`);
  for (const f of failures) {
    console.error(`  wanted ${f.want}, got ${f.got} (${f.why})`);
    console.error(`    ${f.note}`);
    console.error(`    message: ${JSON.stringify(f.message)}\n`);
  }
  console.error('The send gate decides whether a real email reaches a real customer.');
  console.error('Do not relax a case here to make the build pass.\n');
  process.exit(1);
}

console.log(`send gate: ${pass} cases correct (the approval gate on customer email).`);
