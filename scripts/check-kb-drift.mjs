#!/usr/bin/env node
/**
 * Does the AI knowledge base still agree with the website?
 *
 * WHY THIS EXISTS
 * ai_context is edited by hand, through conversation, over months. The website
 * is edited in git. Nothing connected them, so they drifted, and the drift was
 * invisible until a customer was quoted the wrong price.
 *
 * By 2026-09-30 the knowledge base was telling customers Full Wedding Day cost
 * $1,000 while the site sold it at $1,200, and was stating "minimum 500
 * professionally color-corrected photos" for a package whose contract says the
 * image count is agreed separately. That second row is where "500-700
 * professionally edited photos" came from in a reply that reached a real
 * couple. Nobody invented it. It was read out of the database and quoted
 * faithfully.
 *
 * It also held five snapshots of past conversations under the `tone` category,
 * which the prompt injects as KNOWN FACTS, including availability on dates that
 * had long passed.
 *
 * None of that fails loudly. The assistant keeps answering, just wrongly. So
 * this looks for the specific shapes of drift that have actually happened.
 *
 * Needs the database, so it is not in the build. Run: npm run check:kb
 */

import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const site = JSON.parse(readFileSync('src/data/wedding-page.json', 'utf8'));

/** Every price the public weddings page shows, as bare numbers. */
const sitePrices = new Set();
for (const p of site.packages ?? []) {
  const n = String(p.price).replace(/[^\d]/g, '');
  if (n) sitePrices.add(Number(n));
}
for (const a of site.addOns ?? []) {
  for (const m of String(a.detail).matchAll(/\$([\d,]+)/g)) {
    sitePrices.add(Number(m[1].replace(/,/g, '')));
  }
}

const findings = [];

const rows = await sql`
  SELECT id, category, label, content FROM ai_context
  WHERE active = TRUE AND source <> 'system'
  ORDER BY category, label`;

for (const r of rows) {
  const text = String(r.content).replace(/\s+/g, ' ');
  const where = `[${r.category}] ${r.label}`;

  // 1. A delivered-image count. The site publishes none for any package and
  //    the contract says it is agreed separately, so any number here is a
  //    promise nobody made.
  for (const m of text.matchAll(
    /\b(?:minimum|min\.?|at least|around|about|up to)\s+(\d{2,4})\s+(?:\w+\s+){0,3}?(photos?|images?)\b/gi,
  )) {
    findings.push({
      where,
      what: `states a delivered image count ("${m[0].trim()}")`,
      why: 'The site publishes no count for any package and contract-template.ts says the number is agreed separately.',
    });
  }

  // 2. A wedding price that is not on the website. Only checked on rows that
  //    are actually about weddings, so a $250 proposal is not a false alarm.
  if (/wedding/i.test(`${r.label} ${text}`)) {
    for (const m of text.matchAll(/\$([\d,]{3,})/g)) {
      const amount = Number(m[1].replace(/,/g, ''));
      if (amount >= 300 && !sitePrices.has(amount)) {
        findings.push({
          where,
          what: `quotes $${amount.toLocaleString()} for wedding work`,
          why: `The site publishes ${[...sitePrices].sort((a, b) => a - b).map((n) => '$' + n.toLocaleString()).join(', ')}. A figure not on that list will be quoted to a customer who can read the real one.`,
        });
      }
    }
  }

  // 3. A retainer percentage other than the published 15%.
  for (const m of text.matchAll(/\b(\d{1,2})%\s*(?:retainer|deposit|down)/gi)) {
    if (m[1] !== '15') {
      findings.push({
        where,
        what: `states a ${m[1]}% retainer`,
        why: 'wedding-page.json publishes 15% in two places and the contract template matches it.',
      });
    }
  }

  // 4. A stored reply to a named past customer, cited as fact. These carry
  //    expired availability and old prices, and they get copied as templates.
  if (/^response example/i.test(r.label)) {
    findings.push({
      where,
      what: 'is a stored snapshot of a past conversation, injected as a KNOWN FACT',
      why: 'These carry availability and prices that were true once. One of them is where the "how many hours are you looking for?" habit came from.',
    });
  }
}

// 5. Two active rows on the same topic holding different money.
const TOPICS = [
  ['family session', /family session/i],
  ['individual or one-hour session', /(individual|one[- ]hour) session/i],
  ['deposit or retainer', /(deposit|retainer)/i],
];
for (const [name, re] of TOPICS) {
  const hits = rows.filter((r) => re.test(`${r.label} ${r.content}`));
  const amounts = new Map();
  for (const r of hits) {
    for (const m of String(r.content).matchAll(/\$([\d,]+)/g)) {
      const n = Number(m[1].replace(/,/g, ''));
      if (!amounts.has(n)) amounts.set(n, []);
      amounts.get(n).push(r.label);
    }
  }
  if (amounts.size > 1) {
    findings.push({
      where: `(topic) ${name}`,
      what: `${amounts.size} different figures across active rows: ${[...amounts.entries()].map(([n, ls]) => `$${n} in "${ls[0]}"`).join(', ')}`,
      why: 'The model will pick one. Which one is not predictable, and the customer sees whichever it picked.',
    });
  }
}

if (!findings.length) {
  console.log(`knowledge base check: ${rows.length} active rows, no drift against the published site.`);
  process.exit(0);
}
console.log(`knowledge base check: ${findings.length} issue(s) across ${rows.length} active rows\n`);
for (const f of findings) {
  console.log(`  ${f.where}`);
  console.log(`    ${f.what}`);
  console.log(`    ${f.why}\n`);
}
console.log('Nothing has been changed. Edit these in the Assistant tab, or deactivate them.');
