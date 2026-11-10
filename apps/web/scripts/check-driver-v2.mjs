// Gate for driver area v2 (owner, 10 Nov; design/driver-v2-2026-11-10). Fails on:
//   contrast   any axe-core colour-contrast violation (text invisible or too faint), or any
//              serious/critical axe violation, on every driver and rider page, light and dark
//   primary    more than one orange (primary) button on a screen; not exactly one on the setup
//              steps and on the Dashboard of a driver still setting up
//   focus      a focused field whose ring is not on its outer box (or an inner outline)
//   visual     more than 3% of pixels off the 4 design screenshots at 1440 wide, values masked
//   locale     an Indian driver's date field not dd/mm/yyyy, a US driver's not mm/dd/yyyy
//   status     a file tile whose pill is not its own status (an uploaded file shown as Missing)
//   earnings   the cards not adding up: fares - platform fee + tips != you earned
//
// CI: SITE=http://localhost:3100 WEB_SESSION_SECRET=... node scripts/check-driver-v2.mjs
//   (the API is answered from scripts/fixtures; diffs and screenshots in V2_DIFFS)
// QA: QA=1 SITE=https://www.qa.saaradhigo.com SEC_FILE=... node scripts/check-driver-v2.mjs
//   (signs in as DRIVER, RIDER and USDRV from the private token file; no visual diff)
import { chromium } from 'playwright-core';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { fixture } from './fixtures/areas.mjs';
import { requirements, withSteps } from './fixtures/requirements.mjs';
import { usAccount } from './fixtures/empty-account.mjs';

const SITE = process.env.SITE || 'http://localhost:3100';
const QA = process.env.QA === '1';
const REF = path.resolve('../../design/driver-v2-2026-11-10/screenshots');
const DIFFS = process.env.V2_DIFFS || 'v2-diff';
const MAX_DIFF = 0.03;
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

// '/driver#approved': an approved driver with an insurance renewal due (the dark "Upload renewal" link).
const DRIVER = ['/driver', '/driver#approved', '/driver/setup/identity', '/driver/setup/photos-and-papers', '/driver/profile', '/driver/earnings',
  '/driver/trips', '/driver/documents', '/driver/payouts', '/driver/support'];
const RIDER = ['/ride', '/trips', '/trips/101', '/account'];
const failures = [];
const fail = (m) => failures.push(m);
const report = { axe: {}, visual: {} };

// ---- The design's state, for the visual diff: a driver part-way through setup (Dashboard and
// setup), and an approved driver with trips (Profile, Earnings). TEST DATA ONLY.
function setupState() {
  const r = requirements('IN', false);
  const status = {
    profile_photo: 'in_review', legal_name: 'done', date_of_birth: 'done', address: 'done', address_proof: 'in_review',
    emergency_contact: 'done', driving_licence: 'missing', aadhaar: 'missing', pan: 'missing', police_verification: 'rejected',
  };
  const files = {
    driving_licence: [['license_front', 'Licence, front', 'in_review'], ['license_back', 'Licence, back', 'missing']],
    police_verification: [['police_verification', 'Police verification certificate', 'rejected']],
  };
  r.checklist.items = r.checklist.items.map((i) => ({
    ...i, status: status[i.key] ?? i.status, reason: i.key === 'police_verification' ? 'Photo unclear, all four corners must be visible' : null,
    files: files[i.key]?.map(([key, label, s]) => ({ key, label, status: s, reason: s === 'rejected' ? 'Photo unclear, all four corners must be visible' : null,
      uploaded_at: s === 'missing' ? null : '2026-11-10T04:30:00Z', vehicle: false })) ?? i.files?.map((f) => ({ ...f, status: status[i.key] === 'in_review' ? 'in_review' : f.status })),
  }));
  r.identity.license_number = 'KA0120190012345';
  const out = withSteps({ ...r, checklist: { ...r.checklist } });
  out.checklist.steps_done = 2;   // as the design shows it
  return out;
}

function route(page, override) {
  return (method, url, body) => {
    const p = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    const got = override?.(p, url);
    return got !== undefined ? got : fixture(method, url, body);
  };
}
const NEW = { '/driver/driver/profile/': { status: 'off', approved: false, total_trips: 0, ratings: null } };
const OVERRIDES = {
  '/driver': (p) => (p === '/driver/requirements/' ? setupState() : p === '/driver/vehicles/' ? [] : NEW[p]),
  '/driver/setup/identity': (p) => (p === '/driver/requirements/' ? setupState() : p === '/driver/vehicles/' ? [] : NEW[p]),
  '/driver/setup/photos-and-papers': (p) => (p === '/driver/requirements/' ? setupState() : p === '/driver/vehicles/' ? [] : NEW[p]),
};
const US = (method, url, body) => usAccount(method, url, body) ?? fixture(method, url, body);

