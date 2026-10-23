// Applies db/schema.sql to the Neon database in DATABASE_URL (or DATABASE_URL_UNPOOLED).
// Usage: node --env-file=<file with DATABASE_URL> scripts/migrate.mjs
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run `vercel env pull` into a file and pass it with --env-file.');
  process.exit(1);
}

const sql = neon(url);
const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
// Strip comments, then run each statement in order.
const statements = schema
  .replace(/--.*$/gm, '')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
  console.log('ok:', statement.split('\n')[0]);
}
console.log(`Applied ${statements.length} statements.`);
