/**
 * Responsive sweep (owner brief, 17 Nov 2026): every screen must work at ANY size. Each page is
 * loaded once, then resized through every width from 320 to 1920 in 10px steps at heights 568,
 * 844 and 1200; phone landscape (heights 320-430); 200% browser zoom of common laptops; and the
 * phone's largest text size. At every step it fails on: sideways scroll, overlapping content,
 * clipped or cut-off text, squashed or stretched images, tap targets under 44px (24px with a mouse).
 *
 *   SITE=http://localhost:3100 FIXTURES=1 node scripts/sweep-responsive.mjs          # CI gate pages
 *   SITE=https://web-qa-800c.up.railway.app PAGES=/,/fares REPORT=1 node scripts/...  # report only
 *
 * Intentional layers (pins and the status card on the hero map) sit inside `data-overlay-host`.
 * Writes sweep-out/<page>-<w>x<h>.png for the first failure of each kind on each page.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const SITE = (process.env.SITE || 'http://localhost:3100').replace(/\/$/, '');
const OUT = process.env.SWEEP_OUT || 'sweep-out';
const STEP = Number(process.env.STEP || 10);
// The screens built to the standard. Phase 2 adds every screen here as it is rebuilt.
const GATED = ['/', '/safety', '/ride/choose?d=gate', '/design'];
const PAGES = (process.env.PAGES ? process.env.PAGES.split(',') : GATED);
const MARKETS = (process.env.MARKETS || 'IN,US').split(',');
const REPORT = process.env.REPORT === '1';
fs.mkdirSync(OUT, { recursive: true });

const sizes = [];
for (let w = 320; w <= 1920; w += STEP) for (const h of [568, 844, 1200]) sizes.push({ w, h, kind: 'size' });
for (let w = 480; w <= 960; w += STEP * 2) for (const h of [320, 390]) sizes.push({ w, h, kind: 'phone landscape' });
for (const [w, h] of [[1280, 800], [1366, 768], [1440, 900], [1920, 1080]]) sizes.push({ w: Math.round(w / 2), h: Math.round(h / 2), kind: '200% zoom', dpr: 2 });

/** Runs in the page: every rule of the brief, returned as plain strings. */
function check({ touch }) {
  const vw = innerWidth, vh = innerHeight;
  const out = [];
  const skip = (el) => el.closest('.sr-only, .skip-link, .gm-style, [aria-hidden="true"], script, style, noscript, template');
  // Visually hidden content (clip rect or a 1px box) is for screen readers only.
  const hidden = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.clip && s.clip !== 'auto') return true;
      if (s.position === 'absolute' && p.offsetWidth <= 1 && p.offsetHeight <= 1) return true;
    }
    return false;
  };
  const shown = (el) => {
    if (skip(el) || hidden(el)) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = (el) => {
    const t = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    const c = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean)[0] : '';
    return `${el.tagName.toLowerCase()}${c ? '.' + c : ''}${t ? ` "${t}"` : ''}`;
  };
  // A box that scrolls sideways on purpose (tables, tab strips) may hold wider content.
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };

  if (document.scrollingElement.scrollWidth > vw + 1) out.push(`sideways scroll: page is ${document.scrollingElement.scrollWidth}px wide`);

  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.textContent.trim() || !shown(el)) continue;
    seen.add(el);
    texts.push(el);
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) out.push(`text off screen: ${name(el)} at ${Math.round(r.left)}..${Math.round(r.right)}`);
    // Text running past the edge of a box that clips (a map panel, a card).
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
      if (o.overflowX === 'auto' || o.overflowX === 'scroll' || o.overflowY === 'auto' || o.overflowY === 'scroll') break;
      const pr = p.getBoundingClientRect();
      if (r.left < pr.left - 1 || r.right > pr.right + 1 || r.top < pr.top - 1 || r.bottom > pr.bottom + 1) out.push(`cut-off text: ${name(el)} runs past ${name(p)}`);
      break;
    }
  }
  // Cut-off text: a box hiding overflow that its own text does not fit.
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue;
    const s = getComputedStyle(el);
    const hidesX = s.overflowX === 'hidden' || s.overflowX === 'clip';
    const hidesY = s.overflowY === 'hidden' || s.overflowY === 'clip';
    if (!hidesX && !hidesY) continue;
    const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    if (!own && !(el.children.length === 1 && el.firstElementChild.matches('span, b, strong, a'))) continue;
    if ((hidesX && el.scrollWidth > el.clientWidth + 1) || (hidesY && el.scrollHeight > el.clientHeight + 2)) {
      out.push(`cut-off text: ${name(el)} (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`);
    }
  }
  // Controls.
  const ctrls = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], summary')].filter(shown);
  const min = touch ? 44 : 24;
  for (const el of ctrls) {
    if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) continue;
    const r = el.getBoundingClientRect();
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p, li, td, .ui-body, .ui-small');
    if (inline) continue;
    const host = el.parentElement?.closest('a[href], button, label');
    const hr = host?.getBoundingClientRect();
    if ((r.width < min || r.height < min) && !(hr && hr.width >= min && hr.height >= min)) out.push(`tap target ${Math.round(r.width)}x${Math.round(r.height)}: ${name(el)}`);
    if (r.right > vw + 1 && !inScroller(el)) out.push(`control off screen: ${name(el)}`);
  }
  // Images keep their own shape.
  for (const img of document.querySelectorAll('img')) {
    if (!shown(img) || !img.naturalWidth) continue;
    const s = getComputedStyle(img);
    if (s.objectFit !== 'fill') continue;
    const r = img.getBoundingClientRect();
    const want = img.naturalWidth / img.naturalHeight, got = r.width / r.height;
    if (Math.abs(got / want - 1) > 0.03) out.push(`image ${got > want ? 'stretched' : 'squashed'}: ${name(img)} (${got.toFixed(2)} vs ${want.toFixed(2)})`);
  }
  // Overlaps between things a person reads or taps.
  const boxes = [...new Set([...ctrls, ...texts.filter((el) => el.matches('h1, h2, h3, h4, p, li, label, td, th, b, strong, span, div')), ...document.querySelectorAll('img, .ui-card, .ui-device')])]
    .filter(shown).filter((el) => !ctrls.some((c) => c !== el && c.contains(el)));
  // A wrapped inline element is several line boxes, not one rectangle across both lines.
  const rects = boxes.map((el) => (getComputedStyle(el).display === 'inline' ? [...el.getClientRects()] : [el.getBoundingClientRect()]));
  const hit = (ra, rb) => {
    for (const a of ra) for (const b of rb) {
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x > 2 && y > 2) return [x, y];
    }
    return null;
  };
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.contains(b) || b.contains(a)) continue;
      const o = hit(rects[i], rects[j]);
      if (!o) continue;
      const [x, y] = o;
      const ha = a.closest('[data-overlay-host]'), hb = b.closest('[data-overlay-host]');
      if (ha && ha === hb) continue;
      const pinned = (e) => { for (let q = e; q && q !== document.body; q = q.parentElement) { if (['fixed', 'sticky'].includes(getComputedStyle(q).position)) return true; } return false; };
      if ([a, b].some((e) => pinned(e) || e.closest('header, [role=dialog]'))) continue;
      out.push(`overlap: ${name(a)} and ${name(b)} (${Math.round(x)}x${Math.round(y)})`);
    }
  }
  return [...new Set(out)];
}

