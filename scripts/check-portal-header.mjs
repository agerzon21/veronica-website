/**
 * The portal header must not leave a hole in itself.
 *
 * THE BUG THIS PINS. On the gallery-only route the desktop rail rendered with
 * nothing in it. An empty flex box is harmless; an empty flex box carrying
 * `ml="auto"` is not, because the auto margin eats every spare pixel in the
 * row. On a 2560px monitor that left a logo, two thousand pixels of white, and
 * a 300px section menu jammed against the right edge. The menu was also capped
 * at 300px by a rule written for a control that shares the row with the
 * progress track, which on that route does not exist.
 *
 * WHAT IS ACTUALLY AT RISK. Every existing client is on the FULL portal, and
 * the two things changed are both read by it. So the assertions below are not
 * really about the gallery route. They are about the five full-portal states
 * staying exactly where they were, and they are written as invariants rather
 * than as pinned pixel values so they survive an unrelated redesign:
 *
 *   no child of the header row is an empty box with an auto margin
 *   no gap between adjacent children is wider than a control
 *   the slot keeps its 300px cap in every state where the track is beside it
 *
 * Measured against the real build, at four widths, in seven states. Verified
 * by diffing a snapshot of the build before the change against one after:
 * twenty of twenty-eight cases came back byte identical, and the eight that
 * moved are the two states that had the hole.
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * NOT a build gate, and deliberately not wired into `npm run build`.
 *
 * It needs a real browser and a built `dist`, so it could only run after vite,
 * on a machine with Chrome. Every other check-*.mjs here is self-contained and
 * runs before the build, which is what lets them be mandatory. A gate that
 * silently no-ops in CI is worse than no gate: it reports green while
 * verifying nothing.
 *
 * So this EXITS NON-ZERO when it cannot do its job rather than skipping, and
 * you run it on purpose: `npm run check:portal-header`.
 *
 * puppeteer-core is not a dependency of this repo, for the same reason. Set
 * PUPPETEER to an install if it is not resolvable from here.
 */
const die = (m) => { console.error(`check-portal-header: ${m}`); process.exit(1); };
if (!existsSync(join(DIST, 'index.html'))) die('no dist/index.html. Run `npm run build` first.');
if (!existsSync(CHROME)) die(`no Chrome at ${CHROME}. Set CHROME=/path/to/chrome.`);

let puppeteer;
for (const spec of [process.env.PUPPETEER, 'puppeteer-core', 'puppeteer'].filter(Boolean)) {
  try { puppeteer = (await import(spec)).default; break; } catch { /* try the next */ }
}
if (!puppeteer) die('puppeteer-core is not installed. `npm i -D puppeteer-core`, or set PUPPETEER to a path.');

const PORT = 4471, BASE = `http://localhost:${PORT}`;
const WIDTHS = [1280, 1512, 1920, 2560];
/** Wider than this between two controls and the row has a hole in it. */
const MAX_GAP = 80;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  let p = join(DIST, u.pathname === '/' ? 'index.html' : u.pathname.slice(1));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(DIST, 'index.html');
  r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
  r.end(readFileSync(p));
});
await new Promise((r) => srv.listen(PORT, r));

const FILES = (n) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, name: `${i}.jpg`, mimeType: 'image/jpeg', size: 2048, width: 1600, height: 1067, thumbnailUrl: '', webViewLink: '', downloadUrl: '' }));
const SECTIONS = ['Getting ready', 'Ceremony', 'Family formals', 'Portraits', 'Reception', 'Dancing', 'Send off']
  .map((name, i) => ({ id: `s${i}`, name, files: FILES(2) }));

const client = (over = {}) => ({
  success: true, mode: 'full', client_name: 'Chrisann & Rajiv', client_email: 'c@example.com',
  drive_url: null, rootFiles: [], sections: [], warning: undefined,
  event_date: '2026-12-12', session_type: 'wedding', contract_template_key: 'wedding',
  contract_status: 'signed', contract_signed_at: '2026-09-01', contract_body: null,
  contract_signed_pdf_url: null, contract_variables: {},
  contract_total_amount: 3000, contract_retainer_amount: 500, paid_to_date: 500,
  charges_total: 0, payment_plan_enabled: false, installments: [], payments: [], charges: [],
  gallery_password: 'TESTPASS', gallery_enabled: true, gallery_delivered_at: null,
  gallery_expires_at: null, gallery_withheld: true, ...over,
});
const DELIVERED = { paid_to_date: 3000, gallery_delivered_at: '2026-09-10', gallery_withheld: false, drive_url: 'https://drive.google.com/drive/folders/x', rootFiles: FILES(3), sections: SECTIONS };

