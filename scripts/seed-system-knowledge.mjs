/**
 * Seeds ai_context with source='system' rows — the documentation the
 * in-panel assistant uses to answer Veronika's "how do I…" questions.
 *
 *   node --env-file=.env.local scripts/seed-system-knowledge.mjs
 *
 * Re-runnable: deletes and replaces the whole source='system' set every
 * time. That is safe precisely because these rows are ours — Vero's own
 * knowledge is source='manual' or 'chatbot' and is never touched here.
 * Re-run it whenever the admin panel changes.
 *
 * The content in scripts/data/system-knowledge.json was extracted from
 * the codebase and then adversarially verified against it — 27 of the 32
 * entries had to be corrected on that pass, because a first reading of
 * the UI produced steps that named buttons which don't exist or promised
 * outcomes the code doesn't deliver. Do not hand-edit that file without
 * re-checking the claims; a confidently wrong instruction is worse for
 * Veronika than no instruction at all.
 *
 * NOTE: these rows are deliberately excluded from the customer-facing
 * reply engine (api/_ai-reply.ts filters source <> 'system') and are
 * protected from edit/delete in the Context tab and the assistant's own
 * tools. See db/migrations/018-system-knowledge.sql.
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const url = process.env.POSTGRES_URL;
if (!url) {
  console.error('POSTGRES_URL not set — run with --env-file=.env.local');
  process.exit(1);
}
const sql = neon(url);
const here = dirname(fileURLToPath(import.meta.url));

const CATEGORY_BY_AREA = {
  'galleries-and-portals': 'panel_galleries',
  'photos-and-site-content': 'panel_site_content',
  'inbox-leads-assistant': 'panel_messages',
  'when-to-ask-alex': 'panel_troubleshooting',
};

const entries = JSON.parse(
  readFileSync(join(here, 'data', 'system-knowledge.json'), 'utf8'),
);

await sql`DELETE FROM ai_context WHERE source = 'system'`;

let seeded = 0;
for (const [i, e] of entries.entries()) {
  const category = CATEGORY_BY_AREA[e.category] ?? 'panel_help';
  const content =
    e.content.replace(/^LABEL:.*\n+/i, '').trim() +
    (e.requiresAlex ? "\n\n(This one is Alex's — not something to try from the panel.)" : '');
  await sql`
    INSERT INTO ai_context (category, label, content, source, active, sort_order)
    VALUES (${category}, ${e.label}, ${content}, 'system', TRUE, ${i})
  `;
  seeded++;
}
console.log(`Seeded ${seeded} system-knowledge entries.`);

const [check] = await sql`
  SELECT COUNT(*)::int n FROM ai_context WHERE active AND source <> 'system'
`;
console.log(`Customer-facing knowledge untouched: ${check.n} entries.`);
