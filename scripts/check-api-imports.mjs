/**
 * Every relative import in a module the API can reach must carry its extension.
 *
 * The api/ functions run as real Node ESM (package.json is "type": "module"),
 * where `from '../data/contract-template'` throws ERR_MODULE_NOT_FOUND at load.
 * api/admin.ts imports every admin handler, so ONE such specifier anywhere in
 * the graph takes the entire admin API down at once, and every endpoint returns
 * FUNCTION_INVOCATION_FAILED before it reaches a line of handler code.
 *
 * That shipped on 2026-09-17. It was invisible locally because Vite resolves
 * extensionless specifiers happily, and tsc with moduleResolution "bundler"
 * accepts them too, so the build, the typecheck and every local test passed.
 * Only production runs the code the way Node actually resolves it.
 *
 * Run: node scripts/check-api-imports.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Resolve a specifier the way Node will, then map back to the .ts on disk. */
function resolveToSource(fromFile, spec) {
  let target = normalize(join(dirname(fromFile), spec));
  if (target.endsWith('.js')) target = target.slice(0, -3);
  for (const ext of ['.ts', '.tsx']) {
    if (existsSync(target + ext)) return target + ext;
  }
  return null;
}

// Seeds: every src module imported directly by something under api/.
const seeds = new Set();
for (const file of walk(join(ROOT, 'api'))) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/from\s+'((?:\.\.\/)+src\/[^']+)'/g)) {
    const resolved = resolveToSource(file, m[1]);
    if (resolved) seeds.add(resolved);
  }
}

// Walk the transitive closure, checking every relative specifier on the way.
const seen = new Set();
const queue = [...seeds];
const offenders = [];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/from\s+'(\.[^']+)'/g)) {
    const spec = m[1];
    if (!spec.endsWith('.js') && !spec.endsWith('.json')) {
      const line = text.slice(0, m.index).split('\n').length;
      offenders.push(`${relative(ROOT, file)}:${line}  ${spec}`);
    }
    const resolved = resolveToSource(file, spec);
    if (resolved) queue.push(resolved);
  }
}

if (offenders.length) {
  console.error(
    `\nRelative imports without an extension, in ${offenders.length} place(s).\n` +
      `These resolve under Vite but throw ERR_MODULE_NOT_FOUND in the Vercel\n` +
      `functions, which takes the whole admin API down. Add ".js".\n`,
  );
  for (const o of offenders) console.error('  ' + o);
  console.error('');
  process.exit(1);
}

console.log(
  `api import check: ${seen.size} src module(s) reachable from api/, all specifiers carry an extension.`,
);
