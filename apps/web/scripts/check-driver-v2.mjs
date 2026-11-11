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
//   periods    Trips or Payouts without Earnings' periods (Day ... Custom range, previous, next)
//              (11 Nov)
//   empty      a chart of a period with no trips without its day markers, a flat baseline and
//              "No trips in {period} yet", or blank; each chart's screenshot is in V2_DIFFS
//   zero       "− ₹0.00" (a minus on nothing) anywhere on any page, light or dark
//   withdraw   (11 Nov) the Withdraw now fee rows under 4.5:1 (axe colour contrast on the open panel)
//   phone      (11 Nov) at 375 px: sideways scroll on a driver page, no bottom bar, the six-item menu
//              above the page, or a header taller than 140 px
//   detail     (11 Nov) a trip row that does not open its trip by keyboard, a sheet that Escape does
//              not close or that leaves focus elsewhere; the same for the statement
//   support    (11 Nov) /driver/support without the driver header or with the rider's questions
//   setup      (11 Nov) /driver/setup/licence not opening the identity step
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
const report = { axe: {}, visual: {}, empty: {} };

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
      const minusZero = await page.evaluate(() => (document.body.innerText.match(/[−-]\s*(?:₹|\$|Rs\.?|INR|USD)\s*0[.,]00(?!\d)/g) ?? []));
      if (minusZero.length) fail(`${at}: a minus on a zero amount (${minusZero.slice(0, 3).join(', ')})`);
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

// ---- Trips and Payouts have the Earnings periods (11 Nov).
{
  const tabs = {};
  for (const p of ['/driver/earnings', '/driver/trips', '/driver/payouts']) {
    const { ctx, page } = await open(browser, 'driver', p);
    tabs[p] = await page.evaluate(() => [...document.querySelectorAll('.er-tabs [role="tab"]')].map((t) => t.textContent.trim()).join(' | '));
    const arrows = await page.evaluate(() => ['Previous', 'Next'].every((l) => document.querySelector(`.er-arrow[aria-label="${l}"]`)));
    if (!arrows) fail(`${p}: no previous and next period arrows`);
    if (p !== '/driver/earnings' && !(await page.$('.er-search input'))) fail(`${p}: no search`);
    if (p === '/driver/trips' && !QA) {
      // Fixtures answer ?q= as the API does; only the matching trips stay.
      await page.fill('.er-search input', 'Airport');
      await page.waitForTimeout(1200);
      const rows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="trips-table"] tbody tr')].map((r) => r.textContent));
      if (!rows.length || rows.some((r) => !r.includes('Airport'))) fail(`/driver/trips: search "Airport" shows ${JSON.stringify(rows.slice(0, 3))}`);
    }
    await ctx.close();
  }
  if (tabs['/driver/earnings'] !== 'Day | Week | Month | Year | Custom range') fail(`/driver/earnings: periods "${tabs['/driver/earnings']}"`);
  for (const p of ['/driver/trips', '/driver/payouts']) if (tabs[p] !== tabs['/driver/earnings']) fail(`${p}: periods "${tabs[p]}", Earnings has "${tabs['/driver/earnings']}"`);
}

