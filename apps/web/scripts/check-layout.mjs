// Rendered layout gate for the public site (owner, 2026-11-06): the header
// logo shows at load, content pages fit one screen, the homepage's booking
// button is above the fold, no sideways scroll, no text under 13px, no weight
// over 700, no Anek, no section padding over 48px. Exits 1 on any failure.
//
//   SITE=http://localhost:3100 npm run check-layout
//   SHOTS=dir also saves the contact sheet (1440x900 and 390x844, light and
//   dark, Telugu at 390); HEIGHTS=file writes each page's height.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SITE = process.env.SITE || 'http://localhost:3100';
const SHOTS = process.env.SHOTS;
const FIT = ['/ride', '/drive', '/safety', '/about', '/help', '/sign-up', '/sign-in'];
const PAGES = ['/', ...FIT];
const failures = [];
const fail = (msg) => failures.push(msg);

// Anek is gone from the source as well as from what the browser loads.
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
for (const f of [...walk('src'), ...walk('public/fonts')]) {
  if (/anek/i.test(f) || (/\.(css|tsx?|mjs)$/.test(f) && /anek/i.test(readFileSync(f, 'utf8')))) {
    fail(`Anek is still referenced: ${f}`);
  }
}

const browser = await chromium.launch(process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });

async function open(p, width, height, { theme = 'light', lang = 'en' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
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
const measure = (page) => page.evaluate(() => {
  const vis = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const header = document.querySelector('.hp-header');
  const logo = document.querySelector('.hp-nav__logo .sg-logo');
  const name = document.querySelector('.hp-nav__name');
  const main = document.querySelector('main');
  const byText = (re) => [...document.querySelectorAll('button, a')].find((b) => re.test(b.textContent || ''));
  const below = (el) => (el ? Math.round(el.getBoundingClientRect().bottom + scrollY) : null);
  const small = [], heavy = [], padded = [];
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && vis(el) && !el.closest('.sr-only, .skip-link')) {
      const s = getComputedStyle(el);
      if (parseFloat(s.fontSize) < 13) small.push(`${el.tagName.toLowerCase()}.${el.className} ${s.fontSize}`);
      if (Number(s.fontWeight) > 700) heavy.push(`${el.tagName.toLowerCase()}.${el.className} ${s.fontWeight}`);
    }
    if (main?.contains(el) || el.tagName === 'FOOTER') {
      const s = getComputedStyle(el);
      if (parseFloat(s.paddingTop) > 48 || parseFloat(s.paddingBottom) > 48) {
        padded.push(`${el.tagName.toLowerCase()}.${el.className} ${s.paddingTop}/${s.paddingBottom}`);
      }
    }
  }
  let anek = false;
  for (const sheet of document.styleSheets) {
    try { for (const r of sheet.cssRules) if (/anek/i.test(r.cssText)) anek = true; } catch {}
  }
  const footer = document.querySelector('footer');
  return {
    logo: !!logo && vis(logo) && !!name && vis(name) && !logo.closest('[data-hidden="true"]'),
    header: header ? header.getBoundingClientRect().height : 0,
    main: main ? main.getBoundingClientRect().height : 0,
    page: document.documentElement.scrollHeight,
    footer: footer ? Math.round(footer.getBoundingClientRect().height) : 0,
    sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    seeFares: below(byText(/^\s*See fares\s*$/)),
    create: below(byText(/^\s*Create account\s*$/)),
    small: small.slice(0, 5), heavy: heavy.slice(0, 5), padded: padded.slice(0, 5), anek,
  };
});

const heights = {};
const SIZES = [[1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844], [360, 740]];
for (const p of PAGES) {
  for (const [w, h] of SIZES) {
    const { page, ctx } = await open(p, w, h);
    const m = await measure(page);
    const at = `${p} at ${w}x${h}`;
    heights[`${p} ${w}`] = { page: m.page, main: Math.round(m.main), footer: m.footer };
    if (!m.logo) fail(`${at}: the header logo is not visible at load`);
    if (m.sideways) fail(`${at}: scrolls sideways`);
    if (m.small.length) fail(`${at}: text under 13px: ${m.small.join('; ')}`);
    if (m.heavy.length) fail(`${at}: weight over 700: ${m.heavy.join('; ')}`);
    if (m.padded.length) fail(`${at}: padding over 48px: ${m.padded.join('; ')}`);
    if (m.anek) fail(`${at}: a stylesheet still names Anek`);
    const desk = w >= 1366;
    if (desk && FIT.includes(p) && m.main > h - m.header) {
      fail(`${at}: content is ${Math.round(m.main)}px, more than the ${h - m.header}px screen`);
    }
    if (p === '/' && (desk || w === 390) && !(m.seeFares && m.seeFares <= h)) {
      fail(`${at}: "See fares" is below the fold (${m.seeFares})`);
    }
    if (p === '/sign-up' && desk && !(m.create && m.create <= h)) {
      fail(`${at}: "Create account" is below the fold (${m.create})`);
    }
    if (p === '/' && w === 1440 && m.page > 2400) fail(`${at}: home is ${m.page}px, over 2400`);
    if (p === '/' && w === 390 && m.page > 3000) fail(`${at}: home is ${m.page}px, over 3000`);
    if (w === 1440 && m.footer > 200) fail(`${at}: footer is ${m.footer}px, over 200`);
    if (w === 390 && m.footer > 280) fail(`${at}: footer is ${m.footer}px, over 280`);
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