// ---- Sessions: a signed role cookie, as /api/session sets it, plus a token.
const enc = new TextEncoder();
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');
async function signed(session) {
  const key = await webcrypto.subtle.importKey('raw', enc.encode(process.env.WEB_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const body = b64(enc.encode(JSON.stringify(session)));
  return `${body}.${b64(new Uint8Array(await webcrypto.subtle.sign('HMAC', key, enc.encode(body))))}`;
}
const fakeJwt = () => `${b64(enc.encode('{"alg":"none"}'))}.${b64(enc.encode(JSON.stringify({ exp: 4102444800, user_id: 7 })))}.x`;

async function open(browser, role, p, { theme = 'light', answer = null, label = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript((t) => {
    try { localStorage.setItem('sg-theme', t); localStorage.setItem('sg-language', 'en'); } catch {}
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await ctx.addCookies([{ name: 'sg-language', value: 'en', url: SITE }, { name: 'sg-theme', value: theme, url: SITE }]);
  if (QA) {
    const { signIn } = await import(pathToFileURL(path.resolve('scripts/qa-login.mjs')).href);
    const r = await signIn(ctx, SITE, label ?? (role === 'driver' ? 'DRIVER' : 'RIDER'));
    if (r.status !== 200) fail(`QA sign-in as ${label ?? role} failed (${r.status})`);
  } else {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    await ctx.addCookies([{ name: 'sg-session', value: await signed({ uid: '7', roles: [role], role, exp }), url: SITE }]);
    await ctx.addInitScript((t) => { try { localStorage.setItem('saaradhi_rider_access_token', t); } catch {} }, fakeJwt());
    const answerer = answer ?? route(p, OVERRIDES[p]);
    await ctx.route(/\/api\/v1\//, async (r) => {
      const req = r.request();
      let body = null;
      try { body = req.postDataJSON(); } catch {}
      const data = answerer(req.method(), req.url(), body);
      await r.fulfill(data === null || data === undefined ? { status: 404, json: { error: 'no fixture' } } : { json: data });
    });
  }
  const page = await ctx.newPage();
  await page.goto(SITE + p, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

async function axe(page) {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    const r = await window.axe.run({ exclude: [['.ar-map'], ['.asheet-scrim']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    // Text the same colour as its background (1:1) is "incomplete" in axe, not a violation:
    // that is invisible text, the 10 Nov black-on-black button, so it counts as one here.
    const invisible = r.incomplete.filter((v) => v.id === 'color-contrast').flatMap((v) => v.nodes)
      .filter((n) => n.any.some((c) => c.data?.messageKey === 'equalRatio' || c.data?.contrastRatio === 1));
    const out = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 4), count: v.nodes.length }));
    if (invisible.length) out.push({ id: 'invisible-text', impact: 'serious', nodes: invisible.map((n) => n.target.join(' ')).slice(0, 4), count: invisible.length });
    return out;
  });
}

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
const MASK = ['.dr-brand img', '.dr-head .a14', '.apm-btn', '.a40', '.a28', '.a20', '.apill', '.ainput', '.er-bars', '.er-ticks',
  '[data-stat]', '.er-sub', '.pf-row > :last-child', '.pf-row > :first-child', '.pf-meta', '.er-row', '.su-step .a14', '.su-tile .agrow',
  '.dr-ring', '.dr-setup .amut', '.pf-face', '.er-mhead .a14', '.su-field .a14'].join(', ');
const VISUAL = { '/driver': 'driver-v2-dashboard', '/driver/setup/identity': 'driver-v2-onboarding', '/driver/profile': 'driver-v2-profile', '/driver/earnings': 'driver-v2-earnings' };
const ONE_PRIMARY = new Set(['/driver', '/driver/setup/identity', '/driver/setup/photos-and-papers']);

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });

// ---- Contrast (axe) and one primary button: every page, both themes.
for (const [role, pages] of [['driver', DRIVER], ['rider', RIDER]]) {
  for (const p of pages) {
    for (const theme of ['light', 'dark']) {
      const { ctx, page } = await open(browser, role, p, { theme });
      const at = `${p} (${theme})`;
      const v = await axe(page);
      report.axe[at] = v.map((x) => `${x.id}×${x.count}`);
      for (const x of v) {
        if (x.id === 'color-contrast' || x.impact === 'critical' || x.impact === 'serious') fail(`${at}: axe ${x.id} (${x.impact}) on ${x.nodes.join(' | ')}`);
      }
      const primaries = await page.evaluate(() => [...document.querySelectorAll('.abtn--pri')].filter((e) => e.getBoundingClientRect().width > 0).length);
      if (primaries > 1) fail(`${at}: ${primaries} orange buttons (one at most)`);
      if (!QA && theme === 'light' && ONE_PRIMARY.has(p) && primaries !== 1) fail(`${at}: ${primaries} orange buttons (exactly one)`);
      if (theme === 'light' && !QA && VISUAL[p]) {
        const name = VISUAL[p];
        const shot = await page.screenshot({ fullPage: name === 'driver-v2-onboarding' });
        const boxes = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => {
          const r = e.getBoundingClientRect();
          return [Math.floor(r.left) - 2, Math.floor(r.top + window.scrollY) - 2, Math.ceil(r.width) + 4, Math.ceil(r.height) + 4];
        }), MASK);
        const ref = path.join(REF, `${name}.png`);
        if (!existsSync(ref)) fail(`${name}.png is missing`);
        else {
          const d = diff(shot, ref, boxes);
          mkdirSync(DIFFS, { recursive: true });
          writeFileSync(path.join(DIFFS, `${name}-diff.png`), d.png);
          writeFileSync(path.join(DIFFS, `${name}-ours.png`), shot);
          report.visual[name] = Number((d.share * 100).toFixed(2));
          if (d.share > MAX_DIFF) fail(`${p}: ${(d.share * 100).toFixed(1)}% of pixels differ from ${name}.png (max 3%)`);
        }
      }
      await ctx.close();
    }
  }
}

