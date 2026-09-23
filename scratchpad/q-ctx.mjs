import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.POSTGRES_URL || process.env.DATABASE_URL);
const rows = await sql`select id, category, label, source, active, sort_order, content from ai_context where id = '36e4edb8-08ff-4df6-99fe-fa1f597df3b1'`;
for (const r of rows) {
  console.log('ID:', r.id, '| cat:', r.category, '| label:', r.label, '| source:', r.source, '| active:', r.active, '| sort:', r.sort_order);
  console.log('--- CONTENT START ---');
  console.log(r.content);
  console.log('--- CONTENT END ---');
}
console.log('rowcount', rows.length);
