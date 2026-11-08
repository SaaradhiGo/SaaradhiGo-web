// Gate for the signed-in areas (owner, 2026-11-08; design/signed-in-2026-11-08).
// Fails on, for every rider and driver page:
//   frame      a driver page without the sidebar and DRIVER badge, or a rider
//              page with either
//   sideways   horizontal scroll at 360, 390, 768, 1024 or 1440 wide
//   type       a size other than 14/16/20/28/40 (22 and 32 only on phone
//              headings), a weight other than 400/600, text under 14px
//   dates      a trip or payout row without a date and a time
//   visual     more than 3% of pixels off screenshots/<page>.png at 1440x900,
//              the map, logo and value regions masked (diffs in DIFFS)
//   sample     (separately) a design example name, plate or place in src/ or
//              the browser bundles; with QA=1, visible on QA as the test accounts
//   states     (8 Nov) a page still loading after 10 s, or showing "…"/"•••":
//              a brand-new driver's six pages and a new rider's trips and
//              account must show ₹0.00 or their empty message; an expired
//              session must land on Log in with a message; with the earnings
//              API failing, the error and Try again must show, and Try again
//              must bring the numbers back
//
// CI: SITE=http://localhost:3100 WEB_SESSION_SECRET=... npm run check-areas
//   (the API is answered from scripts/fixtures/areas.mjs)
// QA: QA=1 SITE=https://www.qa.saaradhigo.com SEC_FILE=... node scripts/check-areas.mjs
//   (signs in with the private token file; skips the visual diff)
import { chromium } from 'playwright-core';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SAMPLE, fixture } from './fixtures/areas.mjs';
import { emptyAccount } from './fixtures/empty-account.mjs';

const SITE = process.env.SITE || 'http://localhost:3100';
const QA = process.env.QA === '1';
const REF = path.resolve('../../design/signed-in-2026-11-08/screenshots');
const DIFFS = process.env.DIFFS || 'areas-diff';
const SHOTS = process.env.SHOTS || null;
const MAX_DIFF = 0.03;
// Screens where a part of the design is hidden on purpose, so everything below
// it moves up. Each allowance names what is missing and why (AUDIT 29).
const ALLOW = {
  'driver-web-earnings': [0.06, 'Withdraw button and bank line (no web money flow tonight) and Tips (none exist, D5) are hidden'],
  'driver-web-payouts': [0.05, 'Withdraw button and the Paid to bank card are hidden (no web money flow tonight)'],
};
const SIZES = new Set([14, 16, 20, 22, 28, 32, 40]);
const PHONE_ONLY = new Set([22, 32]);
const WIDTHS = [[360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]];
// English everywhere; the other languages at the phone and desktop extremes,
// where longer strings break a layout first (no visual diff: the reference is English).
const LANGS = (process.env.AREA_LANGS || 'en,te,hi,es').split(',');
const LANG_WIDTHS = [[360, 740], [1440, 900]];

const RIDER = [
  ['/ride', 'rider-web-home'],
  [QA ? '/ride/choose?from=17.4504,78.3810&to=17.4344,78.3866&tl=Inorbit%20Mall%2C%20Madhapur'
    : '/ride/choose?from=17.4504,78.3810&to=17.2403,78.4294&tl=International%20Airport', 'rider-web-choose'],
  ['/ride/trip/201', 'rider-web-trip'],
  ['/trips', 'rider-web-trips'],
  ['/trips/101', 'rider-web-receipt'],
  ['/account', 'rider-web-account'],
];
const DRIVER = [
  ['/driver', 'driver-web-dashboard'],
  ['/driver/earnings', 'driver-web-earnings'],
  ['/driver/trips', 'driver-web-trips'],
  ['/driver/documents', 'driver-web-documents'],
  ['/driver/payouts', 'driver-web-payouts'],
  ['/driver/profile', 'driver-web-profile'],
];
const DATED = ['/trips', '/driver/trips', '/driver/payouts'];

const failures = [];
const fail = (m) => failures.push(m);
const results = {};

