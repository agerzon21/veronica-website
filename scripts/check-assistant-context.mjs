#!/usr/bin/env node
/**
 * Guard: the assistant must never again reply from an empty context.
 *
 * WHY THIS EXISTS
 * A draft went to a real prospective couple stating they would receive
 * "500-700 professionally edited photos". That number appears nowhere on the
 * site and nowhere in the contracts, which say the image count is agreed
 * separately. The same assistant, asked what was still outstanding before a
 * contract, asked the CUSTOMER for details settled earlier in the same thread.
 *
 * Neither was a missing rule. The system prompt already said "only cite these,
 * never invent details". They happened because:
 *
 *   - KNOWN FACTS was a hand-maintained table that had drifted from the site,
 *     so the model had a gap and filled it from its training data;
 *   - the reply path read the last few messages and nothing else, while the
 *     summariser's output sat unread in conversations.summary_json;
 *   - read_thread paged the OLDEST 40 messages, hiding the recent ones.
 *
 * Each fix is one line away from being undone by a well-meaning edit, and none
 * of them fails loudly: the assistant keeps answering, just worse. So this
 * checks the wiring is still in place. Source-level on purpose, so it runs in
 * plain node with no build step, same as check-api-imports.mjs.
 *
 * Run: node scripts/check-assistant-context.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const reply = read('api/_ai-reply.ts');
const assistant = read('api/admin/_assistant-chat.ts');
const facts = read('api/_business-facts.ts');
const wedding = JSON.parse(read('src/data/wedding-page.json'));

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// ── The published facts reach both prompts ─────────────────────────────
check(
  reply.includes('businessFactsForCustomerReplies()'),
  'api/_ai-reply.ts no longer renders businessFactsForCustomerReplies(). The customer reply prompt is back to a hand-maintained knowledge base that can drift from the website.',
);
check(
  reply.includes('unknownsForCustomerReplies()'),
  'api/_ai-reply.ts no longer renders unknownsForCustomerReplies(). This is the block that stops the model inventing a photo count.',
);
check(
  assistant.includes('businessFactsForCustomerReplies()') &&
    assistant.includes('unknownsForCustomerReplies()'),
  'api/admin/_assistant-chat.ts no longer renders the published facts or the unknowns. Vero drafts customer replies through this prompt, so it needs both.',
);

// ── The unknowns still name the failure they exist for ─────────────────
check(
  /NUMBER OF PHOTOS DELIVERED/.test(facts),
  'api/_business-facts.ts no longer declares the image-count gap. Without it a model answers "how many photos" from its training data, which is how 500-700 reached a customer.',
);
check(
  /RAW FILES/.test(facts) && /AVAILABILITY ON A DATE/.test(facts),
  'api/_business-facts.ts is missing one of the other never-state facts (RAW files, date availability).',
);

// ── The thread summary is wired into every generation path ─────────────
check(
  reply.includes('export async function conversationSummaryBlock'),
  'conversationSummaryBlock is gone from api/_ai-reply.ts. Without it the model cannot see anything older than the history window and will re-ask settled questions.',
);
const summaryCalls = (reply.match(/conversationSummaryBlock\(/g) ?? []).length;
check(
  summaryCalls >= 3,
  `conversationSummaryBlock is called ${summaryCalls - 1} time(s) but should be called on BOTH the on-demand draft path and the inbound auto-reply path (plus its declaration).`,
);
const generateCalls = (reply.match(/await generateReply\(\{/g) ?? []).length;
const extraPassed = (reply.match(/extraSystemContext[,:]/g) ?? []).length;
check(
  extraPassed >= generateCalls,
  `${generateCalls} generateReply() call site(s) but only ${extraPassed} pass extraSystemContext. A call site without it replies with no portal state and no summary.`,
);

// ── The history window stays wide enough to hold a negotiation ─────────
const windowMatch = reply.match(/const HISTORY_CONTEXT_MESSAGES = (\d+)/);
check(
  windowMatch && Number(windowMatch[1]) >= 24,
  `HISTORY_CONTEXT_MESSAGES is ${windowMatch ? windowMatch[1] : 'missing'}. It was 12, which is about six exchanges, and booking threads run far longer.`,
);

// ── read_thread pages the NEWEST messages, not the oldest ──────────────
const readThread = assistant.slice(assistant.indexOf("if (name === 'read_thread')"));
const body = readThread.slice(0, readThread.indexOf("if (name === 'update_draft')"));
check(
  /ORDER BY sent_at DESC LIMIT/.test(body),
  'read_thread is paging with ORDER BY sent_at ASC again. On any thread longer than the limit that returns the OLDEST messages and hides the recent ones, including the message being asked about.',
);
check(
  /established/.test(body) && /still_missing/.test(body),
  'read_thread no longer returns `established` / `still_missing`. That is what stops the assistant asking a customer for details the thread already settled.',
);

// ── The forbidden-claim gate is enforced in CODE, not just the prompt ──
// The prompt forbade the photo count and the model shipped it twice, the
// second time with the rule, the facts and a worked example all in context.
// It was anchoring on its own previous draft, not disobeying. A rule cannot
// catch what is not being decided, so this must stay a gate.
check(
  /export function forbiddenClaims/.test(facts),
  'forbiddenClaims is gone from api/_business-facts.ts. Without it the only thing stopping an invented photo count is a prompt instruction, which has already failed twice in production.',
);
check(
  /A claim about insurance cover/.test(facts),
  'The insurance detector is gone. The model once told a prospective customer "I currently do not have liability insurance", inferred purely from the fact not being in its knowledge base. Neither direction may pass.',
);
check(
  /The retainer alone described as booking the date/.test(facts),
  'The retainer/contract pairing check is gone. The site and the contract both say the date is reserved only when the contract is signed AND the retainer is paid; naming the money alone tells a couple they are booked when they are not.',
);
const gateCalls = (assistant.match(/forbiddenClaims\(text\)/g) ?? []).length;
check(
  gateCalls >= 2,
  `forbiddenClaims(text) guards ${gateCalls} write path(s); both update_draft and send_reply must call it. Text can reach send_reply without passing through update_draft.`,
);
check(
  (assistant.match(/forbidden_claims_confirmed/g) ?? []).length >= 4,
  'forbidden_claims_confirmed is missing from a tool schema or a guard. Both update_draft and send_reply need the check and the declared override, or the model cannot comply when Vero genuinely overrides.',
);

// ── Both prompts know what day it is ───────────────────────────────────
// A contact form asked for a session on the day it was submitted and neither
// prompt could tell, because neither had ever been given the date. It took
// four rounds of correction to get a draft to say "that is today".
check(
  /## TODAY IS/.test(reply),
  'The customer reply prompt no longer states the current date. Without it the model cannot tell a date next summer from one that has already passed.',
);
check(
  /## TODAY IS/.test(assistant),
  'The assistant prompt no longer states the current date.',
);

// ── The assistant knows what a booking actually needs ──────────────────
// Generated from BOOKING_REQUIREMENTS, the same list the contract form
// validates against. Without it the assistant improvised, asking a family
// enquiry for themes, a phone number and "any important details" when the
// only real gap was coverage hours.
check(
  /BOOKING_REQUIREMENTS/.test(assistant),
  'The assistant prompt no longer renders BOOKING_REQUIREMENTS, so what it asks customers for can drift from what the contract form demands.',
);
check(
  /WHAT A BOOKING ACTUALLY NEEDS/.test(assistant),
  'The "what a booking actually needs" block is gone from the assistant prompt.',
);

// ── "Nothing was saved" does not fire on ordinary draft rewrites ───────
// It matched a bare "noted" or "updated" anywhere in the reply, including
// inside the customer-facing draft the instructions require it to print in
// full. It fired on essentially every revision and read as a broken panel.
check(
  /export function claimSurface/.test(assistant),
  'claimSurface is gone. Claim detection is back to matching the whole reply, which includes the draft body, so "(Nothing was saved)" will fire on every rewrite again.',
);

// ── Facts Vero recorded by hand reach the drafts ──────────────────────
// record_client_facts wrote to conversations.client_facts and nothing ever
// read it back. One thread held an agreed price of $500, two locations and
// two time windows, all invisible to every draft written to that customer.
check(
  /vero_recorded/.test(assistant),
  'read_thread no longer returns `vero_recorded`. Facts Vero deliberately stopped to record go back to being written and never read, which is how an agreed price stays invisible to the next draft.',
);
check(
  /client_facts/.test(readThread ?? '') || /SELECT summary_json, client_facts/.test(assistant),
  'read_thread no longer selects client_facts alongside the summary.',
);

// ── The generated facts still match the site ───────────────────────────
const prices = (wedding.packages ?? []).map((p) => p.price).filter(Boolean);
check(
  prices.length >= 3,
  `src/data/wedding-page.json has ${prices.length} package price(s). The facts block is generated from it, so a shape change here silently empties the assistant's pricing.`,
);
for (const q of [
  'Do you require a deposit?',
  'What exactly do we receive?',
  'When and how do we get our photos?',
]) {
  check(
    (wedding.faq ?? []).some((f) => f.q === q),
    `FAQ entry "${q}" was renamed or removed. api/_business-facts.ts matches on its wording, so the assistant has quietly lost that fact. Update the needle in faqAnswer().`,
  );
}

if (failures.length) {
  console.error('assistant context check FAILED:\n');
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log(
  `assistant context check: published facts wired into both prompts, summary on all reply paths, history window ${windowMatch[1]}, read_thread paging newest-first.`,
);