/** Android's largest text size (non-linear, up to 2x for body text), applied to every element. */
function bigText() {
  // Measure every element first, then apply, so a child is not scaled twice through inheritance.
  const all = [...document.querySelectorAll('body *')].map((el) => {
    const s = getComputedStyle(el);
    return [el, parseFloat(s.fontSize), parseFloat(s.lineHeight)];
  });
  for (const [el, f, lh] of all) {
    if (!f) continue;
    const k = f <= 16 ? 2 : Math.max(1.3, 2 - (f - 16) / 24);
    el.style.fontSize = `${(f * k).toFixed(1)}px`;
    if (lh) el.style.lineHeight = `${(lh * k).toFixed(1)}px`;
  }
}

async function open(browser, url, market, w, h, dpr = 1) {
  const touch = w <= 1024;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: false, hasTouch: touch,
    locale: market === 'US' ? 'en-US' : 'en-IN', timezoneId: market === 'US' ? 'America/Boise' : 'Asia/Kolkata', colorScheme: 'light' });
  await ctx.addCookies([{ name: 'sg-market', value: market, url: SITE }]);
  await ctx.addInitScript(() => {
    try {
      const from = { lat: 17.3616, lng: 78.4747, label: 'Charminar', short: 'Charminar' };
      sessionStorage.setItem('sg-ride-draft:gate', JSON.stringify({ from, to: { lat: 17.4474, lng: 78.3762, label: 'HITEC City', short: 'HITEC City' } }));
    } catch {}
  });
  if (process.env.FIXTURES === '1') {
    const { fixture } = await import('./fixtures/areas.mjs');
    await ctx.route(/\/api\/v1\/|\/api\/(rider|staff)\?to=/, async (route) => {
      const req = route.request();
      const u = req.url();
      const api = /\/api\/(rider|staff)\?to=/.test(u) ? `http://api.gate/api/v1${u.slice(u.indexOf('?to=') + 4)}` : u;
      let body = null;
      try { body = req.postDataJSON(); } catch {}
      const data = fixture(req.method(), api, body);
      await route.fulfill(data === null ? { status: 404, json: { error: 'no fixture' } } : { json: data });
    });
  }
  const page = await ctx.newPage();
  await page.goto(SITE + url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(url.includes('choose') ? 3000 : 800);
  return { ctx, page, touch };
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const results = [];
let failures = 0;
for (const url of PAGES) {
  for (const market of MARKETS) {
    const label = `${url} [${market}]`;
    const found = new Map();
    const note = async (page, s, issues) => {
      for (const i of issues) {
        const kind = i.split(':')[0];
        const key = `${kind}|${i.slice(0, 90)}`;
        if (found.has(key)) { found.get(key).at.push(`${s.w}x${s.h}`); continue; }
        found.set(key, { issue: i, kind: s.kind, at: [`${s.w}x${s.h}`] });
        if (![...found.values()].some((f) => f !== found.get(key) && f.issue.split(':')[0] === kind)) {
          await page.screenshot({ path: path.join(OUT, `${url.replace(/[^a-z0-9]+/gi, '_') || 'home'}-${market}-${s.w}x${s.h}.png`) }).catch(() => {});
        }
      }
    };
    // One load per device pixel ratio; then resize through every size.
    for (const dpr of [1, 2]) {
      const list = sizes.filter((s) => (s.dpr || 1) === dpr);
      const { ctx, page } = await open(browser, url, market, list[0].w, list[0].h, dpr);
      for (const s of list) {
        await page.setViewportSize({ width: s.w, height: s.h });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await note(page, s, await page.evaluate(check, { touch: s.w <= 1024 }));
      }
      await ctx.close();
    }
    // The phone's largest text size, across phone widths.
    {
      const { ctx, page } = await open(browser, url, market, 390, 844);
      await page.evaluate(bigText);
      for (let w = 320; w <= 430; w += STEP) {
        const s = { w, h: 844, kind: 'largest text' };
        await page.setViewportSize({ width: w, height: 844 });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await note(page, s, (await page.evaluate(check, { touch: true })).filter((i) => !i.startsWith('tap target')));
      }
      await ctx.close();
    }
    // Light by default: a phone set to dark still gets the light site unless the person chose dark.
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', locale: 'en-IN' });
      await ctx.addCookies([{ name: 'sg-market', value: market, url: SITE }]);
      const page = await ctx.newPage();
      await page.goto(SITE + url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      if (theme !== 'light') found.set('dark device', { issue: `dark device: the page opened in "${theme}", not light`, kind: 'device dark', at: ['390x844'] });
      await ctx.close();
    }
    const list = [...found.values()];
    failures += list.length;
    results.push({ page: url, market, issues: list });
    console.log(`${list.length ? 'FAIL' : 'PASS'}  ${label}: ${list.length} issue(s) over ${sizes.length + 12} sizes`);
    for (const f of list.slice(0, 12)) console.log(`        ${f.issue}  [${f.kind}; ${f.at.length} size(s), e.g. ${f.at.slice(0, 3).join(', ')}]`);
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'sweep.json'), JSON.stringify(results, null, 1));
console.log(failures ? `responsive sweep: ${failures} issue(s)` : 'responsive sweep: pass');
process.exit(failures && !REPORT ? 1 : 0);