// ---- Sample data in what ships (src/ and the browser bundles), always.
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = path.join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const shipped = [
  ...walk('src').filter((f) => /\.(tsx?|json|css)$/.test(f) && !/\.test\.tsx?$/.test(f)),
  ...(existsSync('.next/static') ? walk('.next/static').filter((f) => f.endsWith('.js')) : []),
];
for (const f of shipped) {
  const text = readFileSync(f, 'utf8');
  for (const s of SAMPLE) if (text.includes(s)) fail(`sample data "${s}" in ${f}`);
}

// ---- Sessions: a signed role cookie, as /api/session sets it, plus tokens.
const enc = new TextEncoder();
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');
async function signed(session) {
  const secret = process.env.WEB_SESSION_SECRET;
  const key = await webcrypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const body = b64(enc.encode(JSON.stringify(session)));
  return `${body}.${b64(new Uint8Array(await webcrypto.subtle.sign('HMAC', key, enc.encode(body))))}`;
}
const fakeJwt = () => `${b64(enc.encode('{"alg":"none"}'))}.${b64(enc.encode(JSON.stringify({ exp: 4102444800, user_id: 7 })))}.x`;

async function context(browser, role, width, height, lang = 'en') {
  const ctx = await browser.newContext({
    viewport: { width, height }, locale: 'en-IN', timezoneId: 'Asia/Kolkata',
    geolocation: { latitude: 17.4504, longitude: 78.381 }, permissions: ['geolocation'],
  });
  await ctx.addCookies([{ name: 'sg-language', value: lang, url: SITE }]);
  await ctx.addInitScript((l) => { try { localStorage.setItem('sg-theme', 'light'); localStorage.setItem('sg-language', l); } catch {} }, lang);
  if (QA) {
    const { signIn } = await import(pathToFileURL(path.resolve(process.env.LOGIN_MJS || 'scripts/qa-login.mjs')).href);
    const r = await signIn(ctx, SITE, role === 'driver' ? 'DRIVER' : 'RIDER');
    if (r.status !== 200) fail(`QA sign-in as ${role} failed (${r.status})`);
    return ctx;
  }
  const exp = Math.floor(Date.now() / 1000) + 3600;
  await ctx.addCookies([{ name: 'sg-session', value: await signed({ uid: '7', roles: [role], role, exp }), url: SITE }]);
  await ctx.addInitScript((t) => { try { localStorage.setItem('saaradhi_rider_access_token', t); } catch {} }, fakeJwt());
  await ctx.route(/\/api\/v1\//, async (route) => {
    const req = route.request();
    let body = null;
    try { body = req.postDataJSON(); } catch {}
    const data = fixture(req.method(), req.url(), body);
    await route.fulfill(data === null ? { status: 404, json: { error: 'no fixture' } } : { json: data });
  });
  return ctx;
}

const measure = (page) => page.evaluate(({ sizes, phone }) => {
  const vis = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && !el.closest('[aria-hidden="true"], .ar-map, select');
  };
  const bad = [];
  const narrow = innerWidth < 768;
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || ![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    const s = getComputedStyle(el);
    const size = Math.round(parseFloat(s.fontSize));
    const w = s.fontWeight;
    const t = el.textContent.trim().slice(0, 30);
    if (!sizes.includes(size) || (phone.includes(size) && !narrow)) bad.push(`${size}px "${t}"`);
    if (w !== '400' && w !== '600') bad.push(`weight ${w} "${t}"`);
  }
  return {
    sideways: document.documentElement.scrollWidth > innerWidth + 1,
    side: !!document.querySelector('.dr-side') && getComputedStyle(document.querySelector('.dr-side')).display !== 'none',
    badge: [...document.querySelectorAll('.dr-badge')].some((b) => b.getBoundingClientRect().width > 0 && b.textContent.trim() === 'DRIVER'),
    anyBadge: !!document.querySelector('.dr-badge, .dr-side'),
    type: bad.slice(0, 5),
    rows: [...document.querySelectorAll('.atable tbody tr, [data-row="dated"]')].map((r) => (r.querySelector('td') ?? r).innerText.trim()).filter(Boolean),
    payoutRows: [...document.querySelectorAll('main .acard .arow')].filter((r) => /\d/.test(r.innerText) && r.querySelector('.apill')).map((r) => r.innerText.trim()),
    text: document.body.innerText,
  };
}, { sizes: [...SIZES], phone: [...PHONE_ONLY] });

