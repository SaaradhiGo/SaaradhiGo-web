// Rendered gate for the public site against the approved design of
// 2026-11-07 (design/website-2026-11-07). Exits 1 on any failure:
//
//   font sizes   a computed size outside {14,16,20,28,40}px (14 Nov; until then 22 and 32
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
//                layout-diff/); Home against baseline/Home.png, recorded
//                when the Schedule switch was hidden (AUDIT §28.10)
//   languages    sizes, weights, family, fit, fold, sideways and logo again in
//                te, hi and es at 1440x900, 1366x768, 390x844 and 360x740
//   english      a string from design/i18n/website.en.json visible on a te,
//                hi or es page (text, aria-label, placeholder, title, <title>)
//                where the files translate it
//   schedule     a Ride now / Schedule control visible (scheduledRides is off)
//   404          an unknown URL without the header logo and the footer
//   first html   with the sg-language cookie set to te, hi or es, the HTML the
//                server sends for a marketing page lacks the translated H1, or
//                its <html lang> or <title> differs from the page after load
//
//   SITE=http://localhost:3100 npm run check-layout
//   SHOTS=dir also saves the contact sheet (1440x900 and 390x844: en light
//   and dark; te, hi and es light). BASELINE=1 rewrites baseline/Home.png.
import { chromium } from 'playwright-core';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SITE = process.env.SITE || 'http://localhost:3100';
const SHOTS = process.env.SHOTS;
const DIFFS = process.env.DIFFS || 'layout-diff';
const REF = path.resolve('../../design/website-2026-11-07/screenshots');
const BASE = path.resolve('../../design/website-2026-11-07/baseline');
const I18N = path.resolve('src/i18n/website');
const LANGS = ['te', 'hi', 'es'];
// English that a translated page must not show: every string the files
// translate differently, per language.
const english = JSON.parse(readFileSync(path.join(I18N, 'en.json'), 'utf8'));
const LEAKS = Object.fromEntries(LANGS.map((l) => {
  const tr = JSON.parse(readFileSync(path.join(I18N, `${l}.json`), 'utf8'));
  return [l, Object.keys(english).filter((k) => tr[k] && tr[k] !== k)];
}));
const MISSING_PAGE = '/this-page-does-not-exist';
const FIT = ['/ride', '/drive', '/safety', '/about', '/help', '/sign-up', '/sign-in'];
const PAGES = ['/', ...FIT];
const REF_FOR = {
  '/': '../baseline/Home.png', '/ride': 'Ride.png', '/drive': 'Drive.png', '/safety': 'Safety.png',
  '/about': 'About.png', '/help': 'Help.png', '/sign-up': 'SignUp.png',
};
// Home is compared with its own baseline (the reference less the Schedule
// switch and the app band, which stays off until the store listings exist).
const REF_CUT = {};
// Logo artwork: the reference draws logo.jpg, the brief has us use the
// repo's vector logo, so these boxes (x, y, w, h) are not compared: About's
// logo panel, and on every page the header and footer emblems (measured).
const REF_MASK = { '/about': [[100, 125, 596, 408]] };
// 14 Nov (owner): the scale is 14/16/20/28/40 everywhere; phones step display and heading down a
// level (40 -> 28, 28 -> 20) instead of the 32 and 22 they used to use.
const SIZES = new Set([14, 16, 20, 28, 40]);
const PHONE_ONLY = new Set([]);
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

