// Rendered gate for the public site against the approved design of
// 2026-11-07 (design/website-2026-11-07). Exits 1 on any failure:
//
//   font sizes   a computed size outside {14,16,20,22,28,32,40}px (22 and 32
//                only under 768px; Cinzel 20 only in the header)
//   weights      anything but 400 or 600
//   family       Latin text not drawn in Inter (the Cinzel name excepted)
//   numbers      currency followed by a digit, or a 4-6 digit number, in the
//                visible text of a marketing page (the © year excepted)
//   banned       Hyderabad, UPI, Aadhaar, Telugu, हिन्दी, తెలుగు
//   logo         the header emblem not visible at load
//   fit          main content scrolls on a content page at 1440x900/1366x768
//   see fares    "See fares" below the fold at 1440x900, 1366x768, 390x844
//   sideways     horizontal scroll at 360, 390, 768, 1024 or 1440
//   visual       more than 3% of pixels differ from screenshots/*.png at
//                1440x900 by pixelmatch (diff images in DIFFS, default
//                layout-diff/)
//
//   SITE=http://localhost:3100 npm run check-layout
//   SHOTS=dir also saves the contact sheet (1440x900 and 390x844, light and
//   dark, Telugu at 390).
import { chromium } from 'playwright-core';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SITE = process.env.SITE || 'http://localhost:3100';
const SHOTS = process.env.SHOTS;
const DIFFS = process.env.DIFFS || 'layout-diff';
const REF = path.resolve('../../design/website-2026-11-07/screenshots');
const FIT = ['/ride', '/drive', '/safety', '/about', '/help', '/sign-up', '/sign-in'];
const PAGES = ['/', ...FIT];
const REF_FOR = {
  '/': 'Home.png', '/ride': 'Ride.png', '/drive': 'Drive.png', '/safety': 'Safety.png',
  '/about': 'About.png', '/help': 'Help.png', '/sign-up': 'SignUp.png',
};
// The reference homepage shows the app band (rows 1628-1878); it stays off
// until the store listings exist, so those rows are cut from the reference.
const REF_CUT = { '/': [1628, 1878] };
// Logo artwork: the reference draws logo.jpg, the brief has us use the
// repo's vector logo, so these boxes (x, y, w, h) are not compared: About's
// logo panel, and on every page the header and footer emblems (measured).
const REF_MASK = { '/about': [[100, 125, 596, 408]] };
const SIZES = new Set([14, 16, 20, 22, 28, 32, 40]);
const PHONE_ONLY = new Set([22, 32]);
const NUMBERS = /[₹$€£]\s?\d|\b\d{4,6}\b/;
const BANNED = /Hyderabad|\bUPI\b|Aadhaar|Telugu|हिन्दी|తెలుగు/;
const MAX_DIFF = 0.03;
const market = (code, name, calling_code, currency, currency_symbol, distance_unit, lengths) => ({
  code, name, calling_code, currency, currency_symbol, symbol_position: 'prefix', distance_unit, national_number_lengths: lengths,
});
const COUNTRIES = {
  default_country: 'IN',
  countries: [market('IN', 'India', '91', 'INR', '₹', 'km', [10]), market('US', 'United States', '1', 'USD', '$', 'mi', [10])],
};

const failures = [];
const fail = (msg) => failures.push(msg);

const browser = await chromium.launch(process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });

async function open(p, width, height, { theme = 'light', lang = 'en' } = {}) {
  // An Indian browser, so sign-up preselects +91 as in the reference, and the
  // two public lookups the forms make answered from a fixture: the gate runs
  // without a backend.
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-IN' });
  await ctx.route('**/pricing/countries/**', (r) => r.fulfill({ json: COUNTRIES }));
  await ctx.route('**/pricing/zones/**', (r) => r.fulfill({ json: { zones: [] } }));
  await ctx.addInitScript(({ theme, lang }) => {
    try {
      localStorage.setItem('sg-theme', theme);
      localStorage.setItem('sg-language', lang);
    } catch {}
  }, { theme, lang });
  const page = await ctx.newPage();
  await page.goto(SITE + p, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  return { page, ctx };
}

// Everything the gate reads from one rendered page.
const measure = (page) => page.evaluate(({ phone }) => {
  const vis = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0 && !el.closest('[aria-hidden="true"] *, .sr-only, .skip-link');
  };
  const sizes = [], weights = [];
  let n = 0;
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())
      || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
    if (!own || !vis(el) || el.closest('.gm-style')) continue;
    const s = getComputedStyle(el);
    const px = parseFloat(s.fontSize);
    const tag = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent || '').trim().slice(0, 24)}"`;
    const cinzel = /Cinzel/.test(s.fontFamily) && el.closest('header') && px === 20;
    if (!cinzel && (!SIZES_.includes(px) || (!phone && PHONE_.includes(px)))) sizes.push(`${tag} ${px}px`);
    if (!['400', '600'].includes(s.fontWeight)) weights.push(`${tag} ${s.fontWeight}`);
    el.setAttribute('data-gate-text', String(n++));
  }
  const brand = document.querySelector('.s-brand__mark');
  const name = document.querySelector('.s-brand__name');
  const header = document.querySelector('header');
  const main = document.querySelector('main');
  const r = brand?.getBoundingClientRect();
  const fares = [...document.querySelectorAll('button, a')]
    .find((b) => /^\s*See fares\s*$/.test(b.textContent || '') && vis(b));
  const text = document.body.innerText.replace(/©\s*\d{4}/g, '');
  return {
    sizes: sizes.slice(0, 6), weights: weights.slice(0, 6),
    logo: !!brand && vis(brand) && !!name && vis(name) && r.top >= 0 && r.bottom <= innerHeight,
    header: header ? header.getBoundingClientRect().height : 0,
    main: main ? main.getBoundingClientRect().height : 0,
    page: document.documentElement.scrollHeight,
    sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    seeFares: fares ? Math.round(fares.getBoundingClientRect().bottom + scrollY) : null,
    number: (text.match(window.NUMBERS_) || [null])[0],
    banned: (text.match(window.BANNED_) || [null])[0],
  };
}, { phone: page.viewportSize().width < 768 });

async function prime(page) {
  await page.evaluate(({ sizes, phone, numbers, banned }) => {
    window.SIZES_ = sizes; window.PHONE_ = phone;
    window.NUMBERS_ = new RegExp(numbers); window.BANNED_ = new RegExp(banned);
  }, { sizes: [...SIZES], phone: [...PHONE_ONLY], numbers: NUMBERS.source, banned: BANNED.source });
  // The page functions read these names unqualified.
  await page.evaluate(() => { globalThis.SIZES_ = window.SIZES_; globalThis.PHONE_ = window.PHONE_; });
}

// The font each text element is actually drawn in, from Chrome itself.
async function families(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-gate-text]' });
  const wrong = [];
  for (const nodeId of nodeIds) {
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    if (!fonts.length) continue;
    const used = fonts.map((f) => f.familyName);
    const { attributes } = await cdp.send('DOM.getAttributes', { nodeId });
    const cls = attributes[attributes.indexOf('class') + 1] || '';
    if (/s-brand__name/.test(cls)) continue;
    if (used.some((f) => !/^Inter/.test(f))) wrong.push(`${cls.split(' ')[0] || 'node'} ${used.join('+')}`);
  }
  await cdp.detach();
  return wrong.slice(0, 6);
}

// Share of pixels that differ from the reference: pixelmatch at its default
// threshold (0.1), not counting anti-aliased pixels, so a glyph edge that
// Linux and Windows rasterise differently is not a difference. Rows the
// reference shows but this build deliberately omits are cut from the
// reference; masked boxes (logo artwork) are not compared.
function diff(shot, refFile, cut, mask) {
  const a = PNG.sync.read(readFileSync(refFile));
  const b = PNG.sync.read(shot);
  const W = a.width;
  const H = cut ? a.height - (cut[1] - cut[0]) : a.height;
  const ref = new PNG({ width: W, height: H });
  if (cut) {
    a.data.copy(ref.data, 0, 0, cut[0] * W * 4);
    a.data.copy(ref.data, cut[0] * W * 4, cut[1] * W * 4);
  } else a.data.copy(ref.data);
  const ours = new PNG({ width: W, height: H });
  ours.data.fill(0);
  for (let y = 0; y < Math.min(H, b.height); y++) b.data.copy(ours.data, y * W * 4, y * b.width * 4, y * b.width * 4 + Math.min(W, b.width) * 4);
  let hidden = 0;
  for (const [mx, my, mw, mh] of mask) {
    for (let y = Math.max(0, my); y < Math.min(H, my + mh); y++) {
      const from = (y * W + Math.max(0, mx)) * 4, to = (y * W + Math.min(W, mx + mw)) * 4;
      ref.data.copy(ours.data, from, from, to);
      hidden += (to - from) / 4;
    }
  }
  const out = new PNG({ width: W, height: H });
  const bad = pixelmatch(ref.data, ours.data, out.data, W, H, { threshold: 0.1, includeAA: false });
  return { share: bad / (W * H - hidden), png: PNG.sync.write(out) };
}