function diff(shot, refFile, mask) {
  const a = PNG.sync.read(readFileSync(refFile));
  const b = PNG.sync.read(shot);
  const W = a.width, H = a.height;
  const ours = new PNG({ width: W, height: H });
  for (let y = 0; y < Math.min(H, b.height); y++) b.data.copy(ours.data, y * W * 4, y * b.width * 4, y * b.width * 4 + Math.min(W, b.width) * 4);
  let hidden = 0;
  for (const [mx, my, mw, mh] of mask) {
    for (let y = Math.max(0, my); y < Math.min(H, my + mh); y++) {
      const from = (y * W + Math.max(0, mx)) * 4, to = (y * W + Math.min(W, mx + mw)) * 4;
      if (to > from) { a.data.copy(ours.data, from, from, to); hidden += (to - from) / 4; }
    }
  }
  const out = new PNG({ width: W, height: H });
  const bad = pixelmatch(a.data, ours.data, out.data, W, H, { threshold: 0.1, includeAA: false });
  return { share: bad / Math.max(1, W * H - hidden), png: PNG.sync.write(out) };
}

// Values differ by data; their boxes are masked, the layout around them is not.
const MASK = '.ar-map, .ar-logo, .dr-brand img, .a40, .a20, .a28 + p, .dr-chart, .atable td, .apill, .afield, [data-line], .anote .ab';

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
for (const [role, pages] of process.env.STATES_ONLY === '1' ? [] : [['rider', RIDER], ['driver', DRIVER]]) {
  for (const [p, name] of pages) {
    for (const [lang, w, h] of LANGS.flatMap((l) => (l === 'en' ? WIDTHS : LANG_WIDTHS).map(([w, h]) => [l, w, h]))) {
      const ctx = await context(browser, role, w, h, lang);
      const page = await ctx.newPage();
      await page.goto(SITE + p, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(800);
      await page.evaluate(() => document.fonts.ready);
      const at = `${p} (${role}${lang === 'en' ? '' : `, ${lang}`}) at ${w}x${h}`;
      const m = await measure(page);
      if (new URL(page.url()).pathname !== p.split('?')[0]) fail(`${at}: landed on ${new URL(page.url()).pathname}`);
      if (m.sideways) fail(`${at}: scrolls sideways`);
      if (m.type.length) fail(`${at}: type off the scale: ${m.type.join('; ')}`);
      if (role === 'driver' && (!m.badge || (w >= 1024 && !m.side))) fail(`${at}: no driver sidebar or DRIVER badge`);
      if (role === 'rider' && m.anyBadge) fail(`${at}: a rider page shows driver chrome`);
      if (w === 1440 && lang === 'en' && DATED.includes(p)) {
        const rows = p === '/driver/payouts' ? m.payoutRows : m.rows;
        // An empty period ("No trips in this period.", "No payouts yet") is a state, not a row.
        const dated = rows.filter((r) => !/^\s*No (trips|payouts)/.test(r));
        if (!dated.length && !QA) fail(`${at}: no rows to check for dates`);
        for (const r of dated) {
          const hasDate = /(Today|Yesterday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(r);
          const hasTime = /\d{1,2}:\d{2}/.test(r);
          if (!hasDate || !hasTime) fail(`${at}: a row without a date and time: "${r.replace(/\s+/g, ' ').slice(0, 60)}"`);
        }
      }
      // A sample phrase inside a longer real name ("Rajiv Gandhi International
      // Airport") is a real place, not the design's example.
      const shows = (s) => m.text.split('\n').some((line) => {
        const i = line.indexOf(s);
        return i >= 0 && !/\p{L}\s*$/u.test(line.slice(0, i));
      });
      if (QA) for (const s of SAMPLE) if (shows(s)) fail(`${at}: design sample "${s}" visible on QA`);
      if (w === 1440 && SHOTS) {
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS, `${name}${lang === 'en' ? '' : `-${lang}`}.png`) });
      }
      if (w === 1440 && lang === 'en' && !QA) {
        const ref = path.join(REF, `${name}.png`);
        const shot = await page.screenshot();
        const boxes = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => {
          const r = e.getBoundingClientRect();
          return [Math.floor(r.left) - 2, Math.floor(r.top) - 2, Math.ceil(r.width) + 4, Math.ceil(r.height) + 4];
        }), MASK);
        if (existsSync(ref)) {
          const d = diff(shot, ref, boxes);
          mkdirSync(DIFFS, { recursive: true });
          writeFileSync(path.join(DIFFS, `${name}-diff.png`), d.png);
          writeFileSync(path.join(DIFFS, `${name}-ours.png`), shot);
          results[name] = Number((d.share * 100).toFixed(2));
          const [max, why] = ALLOW[name] ?? [MAX_DIFF, null];
          if (d.share > max) fail(`${at}: ${(d.share * 100).toFixed(1)}% of pixels differ from ${name}.png (max ${max * 100}%${why ? `: ${why}` : ''})`);
        } else fail(`${at}: reference ${name}.png is missing`);
      }
      await ctx.close();
    }
  }
}