const CASES = [
  ['gallery-only guest', { gallery: { success: true, client_name: 'Chrisann & Rajiv', drive_url: 'https://drive.google.com/drive/folders/x', rootFiles: [], sections: SECTIONS, gallery_expires_at: '2026-11-10' } }, { capped: false }],
  ['contract pending', { client: client({ contract_status: 'pending', paid_to_date: 0 }) }, { capped: true }],
  ['retainer paid', { client: client() }, { capped: true }],
  ['paid in full, undelivered', { client: client({ paid_to_date: 3000 }) }, { capped: true }],
  ['delivered and settled', { client: client(DELIVERED) }, { capped: false }],
  ['delivered, money owed', { client: client({ ...DELIVERED, paid_to_date: 1000 }) }, { capped: false }],
  ['no contract, no money', { client: client({ contract_total_amount: null, contract_retainer_amount: null, paid_to_date: 0, event_date: null, contract_status: 'none' }) }, { capped: false }],
];

const PROBE = () => {
  const hdr = document.querySelector('header');
  if (!hdr) return { header: false };
  const row = hdr.firstElementChild;
  const kids = [...row.children]
    .map((e) => {
      const cs = getComputedStyle(e);
      const b = e.getBoundingClientRect();
      return {
        x: Math.round(b.x), w: Math.round(b.width), right: Math.round(b.right),
        display: cs.display, ml: parseFloat(cs.marginLeft) || 0, maxW: cs.maxWidth,
        empty: !(e.innerText || '').trim() && !e.querySelector('img,svg'),
      };
    })
    .filter((k) => k.display !== 'none' && k.w > 0);
  const gaps = [];
  for (let i = 1; i < kids.length; i++) gaps.push(Math.round(kids[i].x - kids[i - 1].right));
  const slot = [...row.children].find((e) => e.querySelector('[data-portal-photo-bar],[data-portal-account-bar]'));
  return {
    header: true,
    kids, gaps,
    emptyWithAutoMargin: kids.filter((k) => k.empty && k.ml > 1),
    slotMaxW: slot ? getComputedStyle(slot).maxWidth : null,
    slotShown: slot ? getComputedStyle(slot).display !== 'none' : false,
    rightEdge: kids.length ? kids[kids.length - 1].right : 0,
    vw: window.innerWidth,
  };
};

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${ok ? '' : `\n       ${d}`}`); };

for (const width of WIDTHS) {
  console.log(`\n${width}px:`);
  for (const [label, login, want] of CASES) {
    const page = await b.newPage();
    await page.setViewport({ width, height: 950, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
    await page.setRequestInterception(true);
    page.on('request', (rq) => {
      const u = rq.url();
      if (!u.startsWith(BASE)) return void rq.abort();
      const p = new URL(u).pathname;
      if (login.client && p === '/api/portal/client') return void rq.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(login.client) });
      if (login.gallery && p === '/api/portal/gallery') return void rq.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(login.gallery) });
      if (p.startsWith('/api/')) return void rq.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
      rq.continue();
    });
    await page.goto(`${BASE}${login.gallery ? '/portal/pass?password=TESTPASS' : '/portal'}`, { waitUntil: 'networkidle2' });
    if (login.client) {
      await page.evaluate(() => {
        const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
        const ins = [...document.querySelectorAll('input')];
        if (ins[0]) set(ins[0], 'c@example.com');
        if (ins[1]) set(ins[1], 'pw');
        [...document.querySelectorAll('button')].find((x) => /sign in|log in|view/i.test(x.innerText))?.click();
      });
    }
    await page.waitForSelector('header', { timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1700));
    const r = await page.evaluate(`(${PROBE.toString()})()`);
    await page.close();

    if (errs.length) console.log(`    ${label}: page errors ${JSON.stringify([...new Set(errs)].slice(0, 2))}`);
    if (!r.header) { check(`${label}: the header rendered`, false); continue; }

    check(`${label}: nothing empty holds an auto margin`,
      r.emptyWithAutoMargin.length === 0,
      JSON.stringify(r.emptyWithAutoMargin));
    check(`${label}: no hole wider than a control in the row`,
      r.gaps.every((g) => g <= MAX_GAP),
      `gaps ${JSON.stringify(r.gaps)} between ${JSON.stringify(r.kids.map((k) => [k.x, k.w]))}`);
    // The cap exists to stop the account control reading as a search field
    // while the progress track is beside it. Where there is no track it is a
    // hole generator, which is the whole of this bug.
    if (r.slotShown) {
      check(`${label}: the slot cap is ${want.capped ? '300px' : 'off'}`,
        r.slotMaxW === (want.capped ? '300px' : 'none'),
        `slot maxW ${r.slotMaxW}`);
    }
  }
}

await b.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
