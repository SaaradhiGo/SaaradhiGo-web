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
import { SAMPLE, fixture } from './fixtures/areas.mjs';

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

const RIDER = [
  ['/ride', 'rider-web-home'],
  ['/ride/choose?from=17.4504,78.3810&to=17.2403,78.4294&tl=International%20Airport', 'rider-web-choose'],
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

async function context(browser, role, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height }, locale: 'en-IN', timezoneId: 'Asia/Kolkata',
    geolocation: { latitude: 17.4504, longitude: 78.381 }, permissions: ['geolocation'],
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('sg-theme', 'light'); } catch {} });
  if (QA) {
    const { signIn } = await import(path.resolve(process.env.LOGIN_MJS || 'scripts/login.mjs'));
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
for (const [role, pages] of [['rider', RIDER], ['driver', DRIVER]]) {
  for (const [p, name] of pages) {
    for (const [w, h] of WIDTHS) {
      const ctx = await context(browser, role, w, h);
      const page = await ctx.newPage();
      await page.goto(SITE + p, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(800);
      await page.evaluate(() => document.fonts.ready);
      const at = `${p} (${role}) at ${w}x${h}`;
      const m = await measure(page);
      if (new URL(page.url()).pathname !== p.split('?')[0]) fail(`${at}: landed on ${new URL(page.url()).pathname}`);
      if (m.sideways) fail(`${at}: scrolls sideways`);
      if (m.type.length) fail(`${at}: type off the scale: ${m.type.join('; ')}`);
      if (role === 'driver' && (!m.badge || (w >= 1024 && !m.side))) fail(`${at}: no driver sidebar or DRIVER badge`);
      if (role === 'rider' && m.anyBadge) fail(`${at}: a rider page shows driver chrome`);
      if (w === 1440 && DATED.includes(p)) {
        const rows = p === '/driver/payouts' ? m.payoutRows : m.rows;
        if (!rows.length) fail(`${at}: no rows to check for dates`);
        for (const r of rows) {
          const hasDate = /(Today|Yesterday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(r);
          const hasTime = /\d{1,2}:\d{2}/.test(r);
          if (!hasDate || !hasTime) fail(`${at}: a row without a date and time: "${r.replace(/\s+/g, ' ').slice(0, 60)}"`);
        }
      }
      if (QA) for (const s of SAMPLE) if (m.text.includes(s)) fail(`${at}: design sample "${s}" visible on QA`);
      if (w === 1440 && SHOTS) {
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
      }
      if (w === 1440 && !QA) {
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
await browser.close();

console.log('visual diff %:', JSON.stringify(results));
for (const f of failures) console.log(`FAIL ${f}`);
console.log(failures.length ? `${failures.length} area failures` : 'areas gate: pass');
process.exit(failures.length ? 1 : 0);
