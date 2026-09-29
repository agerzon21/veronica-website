/**
 * A video in a client gallery must not promise playback it cannot deliver.
 *
 * THE BUG THIS PINS. Every video tile carried a 52px play triangle in its
 * middle, which is the web's one universal "press this and it plays here"
 * control. Opening it showed Drive's still frame and a Download button, and
 * that button did not work either: /api/photo pipes the bytes through sharp,
 * and sharp rejects both containers her camera writes ("Input buffer contains
 * unsupported image format" on mp4 and on mov, measured), so the desktop
 * download saved a 500 JSON body under the video's name and the phone's Save
 * to Photos sat disabled at "Preparing..." for ever. The one path that worked
 * was the large-file branch, which only fires above 40MB.
 *
 * WHAT IS ACTUALLY AT RISK. A real gallery is almost entirely photographs, and
 * they share this tile and this lightbox with the handful of clips. So most of
 * what follows is about photographs staying exactly as they were. Every
 * assertion names its subject and checks the subject exists before measuring
 * it: a check that observes none of its subject and reports green is the
 * failure this project keeps rediscovering.
 *
 * Three cases, because the two routes are different chunks and only one of
 * them has favourites: the gallery-only route at 1440x900 and at 390x844, and
 * the full portal at 1440x900.
 *
 * Run it on purpose, after a build:  node scripts/check-gallery-video.mjs
 * Screenshots land in dist/.check-shots unless SHOTS says otherwise: inside
 * dist, which .gitignore already covers, so a run leaves nothing behind.
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SHOTS = process.env.SHOTS || join(DIST, '.check-shots');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * NOT a build gate, and deliberately not wired into `npm run build`, for the
 * same reason check-portal-header.mjs is not: it needs a real browser and a
 * built dist, so it could only run after vite on a machine with Chrome, and a
 * gate that silently no-ops in CI is worse than no gate. It EXITS NON-ZERO
 * when it cannot do its job rather than skipping.
 */
const die = (m) => { console.error(`check-gallery-video: ${m}`); process.exit(1); };
if (!existsSync(join(DIST, 'index.html'))) die('no dist/index.html. Run `npm run build` first.');
if (!existsSync(CHROME)) die(`no Chrome at ${CHROME}. Set CHROME=/path/to/chrome.`);

let puppeteer;
for (const spec of [process.env.PUPPETEER, 'puppeteer-core', 'puppeteer'].filter(Boolean)) {
  try { puppeteer = (await import(spec)).default; break; } catch { /* try the next */ }
}
if (!puppeteer) die('puppeteer-core is not installed. `npm i -D puppeteer-core`, or set PUPPETEER to a path.');
mkdirSync(SHOTS, { recursive: true });

const PORT = 4479, BASE = `http://localhost:${PORT}`;
// Two real photographs, so a tile paints a picture rather than falling through
// to the placeholder card and testing the wrong thing.
const POSTER = join(ROOT, 'public/assets/photos/weddings/beach-wedding-celebration.webp');
const VIDEO_POSTER = join(ROOT, 'public/assets/photos/weddings/bridal-party-celebration-jump.webp');
if (!existsSync(POSTER) || !existsSync(VIDEO_POSTER)) die('the two poster files this uses are missing from public/assets/photos/weddings');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  // Stand-in for drive.google.com/thumbnail, which the real files point at.
  if (u.pathname.startsWith('/thumb/')) {
    r.writeHead(200, { 'Content-Type': 'image/webp' });
    return r.end(readFileSync(u.pathname.includes('vid') ? VIDEO_POSTER : POSTER));
  }
  let p = join(DIST, u.pathname === '/' ? 'index.html' : u.pathname.slice(1));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(DIST, 'index.html');
  r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
  r.end(readFileSync(p));
});
await new Promise((r) => srv.listen(PORT, r));

