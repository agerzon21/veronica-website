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
