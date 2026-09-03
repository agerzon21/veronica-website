/**
 * Runs real messages through the inbound relevance gate.
 *
 *   npx tsx scripts/check-reply-gate.ts
 *
 * The first case is verbatim the Instagram DM that got a photography
 * brush-off sent to one of Vero's friends. Only 'personal' and 'spam' stay
 * silent — anything ambiguous still gets a reply, because a missed client
 * costs more than a needless hello.
 */
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });
import { classifyInboundRelevance } from '../api/_ai-reply.js';

const CASES: Array<{ text: string; expect: string; note: string }> = [
  { text: "Hey, we're doing a bon fire tomorrow night at 6 if you want to come for it!", expect: 'personal', note: 'the DM that misfired' },
  { text: 'Hi! Are you available June 26 2027 for a wedding? What are your rates?', expect: 'business', note: 'real enquiry' },
  { text: 'Hello, we help photographers rank #1 on Google. Interested in a free audit?', expect: 'spam', note: 'agency pitch' },
  { text: 'hey', expect: 'unclear', note: 'ambiguous — must still reply' },
  { text: 'Loved the photos you took of us last summer! Can we book again in May?', expect: 'business', note: 'returning client' },
];

async function main() {
  let bad = 0;
  for (const c of CASES) {
    const got = await classifyInboundRelevance([
      { direction: 'inbound', body: c.text } as never,
    ]);
    const replies = got === 'business' || got === 'unclear';
    const ok = got === c.expect;
    if (!ok) bad++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${got.padEnd(8)} (want ${c.expect.padEnd(8)}) ` +
        `${replies ? 'REPLIES ' : 'silent  '} ${c.note}`,
    );
  }
  console.log(bad ? `\n${bad} case(s) misclassified.` : '\nAll cases as expected.');
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
