/**
 * The webhook signature check, attacked rather than demonstrated.
 *
 * This is the security boundary of the whole payment system: anything that
 * gets past it can insert money into the ledger. So the load-bearing cases are
 * the REJECTIONS, and a suite that only proves a valid signature passes proves
 * almost nothing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Copied to a temp file so Node can load the .ts: api/_stripe.ts imports
// nothing, but the .js extensions Vercel's ESM requires do not resolve when
// Node runs a .ts directly. Copying keeps the SHIPPED source under test rather
// than a retyped copy of it.
const TMP = join(tmpdir(), `_stripe.check.${process.pid}.ts`);
writeFileSync(TMP, readFileSync(join(ROOT, 'api', '_stripe.ts'), 'utf8'));
const { verifyStripeEvent } = await import(TMP);

const SECRET = 'whsec_test_' + 'a'.repeat(32);
const OTHER  = 'whsec_test_' + 'b'.repeat(32);
const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed',
  data: { object: { id: 'cs_1', payment_intent: 'pi_1', metadata: { portal_id: 'p1' } } } });

const sign = (payload, secret, t = Math.floor(Date.now()/1000)) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;

let pass=0, fail=0;
const check=(n,got,want)=>{const g=got===want;g?pass++:fail++;
  console.log(`  ${g?'ok  ':'FAIL'} ${n.padEnd(58)} ${got}`)};

console.log('\nACCEPTS what it should:');
check('a valid signature', verifyStripeEvent(body, sign(body, SECRET), SECRET).ok, true);
{
  const r = verifyStripeEvent(body, sign(body, SECRET), SECRET);
  check('and parses the event', r.ok && r.event.type, 'checkout.session.completed');
}
{
  // Secret rotation: several v1 values, only the second one valid.
  const t = Math.floor(Date.now()/1000);
  const good = createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
  const bad  = createHmac('sha256', OTHER ).update(`${t}.${body}`).digest('hex');
  check('any matching v1 during a secret rotation', verifyStripeEvent(body, `t=${t},v1=${bad},v1=${good}`, SECRET).ok, true);
}

console.log('\nREJECTS what it must:');
const reasons = {};
const rej = (n, raw, sig, secret=SECRET) => {
  const r = verifyStripeEvent(raw, sig, secret);
  reasons[n] = r.ok ? '(ACCEPTED)' : r.reason;
  check(n, r.ok, false);
};
rej('a signature from the WRONG secret',      body, sign(body, OTHER));
rej('a TAMPERED body under a valid signature', body.replace('p1','p_attacker'), sign(body, SECRET));
rej('a REPLAY from 10 minutes ago',            body, sign(body, SECRET, Math.floor(Date.now()/1000)-600));
rej('a future timestamp well outside tolerance', body, sign(body, SECRET, Math.floor(Date.now()/1000)+900));
rej('a missing signature header',               body, null);
rej('a malformed header',                       body, 'garbage');
rej('a header with a timestamp but no v1',      body, 't=123');
rej('an empty v1',                              body, 't=' + Math.floor(Date.now()/1000) + ',v1=');
rej('a truncated signature',                    body, sign(body, SECRET).slice(0, -10));
{
  // Called DIRECTLY, not through rej(): that helper has `secret = SECRET` as a
  // default parameter, so passing undefined to it triggers the default and
  // hands the real secret back. The case silently never ran and reported a
  // pass. Assert the env var is genuinely unset first, so this cannot quietly
  // start testing nothing again.
  const envUnset = process.env.STRIPE_WEBHOOK_SECRET === undefined;
  check('the env var really is unset (so this case can fail)', envUnset, true);
  const r = verifyStripeEvent(body, sign(body, SECRET));
  reasons['no secret configured'] = r.ok ? '(ACCEPTED)' : r.reason;
  check('no secret configured', r.ok, false);
}
{
  // Verified bytes that are not JSON must not throw.
  const notJson = 'this is not json';
  const r = verifyStripeEvent(notJson, sign(notJson, SECRET), SECRET);
  reasons['verified bytes that are not JSON'] = r.ok ? '(ACCEPTED)' : r.reason;
  check('verified bytes that are not JSON', r.ok, false);
}
{
  // A re-stringified body must fail, which is WHY the raw body is required.
  const reparsed = JSON.stringify(JSON.parse(body.replace('"id": "evt_1"','"id":"evt_1"')));
  const spaced = JSON.stringify(JSON.parse(body), null, 2);
  const r = verifyStripeEvent(spaced, sign(body, SECRET), SECRET);
  check('a re-formatted body (proves raw bytes are required)', r.ok, false);
  void reparsed;
}

console.log('\nwhy each rejection happened:');
for (const [k,v] of Object.entries(reasons)) console.log(`  ${k.padEnd(48)} ${v}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
