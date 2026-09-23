/**
 * The WhatsApp channel, attacked rather than demonstrated.
 *
 * Three things here can hurt a real person, so they are what this pins:
 *
 *   1. THE SIGNATURE is the only thing standing between Meta's webhook and
 *      anyone who knows the URL. Whoever gets past it can write messages into
 *      a client's thread. The load-bearing cases are the REJECTIONS.
 *
 *   2. WHOSE THREAD a message lands in. On an inbound, the client is `from`.
 *      On a Coexistence echo, `from` is VERO and the client is `to`, so the
 *      obvious code files her replies into a conversation with herself and
 *      leaves the client's thread missing exactly the messages Coexistence
 *      exists to capture. That bug was in this file's first draft.
 *
 *   3. WHICH CLIENT a thread auto-links to. A wrong link puts one person's
 *      booking on another person's screen.
 *
 * Runs the SHIPPED handlers, not a retyped copy: the .ts is transpiled into a
 * mirror tree under node_modules (so `raw-body` still resolves) with exactly
 * one file replaced, api/_db.js, by an in-memory stand-in. Everything else,
 * including the signature check and the routing, is the code that deploys.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Inside node_modules so bare imports resolve upward, and so nothing lands in
// the repo. Per-pid so two runs cannot collide.
const TMP = join(ROOT, 'node_modules', `.wa-check-${process.pid}`);

const emit = (rel, src) => {
  const out = join(TMP, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, src);
};
// .ts in, .js out, at the same path: the handler's own `../_db.js` and
// `../../src/utils/phoneFromText.js` specifiers then resolve unchanged, which
// is the point of mirroring the tree rather than flattening it.
const port = (rel) =>
  emit(
    rel.replace(/\.ts$/, '.js'),
    ts.transpileModule(readFileSync(join(ROOT, rel), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  );

// The handlers log on every rejection, and most cases here ARE rejections, so
// their output would bury the results in the build log. Silenced around each
// call and restored for the verdict; a genuinely unexpected throw still
// propagates, and set WA_CHECK_VERBOSE=1 to watch them.
const real = { log: console.log, warn: console.warn, error: console.error };
const VERBOSE = !!process.env.WA_CHECK_VERBOSE;
const quiet = async (fn) => {
  if (VERBOSE) return fn();
  console.log = console.warn = console.error = () => {};
  try { return await fn(); } finally { Object.assign(console, real); }
};

let pass = 0, fail = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n.padEnd(62)} ${ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

try {
  emit('package.json', '{"type":"module"}');
  port('api/inbox/_whatsapp-webhook.ts');
  port('api/_whatsapp-send.ts');
  // The delivery module and everything it imports, so the 422/502 decision is
  // exercised in the file that actually makes it.
  for (const f of ['_reply-delivery', '_subject-strip', '_house-style', '_ig-send',
                   '_email-send', '_auto-reply', '_email-signature']) {
    port(`api/${f}.ts`);
  }
  port('src/utils/phoneFromText.ts');

  // ── the database, in memory ────────────────────────────────────────────
  // Four statements exist in the handler; each is matched by a fragment of
  // its own text, so a rewritten query fails loudly here instead of silently
  // matching the wrong branch.
  emit(
    'api/_db.js',
    `
export const db = {
  conversations: new Map(), // 'platform|external_user_id' -> row
  messages: [],
  portals: [],
  seq: 0,
  reset() { this.conversations.clear(); this.messages = []; this.portals = []; this.seq = 0; },
};
const digits = (s) => String(s ?? '').replace(/\\D/g, '');
export function getDb() {
  return async function sql(strings, ...vals) {
    const q = strings.join('?').replace(/\\s+/g, ' ');
    if (q.includes('INSERT INTO conversations')) {
      // 'whatsapp' is a LITERAL in the statement, so it is not among the
      // interpolated values; only the id and the name are.
      const [extId, name] = vals;
      const key = 'whatsapp|' + extId;
      let row = db.conversations.get(key);
      if (!row) {
        row = { id: 'c' + ++db.seq, platform: 'whatsapp', external_user_id: extId,
                contact_name: name ?? null, linked_client_portal_id: null };
        db.conversations.set(key, row);
      } else if (row.contact_name == null) {
        row.contact_name = name ?? null;
      }
      return [{ id: row.id, linked_client_portal_id: row.linked_client_portal_id }];
    }
    // ── api/_reply-delivery.ts asks these three ──────────────────────
    if (q.includes('SELECT external_user_id, platform')) {
      const [id] = vals;
      for (const r of db.conversations.values()) {
        if (r.id === id) return [{ external_user_id: r.external_user_id, platform: r.platform }];
      }
      return [];
    }
    if (q.includes('SELECT body FROM messages')) {
      const [conversationId] = vals;
      return db.messages
        .filter((m) => m.conversation_id === conversationId && m.direction === 'outbound')
        .map((m) => ({ body: m.body }));
    }
    if (q.startsWith('DELETE FROM messages')) {
      const [conversationId] = vals;
      db.messages = db.messages.filter((m) => !(m.conversation_id === conversationId && m.status === 'draft'));
      return [];
    }
    if (q.includes('FROM client_portals')) {
      const wanted = vals.map(digits);
      return db.portals
        .filter((p) => p.client_phone && wanted.includes(digits(p.client_phone)))
        .slice(0, 2)
        .map((p) => ({ id: p.id }));
    }
    if (q.includes('UPDATE conversations')) {
      const [portalId, convoId] = vals;
      for (const r of db.conversations.values()) {
        if (r.id === convoId && r.linked_client_portal_id == null) r.linked_client_portal_id = portalId;
      }
      return [];
    }
    if (q.includes('INSERT INTO messages')) {
      // TWO writers, and their literals differ. The webhook interpolates the
      // direction and sender because an echo is outbound; the reply path has
      // them as literals and interpolates sent_via instead. Told apart by the
      // column list, not by the value count, so a future column cannot make
      // one silently parse as the other.
      const viaColumn = q.includes('sent_via');
      const [conversation_id, direction, sender, body, external_message_id, sent_at] = viaColumn
        ? [vals[0], 'outbound', 'human', vals[1], vals[2], new Date().toISOString()]
        : vals;
      if (db.messages.some((m) => m.external_message_id === external_message_id)) return [];
      const row = { id: 'm' + ++db.seq, conversation_id, direction, sender,
                    channel: 'whatsapp', body, external_message_id, sent_at };
      db.messages.push(row);
      return [{ id: row.id }];
    }
    throw new Error('check-whatsapp: unrecognised query: ' + q.slice(0, 90));
  };
}
`,
  );

  const { default: webhook, config } = await import(join(TMP, 'api/inbox/_whatsapp-webhook.js'));
  const { sendWhatsAppTextMessage } = await import(join(TMP, 'api/_whatsapp-send.js'));
  const { db } = await import(join(TMP, 'api/_db.js'));

  const SECRET = 'appsecret_' + 'a'.repeat(22);
  const OTHER = 'appsecret_' + 'b'.repeat(22);
  const VERIFY = 'vero-verify-token';
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY;

  // A request whose body is a real stream, because the handler reads raw
  // bytes with raw-body and a plain object would not exercise that at all.
  const { Readable } = await import('node:stream');
  const post = (bodyStr, sig) => {
    const req = Readable.from([Buffer.from(bodyStr)]);
    req.method = 'POST';
    req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(bodyStr)) };
    if (sig !== null) req.headers['x-hub-signature-256'] = sig;
    req.query = {};
    return req;
  };
  const sign = (s, secret = SECRET) => 'sha256=' + createHmac('sha256', secret).update(Buffer.from(s)).digest('hex');
  const resStub = () => {
    const r = { code: 0, body: null, headers: {}, sent: null };
    r.status = (c) => ((r.code = c), r);
    r.json = (b) => ((r.body = b), r);
    r.send = (b) => ((r.sent = b), r);
    r.setHeader = (k, v) => ((r.headers[k] = v), r);
    return r;
  };
  const fire = async (bodyObj, sig = undefined) => {
    const s = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
    const res = resStub();
    await quiet(() => webhook(post(s, sig === undefined ? sign(s) : sig), res));
    return res;
  };

  const wrap = (value, field = 'messages') => ({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba1', changes: [{ field, value: { messaging_product: 'whatsapp', ...value } }] }],
  });

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nTHE SIGNATURE refuses what it must:');
  db.reset();
  check('no X-Hub-Signature-256 header at all', (await fire(wrap({}), null)).code, 401);
  check('a signature made with the WRONG app secret', (await fire(wrap({}), sign(JSON.stringify(wrap({})), OTHER))).code, 401);
  {
    const good = wrap({ messages: [{ id: 'w1', from: '15705550123', type: 'text', text: { body: 'hi' } }] });
    const s = JSON.stringify(good);
    const sig = sign(s);
    const tampered = s.replace('15705550123', '15705559999');
    const res = resStub();
    await quiet(() => webhook(post(tampered, sig), res));
    check('a TAMPERED body under a valid signature', res.code, 401);
    check('and it wrote nothing', db.messages.length, 0);
  }
  // timingSafeEqual THROWS on a length mismatch; a 500 here would make Meta
  // retry an attack forever instead of refusing it.
  check('a TRUNCATED signature is a 401, not a 500', (await fire(wrap({}), 'sha256=abc')).code, 401);
  check('a signature of the wrong SCHEME', (await fire(wrap({}), 'sha1=' + 'f'.repeat(40))).code, 401);
  {
    const saved = process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_APP_SECRET;
    check('no secret configured refuses rather than accepting', (await fire(wrap({}))).code, 500);
    process.env.WHATSAPP_APP_SECRET = saved;
  }
  check('valid signature, malformed JSON', (await fire('{not json')).code, 400);
  check("an object that is not Meta's whatsapp one", (await fire({ object: 'page', entry: [] })).code, 200);
  check('a correctly signed payload', (await fire(wrap({}))).code, 200);
  check('raw body parsing is disabled for this route', config?.api?.bodyParser, false);

  console.log('\nTHE GET HANDSHAKE:');
  const get = async (q) => {
    const res = resStub();
    await quiet(() => webhook({ method: 'GET', query: q, headers: {} }, res));
    return res;
  };
  {
    const r = await get({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '9471' });
    check('the right token echoes the challenge', r.code, 200);
    check('as PLAINTEXT, not JSON', [r.sent, r.headers['Content-Type']], ['9471', 'text/plain']);
  }
  check('the wrong token', (await get({ 'hub.mode': 'subscribe', 'hub.verify_token': 'guess', 'hub.challenge': '1' })).code, 403);
  check('no token', (await get({ 'hub.mode': 'subscribe', 'hub.challenge': '1' })).code, 403);
  check('an unknown method', (await (async () => { const r = resStub(); await quiet(() => webhook({ method: 'DELETE', headers: {}, query: {} }, r)); return r; })()).code, 405);

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nWHOSE THREAD a message lands in:');
  db.reset();
  await fire(wrap({
    contacts: [{ wa_id: '15705550123', profile: { name: 'Pagiel' } }],
    messages: [{ id: 'w1', from: '15705550123', type: 'text', text: { body: 'Hi, is Saturday open?' } }],
  }));
  check('an inbound opens one thread', db.conversations.size, 1);
  check('keyed on the CLIENT number', [...db.conversations.keys()], ['whatsapp|15705550123']);
  check("carrying the client's profile name", [...db.conversations.values()][0].contact_name, 'Pagiel');
  check('stored inbound, from the contact', [db.messages[0].direction, db.messages[0].sender], ['inbound', 'contact']);
  check('with the text intact', db.messages[0].body, 'Hi, is Saturday open?');

  // THE BUG. Vero answers from her own phone; Meta echoes it with from=HER.
  const VERO = '15705559000';
  await fire(wrap(
    {
      contacts: [{ wa_id: '15705550123', profile: { name: 'Pagiel' } }],
      message_echoes: [{ id: 'w2', from: VERO, to: '15705550123', type: 'text', text: { body: 'Saturday works.' } }],
    },
    'smb_message_echoes',
  ));
  check('her reply does NOT open a thread with herself', db.conversations.has('whatsapp|' + VERO), false);
  check('still exactly one thread', db.conversations.size, 1);
  check("it lands in the CLIENT's thread", db.messages[1].conversation_id, db.messages[0].conversation_id);
  check('recorded as outbound from a human', [db.messages[1].direction, db.messages[1].sender], ['outbound', 'human']);

  // An echo to someone with no thread yet still belongs to THAT person.
  await fire(wrap(
    { message_echoes: [{ id: 'w3', from: VERO, to: '13055551212', type: 'text', text: { body: 'Sending your gallery now.' } }] },
    'smb_message_echoes',
  ));
  check('an echo to a new number opens THEIR thread', [...db.conversations.keys()].includes('whatsapp|13055551212'), true);
  check('and not one keyed on Vero', db.conversations.has('whatsapp|' + VERO), false);

  // A contacts block names ONE person. It must not label a different thread.
  db.reset();
  await fire(wrap(
    {
      contacts: [{ wa_id: '15705550123', profile: { name: 'Pagiel' } }],
      message_echoes: [{ id: 'w4', from: VERO, to: '13055551212', type: 'text', text: { body: 'hello' } }],
    },
    'smb_message_echoes',
  ));
  check("a stray contacts block does not name someone else's thread",
    db.conversations.get('whatsapp|13055551212').contact_name, null);

  console.log('\nWHAT IT STORES:');
  db.reset();
  await fire(wrap({ messages: [{ id: 'w5', from: '15705550123', type: 'text', text: { body: 'first' } }] }));
  await fire(wrap({ messages: [{ id: 'w5', from: '15705550123', type: 'text', text: { body: 'first' } }] }));
  check("Meta's retry of the same message id writes one row", db.messages.length, 1);
  await fire(wrap({ messages: [{ id: 'w6', from: '15705550123', type: 'image', image: { id: 'i1' } }] }));
  check('a photo becomes a placeholder, never a gap', db.messages[1].body, '[image]');
  await fire(wrap({ messages: [{ id: 'w7', from: '15705550123', type: 'audio', audio: { id: 'a1' } }] }));
  check('so does a voice note', db.messages[2].body, '[audio]');
  {
    const before = db.messages.length;
    await fire(wrap({ statuses: [{ id: 'w5', status: 'delivered' }] }));
    check('a delivery receipt writes no message', db.messages.length, before);
  }
  {
    const before = db.messages.length;
    await fire(wrap({ messages: [{ id: 'w8', from: '15705550123', type: 'text', text: { body: '   ' } }] }));
    check('an empty text writes nothing', db.messages.length, before);
    await fire(wrap({ messages: [{ from: '15705550123', type: 'text', text: { body: 'no id' } }] }));
    check('a message with no id writes nothing', db.messages.length, before);
  }

  console.log('\nWHICH CLIENT it links to:');
  const link = async (portals, msg = { id: 'k' + Math.random(), from: '15705550123', type: 'text', text: { body: 'hi' } }) => {
    db.reset();
    db.portals = portals;
    await fire(wrap({ messages: [msg] }));
    return [...db.conversations.values()][0]?.linked_client_portal_id ?? null;
  };
  check('exactly one client with that number', await link([{ id: 'p1', client_phone: '+1 (570) 555-0123' }]), 'p1');
  check('a number stored without punctuation', await link([{ id: 'p1', client_phone: '5705550123' }]), 'p1');
  check('TWO clients sharing a number links neither',
    await link([{ id: 'p1', client_phone: '+15705550123' }, { id: 'p2', client_phone: '570-555-0123' }]), null);
  check('nobody with that number', await link([{ id: 'p1', client_phone: '+13055551212' }]), null);
  check('a client with no number on file', await link([{ id: 'p1', client_phone: null }]), null);
  {
    // A link a PERSON made is never second-guessed by a number match.
    db.reset();
    db.portals = [{ id: 'p1', client_phone: '+15705550123' }];
    db.conversations.set('whatsapp|15705550123',
      { id: 'c99', platform: 'whatsapp', external_user_id: '15705550123', contact_name: null, linked_client_portal_id: 'p_manual' });
    await fire(wrap({ messages: [{ id: 'w9', from: '15705550123', type: 'text', text: { body: 'hi' } }] }));
    check('an existing link is left alone', db.conversations.get('whatsapp|15705550123').linked_client_portal_id, 'p_manual');
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nSENDING, and what it does with a refusal:');
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '999';
  let seen = null;
  const stubFetch = (status, payload) => {
    globalThis.fetch = async (url, init) => {
      seen = { url, init, body: JSON.parse(init.body) };
      return { ok: status < 400, status, text: async () => JSON.stringify(payload), json: async () => payload };
    };
  };
  const metaErr = (code, message) => ({ error: { message, code, type: 'OAuthException' } });

  stubFetch(200, { messages: [{ id: 'wamid.OUT1' }] });
  {
    const r = await quiet(() => sendWhatsAppTextMessage({ recipientWaId: '+1 (570) 555-0123', text: 'On my way' }));
    check('a send succeeds and keeps Meta’s message id', [r.ok, r.externalMessageId], [true, 'wamid.OUT1']);
    check('addressed to digits only, no plus', seen.body.to, '15705550123');
    check('to the number id from the environment, not "me"', seen.url.endsWith('/999/messages'), true);
    check('the token rides in the header, not the URL', [seen.url.includes('tok'), seen.init.headers.Authorization], [false, 'Bearer tok']);
    check('link previews off, so a portal link is not a card', seen.body.text.preview_url, false);
    check('declared as a whatsapp text', [seen.body.messaging_product, seen.body.type], ['whatsapp', 'text']);
  }
  {
    stubFetch(400, metaErr(131047, 'Message failed to send because more than 24 hours have passed'));
    const r = await quiet(() => sendWhatsAppTextMessage({ recipientWaId: '15705550123', text: 'hi' }));
    check('outside the 24-hour window is reported as such', [r.ok, r.metaCode], [false, 131047]);
    check('in a sentence a person can act on', /24 hours/.test(r.error) && /closed/.test(r.error), true);
  }
  {
    stubFetch(400, metaErr(131026, 'Message undeliverable'));
    const r = await quiet(() => sendWhatsAppTextMessage({ recipientWaId: '13055551212', text: 'hi' }));
    check('a number not on WhatsApp is reported as such', [r.ok, r.metaCode], [false, 131026]);
    check('and says so plainly', /cannot receive WhatsApp/.test(r.error), true);
  }
  {
    stubFetch(500, { error: { message: 'Internal', code: 1 } });
    const r = await quiet(() => sendWhatsAppTextMessage({ recipientWaId: '15705550123', text: 'hi' }));
    check('an ordinary failure is not dressed up', [r.ok, r.statusCode, r.error], [false, 500, 'Internal']);
  }
  {
    globalThis.fetch = async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); };
    const r = await quiet(() => sendWhatsAppTextMessage({ recipientWaId: '15705550123', text: 'hi' }));
    check('a hang returns rather than throwing', [r.ok, /timed out/.test(r.error)], [false, true]);
  }
  {
    stubFetch(200, { messages: [{ id: 'x' }] });
    const saved = process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const r = await quiet(() => sendWhatsAppTextMessage({ recipientWaId: '15705550123', text: 'hi' }));
    check('an unconfigured number id refuses before sending', [r.ok, r.error], [false, 'WHATSAPP_PHONE_NUMBER_ID env var missing']);
    process.env.WHATSAPP_PHONE_NUMBER_ID = saved;
  }
  {
    const r = await quiet(() => sendWhatsAppTextMessage({ recipientWaId: 'nonsense', text: 'hi' }));
    check('a recipient that is not a number refuses locally', [r.ok, /not a sendable/i.test(r.error)], [false, true]);
  }

  // ─────────────────────────────────────────────────────────────────────
  // A refusal the panel can explain vs one it should retry. Two of Meta's
  // failures are permanent facts about the thread, and a 502 on those puts a
  // retry button in front of something that will never work.
  console.log('\nREPLYING FROM THE INBOX:');
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_stub';
  const { deliverReply } = await import(join(TMP, 'api/_reply-delivery.js'));
  const { getDb } = await import(join(TMP, 'api/_db.js'));
  const sql = getDb();

  const thread = async () => {
    db.reset();
    await fire(wrap({ messages: [{ id: 'in1', from: '15705550123', type: 'text', text: { body: 'hi' } }] }));
    return [...db.conversations.values()][0].id;
  };

  {
    stubFetch(200, { messages: [{ id: 'wamid.SENT' }] });
    const id = await thread();
    const r = await quiet(() => deliverReply(sql, id, 'Booked for Saturday.', { via: 'manual' }));
    check('a reply is accepted', [r.ok, r.status], [true, 200]);
    check('and recorded on the thread as outbound', db.messages.at(-1).direction, 'outbound');
    check('carrying Meta\u2019s id', db.messages.at(-1).external_message_id, 'wamid.SENT');
    check('on the whatsapp channel', db.messages.at(-1).channel, 'whatsapp');
  }
  {
    stubFetch(200, { messages: [{ id: 'wamid.DUP' }] });
    const id = await thread();
    await quiet(() => deliverReply(sql, id, 'Same words', { via: 'manual' }));
    const before = db.messages.length;
    const r = await quiet(() => deliverReply(sql, id, 'Same words', { via: 'manual' }));
    check('a double-tap is refused, not sent twice', [r.ok, r.status, r.error], [false, 409, 'duplicate']);
    check('and nothing was written', db.messages.length, before);
  }
  {
    stubFetch(400, metaErr(131047, 'more than 24 hours have passed'));
    const id = await thread();
    const before = db.messages.length;
    const r = await quiet(() => deliverReply(sql, id, 'Hello again', { via: 'manual' }));
    check('a closed 24-hour window is 422, not a retryable 502', [r.ok, r.status], [false, 422]);
    check('and nothing is recorded as sent', db.messages.length, before);
  }
  {
    stubFetch(400, metaErr(131026, 'undeliverable'));
    const id = await thread();
    const r = await quiet(() => deliverReply(sql, id, 'Hello', { via: 'manual' }));
    check('a number not on WhatsApp is 422 too', r.status, 422);
  }
  {
    stubFetch(500, { error: { message: 'Internal', code: 1 } });
    const id = await thread();
    const r = await quiet(() => deliverReply(sql, id, 'Hello', { via: 'manual' }));
    check('an ordinary Meta failure stays a 502', r.status, 502);
  }
  {
    // The house rule Vero cares about most, on a channel that did not exist
    // when the rule was written.
    stubFetch(200, { messages: [{ id: 'wamid.DASH' }] });
    const id = await thread();
    await quiet(() => deliverReply(sql, id, 'Saturday \u2014 as discussed', { via: 'manual' }));
    check('no long dash reaches a WhatsApp client', /[\u2012-\u2015\u2212]/.test(seen.body.text.body), false);
  }
  {
    const id = await thread();
    const r = await quiet(() => deliverReply(sql, id, 'x'.repeat(4097), { via: 'manual' }));
    check('a body past WhatsApp\u2019s 4096 cap is refused before sending', [r.ok, r.status], [false, 400]);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail) process.exit(1);
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