const DRIVE_VIEW = 'https://drive.google.com/file/d/1VidEoFiLeIdAbCdEfGhIjKlMnOpQr/view';
const photo = (i) => ({
  id: `f${i}`, name: `photo-${i}.jpg`, mimeType: 'image/jpeg', size: 6 * 1024 * 1024,
  width: 1600, height: 1067,
  thumbnailUrl: `${BASE}/thumb/f${i}.webp?sz=w800`,
  viewUrl: `${BASE}/thumb/f${i}.webp?sz=w2000`,
  downloadUrl: `/api/photo?id=f${i}&filename=photo-${i}.webp`,
  originalUrl: `/api/photo?id=f${i}`,
  driveViewUrl: `https://drive.google.com/file/d/f${i}/view`,
});
// 22MB, deliberately UNDER the lightbox's 40MB large-file threshold. That is
// the branch where the old code offered the phone's Save to Photos flow, whose
// pre-fetch is the request that 500s on a video.
const video = {
  id: 'vid1', name: 'first-dance.mov', mimeType: 'video/quicktime', size: 22 * 1024 * 1024,
  width: 1920, height: 1080,
  thumbnailUrl: `${BASE}/thumb/vid1.webp?sz=w800`,
  viewUrl: `${BASE}/thumb/vid1.webp?sz=w2000`,
  downloadUrl: '/api/photo?id=vid1&filename=first-dance.webp',
  originalUrl: '/api/photo?id=vid1',
  driveViewUrl: DRIVE_VIEW,
};
// Video third: neither first nor last, so an off-by-one in the tile loop
// cannot pass by accident.
const FILES = [photo(0), photo(1), video, photo(2), photo(3), photo(4)];
const GALLERY = {
  success: true, client_name: 'Chrisann & Rajiv',
  drive_url: 'https://drive.google.com/drive/folders/testfolder',
  rootFiles: FILES, sections: [], gallery_expires_at: '2026-11-10',
};
const CLIENT = {
  success: true, mode: 'full', client_name: 'Chrisann & Rajiv', client_email: 'c@example.com',
  drive_url: 'https://drive.google.com/drive/folders/x',
  rootFiles: FILES, sections: [], warning: undefined,
  event_date: '2026-12-12', session_type: 'wedding', contract_template_key: 'wedding',
  contract_status: 'signed', contract_signed_at: '2026-09-01', contract_body: null,
  contract_signed_pdf_url: null, contract_variables: {},
  contract_total_amount: 3000, contract_retainer_amount: 500, paid_to_date: 3000,
  charges_total: 0, payment_plan_enabled: false, installments: [], payments: [], charges: [],
  gallery_password: 'TESTPASS', gallery_enabled: true, gallery_delivered_at: '2026-09-10',
  gallery_expires_at: null, gallery_withheld: false, favorites: [],
};

/** Tiles, badges and corner controls, as the grid actually renders them. */
const GRID = () => {
  const imgs = [...document.querySelectorAll('img[alt]')].filter((i) => /^(photo-\d+\.jpg|first-dance\.mov)$/.test(i.alt));
  return imgs.map((img) => {
    const tile = img.closest('[role="group"]');
    const tb = tile ? tile.getBoundingClientRect() : null;
    const chip = tile ? [...tile.querySelectorAll('*')].find((e) => (e.textContent || '').trim() === 'Video' && e.children.length === 0) : null;
    const cb = chip ? chip.getBoundingClientRect() : null;
    // A play control is a round badge at the tile's centre. Any left behind is
    // the thing this file exists to catch.
    const roundCentred = tile ? [...tile.querySelectorAll('*')].filter((e) => {
      const b = e.getBoundingClientRect();
      if (b.width < 30 || b.width > 90 || Math.abs(b.width - b.height) > 6) return false;
      const cs = getComputedStyle(e);
      if (!/9999|50%|999px/.test(cs.borderRadius) && parseFloat(cs.borderRadius) < 20) return false;
      return Math.abs(b.x + b.width / 2 - (tb.x + tb.width / 2)) < 25 && Math.abs(b.y + b.height / 2 - (tb.y + tb.height / 2)) < 25;
    }).length : 0;
    const corner = tile ? tile.querySelector('a[aria-label]') : null;
    return {
      alt: img.alt,
      hasTile: !!tile,
      hasChip: !!chip,
      // Where the label sits inside its tile, as fractions. Bottom left is
      // (<0.5, >0.5); a play control would be (~0.5, ~0.5).
      chipAt: cb && tb ? [+((cb.x + cb.width / 2 - tb.x) / tb.width).toFixed(2), +((cb.y + cb.height / 2 - tb.y) / tb.height).toFixed(2)] : null,
      roundCentred,
      cornerHref: corner ? corner.getAttribute('href') : null,
      cornerLabel: corner ? corner.getAttribute('aria-label') : null,
      cornerTarget: corner ? corner.getAttribute('target') : null,
      cornerDownload: corner ? corner.hasAttribute('download') : null,
    };
  });
};