// ---- Focus: the ring is on the field's outer box, never an inner one (setup field and rider search).
for (const [role, p, sel] of [['driver', '/driver/setup/identity', '#su-lic'], ['driver', '/driver/earnings', null], ['rider', '/account', null]]) {
  const { ctx, page } = await open(browser, role, p);
  const target = sel ?? (await page.evaluate(() => {
    const i = document.querySelector('.ainput input, .afield input');
    if (i && !i.id) i.id = 'focus-probe';
    return i ? `#${i.id}` : null;
  }));
  if (target && await page.$(target)) {
    await page.focus(target);
    await page.keyboard.press('End');
    const s = await page.evaluate((t) => {
      const input = document.querySelector(t);
      const box = input.closest('.ainput, .afield');
      const b = getComputedStyle(box); const i = getComputedStyle(input);
      return { border: b.borderTopColor, width: b.borderTopWidth, shadow: b.boxShadow, outline: i.outlineStyle };
    }, target);
    // 2px around the outer box: a 2px border, or a 1px border plus a 1px ring; then the 4px glow.
    const ring = s.width === '2px' ? /rgba\(245, 166, 35, 0\.25\) 0px 0px 0px 4px/ : /rgb\(138, 83, 0\) 0px 0px 0px 1px.*rgba\(245, 166, 35, 0\.25\) 0px 0px 0px 5px/;
    if (s.border !== 'rgb(138, 83, 0)' || !ring.test(s.shadow) || s.outline !== 'none') {
      fail(`${p}: focus ring not on the outer box (${JSON.stringify(s)})`);
    }
  } else if (sel) fail(`${p}: no field ${sel} to focus`);
  await ctx.close();
}

// ---- Locale and status (fixtures: an Indian and a US driver; QA: the test driver and USDRV).
for (const [want, answer, label] of [['dd/mm/yyyy', null, 'DRIVER'], ['mm/dd/yyyy', US, 'USDRV']]) {
  const { ctx, page } = await open(browser, 'driver', '/driver/setup/identity', { answer, label });
  const ph = await page.getAttribute('[data-testid="licence-expiry"]', 'placeholder').catch(() => null);
  if (ph !== want) fail(`/driver/setup/identity (${label}): date placeholder ${ph}, want ${want}`);
  const tiles = await page.evaluate(() => [...document.querySelectorAll('.su-tile[data-status]')].map((t) => [t.getAttribute('data-status'), t.querySelector('.apill')?.textContent]));
  const LABEL = { missing: 'Missing', in_review: 'In review', approved: 'Approved', rejected: 'Rejected', expiring: 'Expiring' };
  for (const [st, text] of tiles) if (LABEL[st] !== text) fail(`/driver/setup/identity (${label}): a ${st} file shows "${text}"`);
  if (!QA && label === 'DRIVER' && !tiles.some(([st, text]) => st === 'in_review' && text === 'In review')) fail('/driver/setup/identity: the uploaded licence front is not In review');
  await ctx.close();
}

// ---- Earnings add up on screen.
{
  const { ctx, page } = await open(browser, 'driver', '/driver/earnings');
  const n = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-stat]')]
    .map((e) => [e.getAttribute('data-stat'), Number((e.textContent ?? '').replace(/[^\d.]/g, ''))])));
  if (Object.keys(n).length !== 5) fail(`/driver/earnings: ${Object.keys(n).length} summary cards, want 5`);
  else if (Math.abs(n['Trip fares'] - n['Platform fee'] + n['Tips'] - n['You earned']) > 0.005) fail(`/driver/earnings: cards do not add up ${JSON.stringify(n)}`);
  if (!(await page.$('[data-testid="all-months"] [data-month]'))) fail('/driver/earnings: no month in All months');
  await ctx.close();
}

await browser.close();
writeFileSync(process.env.V2_REPORT || 'v2-report.json', JSON.stringify(report, null, 1));
console.log('visual', JSON.stringify(report.visual));
console.log('axe pages with findings', Object.entries(report.axe).filter(([, v]) => v.length).length);
if (failures.length) {
  console.log(`check-driver-v2: ${failures.length} failure(s)`);
  for (const f of failures) console.log(' -', f);
  process.exit(1);
}
console.log('check-driver-v2: pass');