// A page whose script never yields (an endless loop) must fail the gate, not
// hang it: each page gets 30s to answer, the whole run 40 minutes.
setTimeout(() => {
  console.log('FAIL the layout gate did not finish in 40 minutes');
  process.exit(1);
}, 40 * 60 * 1000).unref();
const answers = (page, work) => Promise.race([
  work,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${page.url()} did not answer in 30s (frozen page?)`)), 30000)),
]);

const browser = await chromium.launch(process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });

async function open(p, width, height, { theme = 'light', lang = 'en' } = {}) {
  // An Indian browser, so sign-up preselects +91 as in the reference, and the
  // two public lookups the forms make answered from a fixture: the gate runs
  // without a backend.
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-IN' });
  await ctx.route('**/pricing/countries/**', (r) => r.fulfill({ json: COUNTRIES }));
  await ctx.route('**/pricing/zones/**', (r) => r.fulfill({ json: { zones: [] } }));
  await ctx.addCookies([{ name: 'sg-language', value: lang, url: SITE }]);
  await ctx.addInitScript(({ theme, lang }) => {
    try {
      localStorage.setItem('sg-theme', theme);
      localStorage.setItem('sg-language', lang);
    } catch {}
  }, { theme, lang });
  const page = await ctx.newPage();
  await page.goto(SITE + p, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await answers(page, page.evaluate(() => document.fonts.ready));
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
  const fares = [...document.querySelectorAll('.s-book__go')].find(vis);
  const notice = document.querySelector('.s-notice');
  const schedule = [...document.querySelectorAll('.s-book__mode, button, a')]
    .find((b) => vis(b) && (b.classList.contains('s-book__mode') || /^\s*Schedule\s*$/.test(b.textContent || '')));
  const strings = new Set([document.title]);
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    for (const c of el.childNodes) if (c.nodeType === 3 && c.textContent.trim()) strings.add(c.textContent.replace(/\s+/g, ' ').trim());
    for (const a of ['aria-label', 'placeholder', 'title']) if (el.getAttribute(a)) strings.add(el.getAttribute(a).trim());
  }
  const leaks = (window.LEAKS_ || []).filter((k) => strings.has(k));
  // 13 Nov (owner): the request mock-ups show example numbers from the Hyderabad rate card,
  // marked "Example" (data-example). Those, and only those, may hold a number or the city.
  let text = document.body.innerText.replace(/©\s*\d{4}/g, '');
  for (const ex of document.querySelectorAll('[data-example]')) text = text.split(ex.innerText).join(' ');
  return {
    sizes: sizes.slice(0, 6), weights: weights.slice(0, 6),
    logo: !!brand && vis(brand) && !!name && vis(name) && r.top >= 0 && r.bottom <= innerHeight,
    header: header ? header.getBoundingClientRect().height : 0,
    notice: notice ? notice.getBoundingClientRect().height : 0,
    schedule: schedule ? (schedule.textContent || '').trim() : null,
    leaks: leaks.slice(0, 6),
    footer: !!document.querySelector('footer .s-footer__mark'),
    main: main ? main.getBoundingClientRect().height : 0,
    page: document.documentElement.scrollHeight,
    sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    seeFares: fares ? Math.round(fares.getBoundingClientRect().bottom + scrollY) : null,
    number: (text.match(window.NUMBERS_) || [null])[0],
    banned: (text.match(window.BANNED_) || [null])[0],
  };
}, { phone: page.viewportSize().width < 768 });

async function prime(page, lang = 'en') {
  await page.evaluate(({ sizes, phone, numbers, banned, leaks }) => {
    window.SIZES_ = sizes; window.PHONE_ = phone;
    window.NUMBERS_ = new RegExp(numbers); window.BANNED_ = new RegExp(banned);
    window.LEAKS_ = leaks;
  }, { sizes: [...SIZES], phone: [...PHONE_ONLY], numbers: NUMBERS.source, banned: BANNED.source, leaks: LEAKS[lang] || [] });
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
    // Inter for Latin; Noto Sans Telugu and Devanagari draw only their scripts.
    if (used.some((f) => !/^(Inter|Noto Sans Telugu|Noto Sans Devanagari)/.test(f))) wrong.push(`${cls.split(' ')[0] || 'node'} ${used.join('+')}`);
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
// What each page shows after load, per language, for the first-HTML check.
const LOADED = {};
const AT = [[1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844], [360, 740]];
const AT_LANG = [[1440, 900], [1366, 768], [390, 844], [360, 740]];
const RUNS = [
  ...PAGES.flatMap((p) => AT.map(([w, h]) => ({ p, w, h, lang: 'en' }))),
  ...LANGS.flatMap((lang) => PAGES.flatMap((p) => AT_LANG.map(([w, h]) => ({ p, w, h, lang })))),
  ...['en', ...LANGS].flatMap((lang) => [[1440, 900], [390, 844]].map(([w, h]) => ({ p: MISSING_PAGE, w, h, lang }))),
];
for (const { p, w, h, lang } of RUNS) {
  const { page, ctx } = await open(p, w, h, { lang });
  await prime(page, lang);
  const m = await answers(page, measure(page));
  const at = `${p}${lang === 'en' ? '' : ` [${lang}]`} at ${w}x${h}`;
  heights[`${p} ${lang} ${w}`] = m.page;
  if (!m.logo) fail(`${at}: the header logo is not visible at load`);
  if (p === MISSING_PAGE) {
    if (!m.footer) fail(`${at}: the 404 page has no footer`);
    await ctx.close();
    continue;
  }
  if (m.sideways) fail(`${at}: scrolls sideways`);
  if (m.sizes.length) fail(`${at}: font size off the scale: ${m.sizes.join('; ')}`);
  if (m.weights.length) fail(`${at}: weight other than 400/600: ${m.weights.join('; ')}`);
  if (m.number) fail(`${at}: a number in the copy: "${m.number}"`);
  if (m.banned) fail(`${at}: banned word in the copy: "${m.banned}"`);
  if (m.leaks.length) fail(`${at}: English left untranslated: ${m.leaks.map((x) => `"${x}"`).join('; ')}`);
  if (m.schedule !== null) fail(`${at}: a Schedule control is visible ("${m.schedule}") while scheduledRides is off`);
  const desk = w >= 1366;
  // The notice (te/hi/es) sits between the header and the page, so it counts.
  const room = h - m.header - m.notice;
  if (desk && FIT.includes(p) && m.main > room) {
    fail(`${at}: main content is ${Math.round(m.main)}px, taller than the ${Math.round(room)}px under the header`);
  }
  if (p === '/' && (desk || w === 390) && !(m.seeFares && m.seeFares <= h)) {
    fail(`${at}: "See fares" is below the fold (${m.seeFares})`);
  }
  if (w === 1440) {
    LOADED[`${p} ${lang}`] = await page.evaluate(() => ({
      h1: (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim(),
      title: document.title,
      lang: document.documentElement.lang,
    }));
    const wrong = await families(page);
    if (wrong.length) fail(`${at}: text not drawn in Inter or Noto: ${wrong.join('; ')}`);
  }
  if (w === 1440 && lang === 'en' && REF_FOR[p]) {
    const shot = await page.screenshot({ fullPage: true });
    const emblems = await page.evaluate(() => ['.s-brand__mark', '.s-footer__mark'].map((q) => {
      const r = document.querySelector(q).getBoundingClientRect();
      return [Math.floor(r.left), Math.floor(r.top + scrollY), Math.ceil(r.width), Math.ceil(r.height)];
    }));
    // 13 Nov: the footer follows the launch-approvals brief (link columns, the operating company,
    // country and language), which the 7 Nov references predate. It is not compared; the rest of
    // the page still is.
    emblems.push(await page.evaluate(() => {
      const r = document.querySelector('footer.s-footer').getBoundingClientRect();
      // 13 Nov: 16px above it too, where a column the brief lengthened moves the footer down.
      return [0, Math.floor(r.top + scrollY) - 16, Math.ceil(document.documentElement.scrollWidth), 100000];
    }));
    // 13 Nov (owner): one gold button per screen, so the nav's "Sign up" is quiet on pages with
    // their own primary; the 7 Nov references show it gold. The Log in / Sign up pair is not compared.
    for (const box of await page.evaluate(() => [...document.querySelectorAll('.s-header__login, .s-header__signup')].map((e) => {
      const r = e.getBoundingClientRect();
      return [Math.floor(r.left), Math.floor(r.top + scrollY), Math.ceil(r.width), Math.ceil(r.height)];
    }))) emblems.push(box);
    // 13 Nov (owner): the Drive page's request card no longer floats over a photo placeholder
    // (a design note that shipped live); it stands on a plain panel with example numbers. The
    // 7 Nov reference predates that, so that column is not compared; the rest of the page is.
    // Likewise /ride's fare ticket gained the example amount (owner, 13 Nov), which lengthens the
    // ticket column; that column is not compared, the steps and "Book a ride" still are.
    if (p === '/drive' || p === '/ride') {
      emblems.push(await page.evaluate((sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return [Math.floor(r.left), Math.floor(r.top + scrollY), Math.ceil(r.width), Math.ceil(r.height)];
      }, p === '/drive' ? '.s-request-wrap' : '.s-stack'));
    }
    if (p === '/' && process.env.BASELINE) {
      mkdirSync(BASE, { recursive: true });
      writeFileSync(path.join(BASE, 'Home.png'), shot);
    }
    if (existsSync(path.join(REF, REF_FOR[p]))) {
      const d = diff(shot, path.join(REF, REF_FOR[p]), REF_CUT[p], [...(REF_MASK[p] || []), ...emblems]);
      mkdirSync(DIFFS, { recursive: true });
      const base = p === '/' ? 'home' : p.slice(1);
      writeFileSync(path.join(DIFFS, `${base}-diff.png`), d.png);
      writeFileSync(path.join(DIFFS, `${base}-ours.png`), shot);
      heights[`${p} diff`] = Number((d.share * 100).toFixed(2));
      if (d.share > MAX_DIFF) fail(`${at}: ${(d.share * 100).toFixed(1)}% of pixels differ from ${REF_FOR[p]} (max 3%)`);
    } else fail(`${at}: reference ${REF_FOR[p]} is missing`);
  }
  await ctx.close();
}

// The server renders in the cookie's language, so the first HTML already
// matches the page after load: nothing switches (owner, 2026-11-07).
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const text = (html) => html.replace(/<[^>]*>/g, '')
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#'
    ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    : ENTITIES[e] ?? m))
  .replace(/\s+/g, ' ').trim();
for (const lang of LANGS) for (const p of PAGES) {
  const at = `${p} [${lang}] first HTML`;
  const html = await fetch(SITE + p, { headers: { cookie: `sg-language=${lang}` }, signal: AbortSignal.timeout(30000) })
    .then((r) => r.text()).catch(() => '');
  const h1 = text((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
  const title = text((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
  const htmlLang = (html.match(/<html[^>]*\slang="([^"]*)"/) || [])[1];
  const loaded = LOADED[`${p} ${lang}`];
  const english = LOADED[`${p} en`];
  if (!loaded || !english) { fail(`${at}: the page did not load in the browser`); continue; }
  if (!h1) fail(`${at}: no H1 in the server's HTML`);
  else if (h1 !== loaded.h1 || h1 === english.h1) fail(`${at}: H1 is "${h1}", the page shows "${loaded.h1}" after load`);
  if (htmlLang !== loaded.lang) fail(`${at}: <html lang="${htmlLang}">, "${loaded.lang}" after load`);
  if (title !== loaded.title) fail(`${at}: <title> is "${title}", "${loaded.title}" after load`);
}

if (SHOTS) {
  mkdirSync(SHOTS, { recursive: true });
  const runs = [];
  for (const theme of ['light', 'dark']) for (const [w, h] of [[1440, 900], [390, 844]]) runs.push({ w, h, theme, lang: 'en' });
  for (const lang of LANGS) for (const [w, h] of [[1440, 900], [390, 844]]) runs.push({ w, h, theme: 'light', lang });
  for (const p of [...PAGES, MISSING_PAGE]) for (const r of runs) {
    const { page, ctx } = await open(p, r.w, r.h, r);
    const slug = p === '/' ? 'home' : p === MISSING_PAGE ? '404' : p.slice(1);
    const name = `${slug}-${r.w}-${r.theme}${r.lang === 'en' ? '' : `-${r.lang}`}.png`;
    await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
    await ctx.close();
  }
}
await browser.close();

if (process.env.HEIGHTS) writeFileSync(process.env.HEIGHTS, JSON.stringify(heights, null, 2));
for (const f of failures) console.log(`FAIL ${f}`);
console.log(failures.length ? `${failures.length} layout failures` : 'layout gate: pass');
process.exit(failures.length ? 1 : 0);