// ---- States (8 Nov): every signed-in page ends loaded, empty or in error
// within ten seconds; an expired session goes to Log in; a failing card says
// so and Try again works. CI answers from fixtures; QA=1 uses the real new
// accounts (NEWDRV/NEWRID) and a used-up session (STALE_*) from SEC_FILE.
// A masked phone ("+91 ••••• ••801") is privacy, not a placeholder: bullets before digits pass.
const PLACEHOLDER = /…|•••(?![•\s]*\d)/;
const STATE_WAIT = 10_000;
const SEC = QA && process.env.SEC_FILE
  ? Object.fromEntries(readFileSync(process.env.SEC_FILE, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  : {};

async function stateContext(role, how, failing = null) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript(() => { try { localStorage.setItem('sg-theme', 'light'); } catch {} });
  const fail500 = { on: !!failing };
  if (QA) {
    const { signIn } = await import(pathToFileURL(path.resolve(process.env.LOGIN_MJS || 'scripts/qa-login.mjs')).href);
    const label = how === 'new' ? (role === 'driver' ? 'NEWDRV' : 'NEWRID') : role === 'driver' ? 'DRIVER' : 'RIDER';
    const r = await signIn(ctx, SITE, label);
    if (r.status !== 200) fail(`states: QA sign-in as ${label} failed (${r.status})`);
    if (how === 'expired') {
      // The browser's tokens ran out and the refresh token was already used.
      await ctx.addInitScript(({ t, r }) => {
        if (sessionStorage.getItem('stale')) return;
        localStorage.setItem('saaradhi_rider_access_token', t);
        localStorage.setItem('saaradhi_rider_refresh_token', r);
        sessionStorage.setItem('stale', '1');
      }, { t: SEC.STALE_TOK, r: SEC.STALE_REF });
    }
    if (failing) await ctx.route(failing, (route) => (fail500.on ? route.fulfill({ status: 500, json: { error: 'gate' } }) : route.continue()));
    return [ctx, fail500];
  }
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const cookie = await signed({ uid: '7', roles: [role], role, exp });
  // A cookie signed before the last deploy no longer verifies.
  await ctx.addCookies([{ name: 'sg-session', value: how === 'stale-cookie' ? `${cookie.slice(0, -4)}AAAA` : cookie, url: SITE }]);
  await ctx.addInitScript((t) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('saaradhi_rider_access_token', t);
    localStorage.setItem('saaradhi_rider_refresh_token', 'gate-refresh');
    sessionStorage.setItem('seeded', '1');
  }, fakeJwt());
  await ctx.route(/\/api\/v1\//, async (route) => {
    const req = route.request();
    const url = req.url();
    if (how === 'expired') return route.fulfill(url.includes('/auth/refresh/') ? { status: 400, json: {} } : { status: 401, json: {} });
    if (failing && fail500.on && failing.test(url)) return route.fulfill({ status: 500, json: { error: 'gate' } });
    let body = null;
    try { body = req.postDataJSON(); } catch {}
    const data = (how === 'new' ? emptyAccount(req.method(), url) : undefined) ?? fixture(req.method(), url, body);
    return route.fulfill(data === null || data === undefined ? { status: 404, json: { error: 'no fixture' } } : { json: data });
  });
  return [ctx, fail500];
}

/**
 * Waits up to ten seconds from navigation for the expected content with no
 * skeleton and no placeholder (before hydration there is neither, so the
 * content itself is the signal); returns the page text.
 */