// ---- Each chart in a period with no trips: day markers, a flat baseline and the line; not blank.
// Fixtures: zero bars. QA: the earnings chart stepped back a day at a time to a day with no trips.
{
  const zeroHistory = (method, url, body) => {
    const h = fixture(method, url, body);
    if (!/\/driver\/earnings\/history\//.test(url) || !h) return h;
    return { ...h, summary: { ...h.summary, trips: 0, days_driven: 0, fares: '0.00', avg_fare: '0.00', platform_fee: '0.00', earned: '0.00' },
      chart: { ...h.chart, bars: h.chart.bars.map((b) => ({ ...b, earned: '0.00', trips: 0 })) } };
  };
  const zeroWeek = (method, url, body) => (/\/driver\/earnings\/daily\//.test(url)
    ? { days: fixture(method, url, body).days.map((d) => ({ ...d, trips: 0, gross: '0', commission: '0', net: '0' })) } : fixture(method, url, body));
  const charts = [['earnings', '/driver/earnings', '[data-testid="earnings-chart"]', '.er-bars', '.er-ticks > span', zeroHistory]];
  if (!QA) charts.push(['dashboard', '/driver#approved', '.dr-chart', '.dr-chart__well', '.dr-chart > div > .amut', zeroWeek]);
  for (const [name, p, box, base, ticks, answer] of charts) {
    const { ctx, page } = await open(browser, 'driver', p, { answer: QA ? null : answer });
    if (QA) {
      // Previous is disabled while a period loads, so wait for the chart after every step.
      const loaded = () => page.waitForSelector(box, { timeout: 20000 }).catch(() => {});
      await page.click('.er-tabs [role="tab"]:has-text("Day")').catch(() => {});
      await page.waitForTimeout(300); await loaded();
      for (let i = 0; i < 40 && !(await page.$('.er-bars[data-empty]')); i += 1) {
        const prev = await page.$('.er-arrow[aria-label="Previous"]:not([disabled])');
        if (!prev) break;
        await prev.click();
        await page.waitForTimeout(300); await loaded();
      }
    }
    const el = await page.$(box);
    if (!el) { fail(`${p}: no ${name} chart`); await ctx.close(); continue; }
    const shot = await el.screenshot();
    mkdirSync(DIFFS, { recursive: true });
    writeFileSync(path.join(DIFFS, `empty-${name}.png`), shot);
    const got = await page.evaluate(([b, bs, ts]) => {
      const root = document.querySelector(b);
      const line = root.querySelector('.er-empty');
      const baseEl = root.querySelector(bs);
      return {
        empty: !!root.querySelector('[data-empty]') || root.hasAttribute('data-empty'),
        line: line ? line.textContent.trim() : null,
        lineVisible: !!line && line.getBoundingClientRect().height > 0,
        // The line's centre against the chart's: off by more than 5% of its width is off centre.
        offCentre: line ? Math.abs((line.getBoundingClientRect().left + line.getBoundingClientRect().right) / 2
          - (root.getBoundingClientRect().left + root.getBoundingClientRect().right) / 2) / root.getBoundingClientRect().width : 1,
        markers: [...root.querySelectorAll(ts)].filter((t) => t.textContent.trim()).length,
        // The baseline's drawn width across the chart, as a share of the chart's width.
        baseline: [...root.querySelectorAll(bs)].reduce((w, e) => w + (parseFloat(getComputedStyle(e).borderBottomWidth) >= 1 ? e.getBoundingClientRect().width : 0), 0)
          / (root.getBoundingClientRect().width || 1),
      };
    }, [box, base, ticks]);
    // Not blank: enough pixels away from the card's own colour (text, markers, baseline).
    const png = PNG.sync.read(shot);
    const [r0, g0, b0] = png.data;
    let ink = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if (Math.abs(png.data[i] - r0) + Math.abs(png.data[i + 1] - g0) + Math.abs(png.data[i + 2] - b0) > 60) ink += 1;
    }
    const share = ink / (png.width * png.height);
    report.empty[name] = { ...got, ink: Number((share * 100).toFixed(2)) };
    if (!got.empty) { if (!QA) fail(`${p}: the ${name} chart is not shown as empty`); else report.empty[name].skipped = 'no empty day found'; await ctx.close(); continue; }
    if (!got.line || !/^No trips in .+ yet$/.test(got.line) || !got.lineVisible) fail(`${p}: empty ${name} chart line is "${got.line}"`);
    if (got.offCentre > 0.05) fail(`${p}: the empty ${name} chart's line is off centre`);
    if (got.markers < 2) fail(`${p}: empty ${name} chart has ${got.markers} day markers`);
    if (!(got.baseline >= 0.6)) fail(`${p}: empty ${name} chart has no baseline across it (${(got.baseline * 100).toFixed(0)}%)`);
    if (share < 0.01) fail(`${p}: empty ${name} chart is blank (${(share * 100).toFixed(2)}% ink)`);
    await ctx.close();
  }
}

