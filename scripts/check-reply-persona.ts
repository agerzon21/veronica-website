/**
 * Prints the voice the customer-reply engine will actually use, built from the
 * REAL knowledge base rather than from reading the code.
 *
 *   npx tsx scripts/check-reply-persona.ts
 *
 * WHY THIS EXISTS
 * Vero asked three times for drafts to stop opening "Hi! I'm Vero's
 * Assistant". Each time the in-panel assistant agreed and wrote a `tone`
 * entry, and each time nothing changed — the persona was hard-coded, and
 * `tone` entries are injected as KNOWN FACTS beneath a block marked "never
 * violate". Nothing anywhere could answer "so which voice IS it using?"
 * without someone reading the prompt source. Now it can be checked.
 */
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ quiet: true });

import { neon } from '@neondatabase/serverless';
import { buildSystemPrompt } from '../api/_ai-reply.js';

async function main() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('No POSTGRES_URL / DATABASE_URL — cannot read the knowledge base.');
    process.exit(2);
  }
  const sql = neon(url);
  const rows = (await sql`
    SELECT category, label, content FROM ai_context
    WHERE active = TRUE AND source <> 'system'
    ORDER BY category, sort_order
  `) as Array<{ category: string; label: string; content: string }>;

  const persona =
    rows.find((r) => r.category === 'identity' && r.label === 'Reply persona')?.content ??
    '(unset — defaults to assistant)';
  // Both paths, because the whole point is that they differ: an email draft
  // Vero approves goes out as her; an Instagram reply auto-sends unreviewed
  // and must not claim to be her.
  const draft = buildSystemPrompt(rows as never, 0, false, true);
  const autoSend = buildSystemPrompt(rows as never, 0, false, false);
  const voice = (p: string) =>
    p.includes('You ARE Vero') ? 'Vero (first person)'
      : p.includes('You are NOT Vero') ? "Vero's Assistant (third person)"
      : 'AMBIGUOUS';

  console.log(`knowledge rows loaded  : ${rows.length}`);
  console.log(`identity/Reply persona : ${persona}`);
  console.log('');
  console.log(`email / reviewed draft : ${voice(draft)}`);
  console.log(`instagram / auto-send  : ${voice(autoSend)}`);
  console.log('');
  const start = draft.indexOf('## WHO YOU ARE');
  console.log('--- voice block for a reviewed draft ---');
  console.log(draft.slice(0, start + 400).split('\n').slice(0, 8).join('\n'));

  if (voice(draft) === 'AMBIGUOUS' || voice(autoSend) === 'AMBIGUOUS') {
    console.error('\nFAIL: the prompt is ambiguous about who it is speaking as.');
    process.exit(1);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