async function settledText(page, want) {
  // Polled from here: QA's CSP forbids the page-side eval waitForFunction uses.
  const end = Date.now() + STATE_WAIT;
  for (;;) {
    const ok = await page.evaluate(([re, w]) => !document.querySelector('.askel') && !new RegExp(re).test(document.body.innerText)
      && new RegExp(w).test(document.body.innerText), [PLACEHOLDER.source, want.source]).catch(() => false);
    if (ok || Date.now() > end) break;
    await page.waitForTimeout(250);
  }
  return page.locator('body').innerText().catch(() => '');
}

const EMPTY = {
  driver: [
    ['/driver', /₹0\.00/], ['/driver/earnings', /₹0\.00/], ['/driver/trips', /No trips yet/],
    ['/driver/documents', /Documents/], ['/driver/payouts', /No payouts yet/], ['/driver/profile', /Vehicle/],
  ],
  rider: [['/trips', /No trips yet/], ['/account', /Saved places/]],
};
const stateResults = [];
for (const role of ['driver', 'rider']) {
  for (const [p, want] of EMPTY[role]) {
    const [ctx] = await stateContext(role, 'new');
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(SITE + p, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    const text = await settledText(page, want);
    const ms = Date.now() - t0;
    const stuck = (await page.locator('.askel').count()) > 0 || PLACEHOLDER.test(text);
    const ok = !stuck && want.test(text) && new URL(page.url()).pathname === p;
    stateResults.push(`new ${role} ${p}: ${ok ? 'ok' : 'FAIL'} in ${(ms / 1000).toFixed(1)} s`);
    if (!ok) fail(`states: new ${role} ${p} ${stuck ? 'still loading or shows a placeholder after 10 s' : `does not show ${want}`} (landed on ${new URL(page.url()).pathname})`);
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `new-${role}${p.replace(/\//g, '_')}.png`) }); }
    await ctx.close();
  }
}

for (const [role, p, how] of [['driver', '/driver', 'expired'], ['rider', '/trips', 'expired'], ...(QA ? [] : [['driver', '/driver/earnings', 'stale-cookie']])]) {
  const [ctx] = await stateContext(role, how);
  const page = await ctx.newPage();
  await page.goto(SITE + p, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForURL(/sign-in/, { timeout: STATE_WAIT }).catch(() => {});
  const text = await page.locator('body').innerText().catch(() => '');
  const at = new URL(page.url()).pathname;
  const ok = /sign-in$/.test(at) && (how !== 'expired' || /Your session ended/.test(text));
  stateResults.push(`${how} ${role} ${p}: ${ok ? `ok (${at})` : `FAIL (${at})`}`);
  if (!ok) fail(`states: ${how} session on ${p} ended on ${at}${how === 'expired' ? ' without the session-ended message' : ''}, not on Log in`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${how}-${role}.png`) });
  await ctx.close();
}

{
  const [ctx, failing] = await stateContext('driver', 'test', /\/driver\/earnings\/period\//);
  const page = await ctx.newPage();
  await page.goto(SITE + '/driver/earnings', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  const shown = await page.getByText("We couldn't load your earnings.").first().waitFor({ timeout: STATE_WAIT }).then(() => true, () => false);
  failing.on = false;
  if (shown) await page.getByRole('button', { name: 'Try again' }).first().click().catch(() => {});
  const back = shown && await page.locator('[data-line]').first().waitFor({ timeout: STATE_WAIT }).then(() => true, () => false);
  stateResults.push(`earnings API failing: error ${shown ? 'shown' : 'NOT shown'}, Try again ${back ? 'works' : 'FAILED'}`);
  if (!shown) fail('states: with the earnings API failing, /driver/earnings did not show the error');
  else if (!back) fail('states: Try again on /driver/earnings did not bring the numbers back');
  await ctx.close();
}
console.log('states:\n  ' + stateResults.join('\n  '));
await browser.close();

console.log('visual diff %:', JSON.stringify(results));
for (const f of failures) console.log(`FAIL ${f}`);
console.log(failures.length ? `${failures.length} area failures` : 'areas gate: pass');
process.exit(failures.length ? 1 : 0);