// ---- Withdraw now (11 Nov): the fee rows are the page's own text colours, at least 4.5:1, both themes.
// Fixtures switch instant cash-out on for this check; QA has it off, so only CI checks the panel.
if (!QA) {
  const instant = (method, url, body) => {
    const p = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    if (p === '/driver/withdrawals/balance/') return { available_balance: '397.00', currency: 'INR', withdrawals_available: true, instant: { available: true, provider: 'RazorpayX', saaradhigo_fee: '0.00' } };
    if (p === '/driver/withdrawals/instant/quote/') return { amount: '397.00', provider_fee: '5.90', provider_fee_label: 'Provider fee (RazorpayX)', saaradhigo_fee: '0.00', you_receive: '391.10', currency: 'INR', destination: 'UPI ra••@okaxis', arrival: 'In about 30 minutes', valid: true };
    return fixture(method, url, body);
  };
  for (const theme of ['light', 'dark']) {
    const { ctx, page } = await open(browser, 'driver', '/driver/payouts', { theme, answer: instant });
    await page.getByRole('button', { name: 'Withdraw now' }).click();
    await page.getByRole('button', { name: 'See the fee' }).click();
    await page.waitForSelector('[data-testid="withdraw-panel"] dl', { timeout: 5000 }).catch(() => fail(`/driver/payouts (${theme}): the fee rows did not show`));
    await page.addScriptTag({ content: AXE });
    const bad = await page.evaluate(async () => {
      const r = await window.axe.run('[data-testid="withdraw-panel"]', { runOnly: { type: 'rule', values: ['color-contrast'] } });
      return [...r.violations, ...r.incomplete.filter((v) => v.nodes.some((n) => n.any.some((c) => c.data?.contrastRatio && c.data.contrastRatio < 4.5)))]
        .flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.data?.contrastRatio ?? ''}`));
    });
    if (bad.length) fail(`/driver/payouts (${theme}): Withdraw now panel under 4.5:1 on ${bad.slice(0, 4).join(' | ')}`);
    await ctx.close();
  }
}

// ---- Phone (11 Nov): every driver page at 375 px; the bottom bar, a compact header, no sideways scroll.
for (const p of DRIVER.filter((x) => !x.includes('#'))) {
  const { ctx, page } = await open(browser, 'driver', p);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(400);
  const got = await page.evaluate(() => {
    const head = document.querySelector('.dr-head')?.getBoundingClientRect();
    const side = document.querySelector('.dr-side')?.getBoundingClientRect();
    const bar = document.querySelector('[data-testid="driver-tabbar"]')?.getBoundingClientRect();
    return { wide: document.documentElement.scrollWidth - window.innerWidth, head: head?.height ?? 0, side: side?.height ?? 0,
      bar: bar ? bar.height : 0, barAt: bar ? window.innerHeight - bar.bottom : -1 };
  });
  if (got.wide > 0) fail(`${p} at 375: ${got.wide}px of sideways scroll`);
  if (got.side > 0) fail(`${p} at 375: the sidebar menu is still above the page (${Math.round(got.side)}px)`);
  if (!(got.bar > 40) || Math.abs(got.barAt) > 1) fail(`${p} at 375: no bottom bar`);
  if (got.head > 140) fail(`${p} at 375: the header is ${Math.round(got.head)}px tall`);
  for (const x of await axe(page)) {
    if (x.id === 'color-contrast' || x.impact === 'critical' || x.impact === 'serious') fail(`${p} at 375: axe ${x.id} (${x.impact}) on ${x.nodes.join(' | ')}`);
  }
  await ctx.close();
}

// ---- Trip detail and the statement (11 Nov): open by keyboard, Escape closes, focus comes back.
if (!QA) {
  {
    const { ctx, page } = await open(browser, 'driver', '/driver/trips');
    const btn = page.locator('.tr-open__btn').first();
    if (!(await btn.count())) fail('/driver/trips: no trip row opens its trip');
    else {
      await btn.focus();
      await page.keyboard.press('Enter');
      const sheet = await page.waitForSelector('[data-testid="trip-detail"] [data-testid="trip-fare-lines"]', { timeout: 5000 }).catch(() => null);
      if (!sheet) fail('/driver/trips: Enter on a row did not open the trip with its fare lines');
      else {
        const text = await page.locator('[data-testid="trip-detail"]').innerText();
        for (const w of ['Fare', 'Platform fee', 'Tips', 'You earned', 'Distance', 'Duration', 'Paid', 'Rider', 'Report a problem']) {
          if (!text.includes(w)) fail(`/driver/trips: the trip detail has no "${w}"`);
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        if (await page.locator('[data-testid="trip-detail"]').count()) fail('/driver/trips: Escape did not close the trip');
        if (!(await page.evaluate(() => document.activeElement?.classList.contains('tr-open__btn')))) fail('/driver/trips: focus did not go back to the row');
      }
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, 'driver', '/driver/earnings');
    const view = page.getByRole('button', { name: 'View' }).first();
    await view.focus();
    await page.keyboard.press('Enter');
    const head = await page.waitForSelector('[data-testid="statement-sheet"]', { timeout: 5000 }).catch(() => null);
    if (!head) fail('/driver/earnings: View did not open the statement');
    else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      if (await page.locator('[data-testid="statement-sheet"]').count()) fail('/driver/earnings: Escape did not close the statement');
      if (!(await page.evaluate(() => document.activeElement?.textContent?.trim() === 'View'))) fail('/driver/earnings: focus did not go back to View');
    }
    await ctx.close();
  }
}

// ---- Driver support (11 Nov): the driver header and the driver's topics, no rider questions.
{
  const { ctx, page } = await open(browser, 'driver', '/driver/support');
  const got = await page.evaluate(() => ({
    head: !!document.querySelector('.dr-head .apm-btn') && !!document.querySelector('.dr-head .dr-go'),
    text: document.body.innerText,
  }));
  if (!got.head) fail('/driver/support: no driver header (status, Go online, profile)');
  for (const t of ['Earnings and payouts', 'Documents and expiry', 'Platform fee', 'Trips and fares', 'Safety and SOS', 'Your account']) {
    if (!got.text.includes(t)) fail(`/driver/support: no "${t}" topic`);
  }
  if (/apply to drive/i.test(got.text)) fail('/driver/support: shows "How do I apply to drive?"');
  await ctx.close();
}

// ---- An older setup address opens its step (11 Nov).
{
  const { ctx, page } = await open(browser, 'driver', '/driver/setup/licence');
  if (!page.url().endsWith('/driver/setup/identity')) fail(`/driver/setup/licence went to ${page.url().replace(SITE, '')}`);
  await ctx.close();
}

await browser.close();
writeFileSync(process.env.V2_REPORT || 'v2-report.json', JSON.stringify(report, null, 1));
console.log('visual', JSON.stringify(report.visual));
console.log('empty charts', JSON.stringify(report.empty));
console.log('axe pages with findings', Object.entries(report.axe).filter(([, v]) => v.length).length);
if (failures.length) {
  console.log(`check-driver-v2: ${failures.length} failure(s)`);
  for (const f of failures) console.log(' -', f);
  process.exit(1);
}
console.log('check-driver-v2: pass');
