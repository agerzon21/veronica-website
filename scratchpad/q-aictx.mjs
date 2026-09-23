import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
const env = fs.readFileSync('/Users/alexgerzon/Documents/Projects/VeronicaWebsite/.env.local','utf8');
const get = (k) => {
  const m = env.match(new RegExp('^'+k+'=(.*)$','m'));
  return m ? m[1].trim().replace(/^["']|["']$/g,'') : null;
};
const url = get('POSTGRES_URL') || get('DATABASE_URL');
const sql = neon(url);
const rows = await sql`select id, category, label, source, active, sort_order, length(content) as len, content, created_at, updated_at from ai_context where id = 'b47391b8-71eb-46e1-abbe-b544eebf827a'`;
console.log(JSON.stringify(rows, null, 2));
