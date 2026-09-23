import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('/Users/alexgerzon/Documents/Projects/VeronicaWebsite/.env.local','utf8');
const m = env.match(/^POSTGRES_URL=(.*)$/m);
const url = m[1].trim().replace(/^["']|["']$/g,'');
const sql = neon(url);
const rows = await sql`select id, category, label, source, active, content, created_at, updated_at from ai_context where id = '608b631b-2ab9-4a1d-bc33-e5ce56aa61c8'`;
console.log(JSON.stringify(rows, null, 2));