/** The open lightbox: its picture, its bottom bar and the video notice. */
const LIGHTBOX = () => {
  // The lightbox picture, NOT a grid thumbnail. At 1440 the tiles are still in
  // the DOM behind the overlay and are wider than any size threshold, so
  // "the big image" picked one of them and measured the wrong subject.
  const inLightbox = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.position === 'fixed' && parseInt(cs.zIndex, 10) >= 1400) return true;
    }
    return false;
  };
  const img = [...document.querySelectorAll('img')].find((i) => inLightbox(i) && i.getBoundingClientRect().width > 100);
  const bar = [...document.querySelectorAll('div')].find((d) => {
    const cs = getComputedStyle(d);
    return cs.position === 'absolute' && parseInt(cs.zIndex, 10) === 1450 && d.getBoundingClientRect().bottom > window.innerHeight - 4;
  });
  const plate = [...document.querySelectorAll('div')].find((d) => /plays on Google Drive/i.test(d.textContent || '') && d.children.length <= 4 && (d.textContent || '').length < 200);
  const cta = plate ? plate.querySelector('a[href]') : null;
  const eyebrow = plate ? [...plate.querySelectorAll('*')].find((e) => (e.textContent || '').trim() === 'Video' && e.children.length === 0) : null;
  const pb = plate ? plate.getBoundingClientRect() : null;
  return {
    open: !!img,
    src: img ? img.src : null,
    hasBar: !!bar,
    barControls: bar ? [...bar.querySelectorAll('a,button,[role="button"],[aria-expanded]')].map((e) => (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')).filter(Boolean) : null,
    hasPlate: !!plate,
    plateText: plate ? (plate.innerText || '').trim().replace(/\s+/g, ' ') : null,
    plateAt: pb ? [+((pb.x + pb.width / 2) / window.innerWidth).toFixed(2), +((pb.y + pb.height / 2) / window.innerHeight).toFixed(2)] : null,
    hasEyebrow: !!eyebrow,
    cta: cta ? { href: cta.getAttribute('href'), target: cta.getAttribute('target'), rel: cta.getAttribute('rel'), label: cta.getAttribute('aria-label'), tag: cta.tagName } : null,
  };
};

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${ok ? '' : `\n       ${d}`}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = [
  ['gallery-only 1440x900', 1440, 900, false],
  ['gallery-only 390x844', 390, 844, false],
  ['full portal 1440x900', 1440, 900, true],
];

for (const [label, width, height, fullPortal] of CASES) {
  console.log(`\n${label}:`);
  // One fresh context per case. A single shared browser leaks localStorage
  // between them, which is how an earlier harness had its second case
  // silently reuse the first case's session.
  const ctx = await b.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.setRequestInterception(true);
  page.on('request', (rq) => {
    const u = rq.url();
    if (!u.startsWith(BASE)) return void rq.abort();
    const p = new URL(u).pathname;
    if (p === '/api/portal/gallery') return void rq.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(GALLERY) });
    if (p === '/api/portal/client') return void rq.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(CLIENT) });
    // Exactly what the real endpoint does with video bytes, so this harness
    // cannot invent a working download that production does not have.
    if (p === '/api/photo' && /id=vid1/.test(u)) return void rq.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Failed to fetch photo' }) });
    if (p.startsWith('/api/')) return void rq.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    rq.continue();
  });

  await page.goto(`${BASE}${fullPortal ? '/portal' : '/portal/pass?password=TESTPASS'}`, { waitUntil: 'networkidle2' });
  if (fullPortal) {
    await page.evaluate(() => {
      const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const ins = [...document.querySelectorAll('input')];
      if (ins[0]) set(ins[0], 'c@example.com');
      if (ins[1]) set(ins[1], 'pw');
      [...document.querySelectorAll('button')].find((x) => /sign in|log in|view/i.test(x.innerText))?.click();
    });
  }
  await wait(fullPortal ? 2600 : 1800);

  const tiles = await page.evaluate(`(${GRID.toString()})()`);

  // SUBJECTS FIRST. Nothing below runs if the grid is not there.
  check('all six files rendered a tile', tiles.length === 6 && tiles.every((t) => t.hasTile), `saw ${tiles.length}: ${JSON.stringify(tiles.map((t) => t.alt))}`);
  const vid = tiles.find((t) => t.alt === 'first-dance.mov');
  const pics = tiles.filter((t) => t.alt !== 'first-dance.mov');
  check('the video is one of them', !!vid, JSON.stringify(tiles.map((t) => t.alt)));
  check('five photographs beside it', pics.length === 5, `saw ${pics.length}`);
  if (!vid || pics.length !== 5) { await page.close(); await ctx.close(); continue; }

  check('the video tile carries a Video label', vid.hasChip, JSON.stringify(vid));
  check('no photograph carries one', pics.every((t) => !t.hasChip), JSON.stringify(pics.filter((t) => t.hasChip)));
  check('the label sits bottom left, not in the centre', !!vid.chipAt && vid.chipAt[0] < 0.45 && vid.chipAt[1] > 0.55, `at ${JSON.stringify(vid.chipAt)}`);
  check('no round centred badge is left on it', vid.roundCentred === 0, `${vid.roundCentred} found`);
  check('its corner control goes to Drive, new tab, no download attribute',
    vid.cornerHref === DRIVE_VIEW && vid.cornerTarget === '_blank' && vid.cornerDownload === false,
    JSON.stringify({ href: vid.cornerHref, target: vid.cornerTarget, download: vid.cornerDownload }));
  check('and names itself', /watch/i.test(vid.cornerLabel || '') && /new tab/i.test(vid.cornerLabel || ''), String(vid.cornerLabel));
  check('the photographs keep the corner download they had',
    pics.every((t) => t.cornerHref && t.cornerHref.startsWith('/api/photo') && t.cornerDownload === true && t.cornerTarget === null),
    JSON.stringify(pics.map((t) => [t.cornerHref, t.cornerDownload, t.cornerTarget])));

  await page.evaluate(() => document.querySelector('img[alt="first-dance.mov"]').closest('[role="group"]').scrollIntoView({ block: 'center' }));
  await wait(700);
  await page.screenshot({ path: join(SHOTS, `grid-${label.replace(/\W+/g, '-')}.png`) });

  // A PHOTOGRAPH OPENS EXACTLY AS IT DID.
  await page.evaluate(() => document.querySelector('img[alt="photo-1.jpg"]').closest('[role="group"]').click());
  await wait(1500);
  const p1 = await page.evaluate(`(${LIGHTBOX.toString()})()`);
  check('a photograph opens on the photograph', p1.open && /thumb\/f1/.test(p1.src || ''), JSON.stringify({ open: p1.open, src: p1.src }));
  check('with its bottom bar', p1.hasBar, JSON.stringify(p1));
  check('whose action is still the download control', !!p1.barControls && p1.barControls.some((t) => /^download/i.test(t)), JSON.stringify(p1.barControls));
  if (fullPortal) check('and the Favourite pill beside it', !!p1.barControls && p1.barControls.some((t) => /favorite/i.test(t)), JSON.stringify(p1.barControls));
  check('and no video notice anywhere', !p1.hasPlate, String(p1.plateText));
  await page.screenshot({ path: join(SHOTS, `photo-lightbox-${label.replace(/\W+/g, '-')}.png`) });
  await page.keyboard.press('Escape');
  await wait(900);

  // THE VIDEO.
  await page.evaluate(() => document.querySelector('img[alt="first-dance.mov"]').closest('[role="group"]').click());
  await wait(1500);
  const v1 = await page.evaluate(`(${LIGHTBOX.toString()})()`);
  check('the video opens on its still frame', v1.open && /thumb\/vid1/.test(v1.src || ''), JSON.stringify({ open: v1.open, src: v1.src }));
  check('the notice is there', v1.hasPlate, JSON.stringify(v1));
  check('centred on the still, where the play button used to be', !!v1.plateAt && Math.abs(v1.plateAt[0] - 0.5) < 0.06 && Math.abs(v1.plateAt[1] - 0.5) < 0.06, JSON.stringify(v1.plateAt));
  check('it says what happens next', /plays on Google Drive/i.test(v1.plateText || '') && /save the original/i.test(v1.plateText || ''), String(v1.plateText));
  check('it carries the Video eyebrow', v1.hasEyebrow, String(v1.plateText));
  check('its action is a real link to the Drive location', !!v1.cta && v1.cta.tag === 'A' && v1.cta.href === DRIVE_VIEW, JSON.stringify(v1.cta));
  check('opening in a new tab, safely', !!v1.cta && v1.cta.target === '_blank' && /noopener/.test(v1.cta.rel || '') && /noreferrer/.test(v1.cta.rel || ''), JSON.stringify(v1.cta));
  check('with an accessible name that announces the new tab', !!v1.cta && /watch on google drive/i.test(v1.cta.label || '') && /opens in a new tab/i.test(v1.cta.label || ''), String(v1.cta && v1.cta.label));
  check('the broken download control is gone from the bar', !!v1.barControls && !v1.barControls.some((t) => /download|save to photos|preparing/i.test(t)), JSON.stringify(v1.barControls));
  if (fullPortal) check('the Favourite pill is still in the bar', !!v1.barControls && v1.barControls.some((t) => /favorite/i.test(t)), JSON.stringify(v1.barControls));
  const focus = await page.evaluate(() => {
    // The same three-part predicate LIGHTBOX() uses, length guard included.
    // Without it the first match in document order is the PAGE root (its text
    // contains the plate's), whose first a[href] is the portal header logo, so
    // this focused "Vero Photography, back to the main site" and reported green
    // about a link it had never looked at. Measured 2026-09-29.
    const plate = [...document.querySelectorAll('div')].find((d) => /plays on Google Drive/i.test(d.textContent || '') && d.children.length <= 4 && (d.textContent || '').length < 200);
    const a = plate && plate.querySelector('a[href]');
    if (!a) return { found: false };
    a.focus();
    return { found: true, focused: document.activeElement === a, tabIndex: a.tabIndex };
  });
  check('the link takes keyboard focus', focus.found && focus.focused && focus.tabIndex >= 0, JSON.stringify(focus));
  await page.screenshot({ path: join(SHOTS, `video-lightbox-${label.replace(/\W+/g, '-')}.png`) });

  check('no page errors', errs.length === 0, JSON.stringify([...new Set(errs)].slice(0, 3)));
  await page.close();
  await ctx.close();
}

await b.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed\nscreenshots in ${SHOTS}\n`);
process.exit(fail ? 1 : 0);