const heights = {};
const AT = [[1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844], [360, 740]];
for (const p of PAGES) {
  for (const [w, h] of AT) {
    const { page, ctx } = await open(p, w, h);
    await prime(page);
    const m = await measure(page);
    const at = `${p} at ${w}x${h}`;
    heights[`${p} ${w}`] = m.page;
    if (!m.logo) fail(`${at}: the header logo is not visible at load`);
    if (m.sideways) fail(`${at}: scrolls sideways`);
    if (m.sizes.length) fail(`${at}: font size off the scale: ${m.sizes.join('; ')}`);
    if (m.weights.length) fail(`${at}: weight other than 400/600: ${m.weights.join('; ')}`);
    if (m.number) fail(`${at}: a number in the copy: "${m.number}"`);
    if (m.banned) fail(`${at}: banned word in the copy: "${m.banned}"`);
    const desk = w >= 1366;
    if (desk && FIT.includes(p) && m.main > h - m.header) {
      fail(`${at}: main content is ${Math.round(m.main)}px, taller than the ${Math.round(h - m.header)}px under the header`);
    }
    if (p === '/' && (desk || w === 390) && !(m.seeFares && m.seeFares <= h)) {
      fail(`${at}: "See fares" is below the fold (${m.seeFares})`);
    }
    if (w === 1440) {
      const wrong = await families(page);
      if (wrong.length) fail(`${at}: text not drawn in Inter: ${wrong.join('; ')}`);
      if (REF_FOR[p] && existsSync(path.join(REF, REF_FOR[p]))) {
        const shot = await page.screenshot({ fullPage: true });
        const emblems = await page.evaluate(() => ['.s-brand__mark', '.s-footer__mark'].map((q) => {
          const r = document.querySelector(q).getBoundingClientRect();
          return [Math.floor(r.left), Math.floor(r.top + scrollY), Math.ceil(r.width), Math.ceil(r.height)];
        }));
        const d = diff(shot, path.join(REF, REF_FOR[p]), REF_CUT[p], [...(REF_MASK[p] || []), ...emblems]);
        mkdirSync(DIFFS, { recursive: true });
        const base = p === '/' ? 'home' : p.slice(1);
        writeFileSync(path.join(DIFFS, `${base}-diff.png`), d.png);
        writeFileSync(path.join(DIFFS, `${base}-ours.png`), shot);
        heights[`${p} diff`] = Number((d.share * 100).toFixed(2));
        if (d.share > MAX_DIFF) fail(`${at}: ${(d.share * 100).toFixed(1)}% of pixels differ from ${REF_FOR[p]} (max 3%)`);
      }
    }
    await ctx.close();
  }
}

if (SHOTS) {
  mkdirSync(SHOTS, { recursive: true });
  const runs = [];
  for (const theme of ['light', 'dark']) for (const [w, h] of [[1440, 900], [390, 844]]) runs.push({ w, h, theme, lang: 'en' });
  runs.push({ w: 390, h: 844, theme: 'light', lang: 'te' });
  for (const p of PAGES) for (const r of runs) {
    const { page, ctx } = await open(p, r.w, r.h, r);
    const name = `${p === '/' ? 'home' : p.slice(1)}-${r.w}-${r.theme}${r.lang === 'te' ? '-te' : ''}.png`;
    await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
    await ctx.close();
  }
}
await browser.close();

if (process.env.HEIGHTS) writeFileSync(process.env.HEIGHTS, JSON.stringify(heights, null, 2));
for (const f of failures) console.log(`FAIL ${f}`);
console.log(failures.length ? `${failures.length} layout failures` : 'layout gate: pass');
process.exit(failures.length ? 1 : 0);
