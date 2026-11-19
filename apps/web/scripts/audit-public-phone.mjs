/**
 * Phone pass over the public site (owner brief, 2026-11-17): screenshots every public page at
 * 360/390/414 (Android Chrome) and 1440, and measures what the brief asks for: body text >= 16px,
 * no text under 14px, 44px tap targets, no sideways scroll, nothing clipped or overlapping, the
 * page's heading on the first screen, and the phone menu opening and closing.
 *
 *   SITE=https://web-qa-800c.up.railway.app OUT=C:/tmp/audit node scripts/audit-public-phone.mjs
 *
 * Writes <OUT>/<width>/<page>.jpg and <OUT>/findings.json. Exit code 1 on any finding.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const SITE = (process.env.SITE || 'https://web-qa-800c.up.railway.app').replace(/\/$/, '');
const OUT = process.env.OUT || '.verify-out/audit-public-phone';
const WIDTHS = (process.env.WIDTHS || '360,390,414,1440').split(',').map(Number);
const MARKET = process.env.MARKET || 'IN';
export const PAGES = (process.env.PAGES || [
  '/', '/ride', '/ride/choose', '/drive', '/fares', '/safety', '/about', '/help', '/contact',
  '/sign-in', '/sign-up', '/driver/sign-in', '/driver/sign-up', '/forgot-password',
  '/privacy', '/terms', '/driver-terms', '/refunds', '/text-messages', '/grievance', '/cookies',
  '/delete-account', '/zero-tolerance', '/accessibility',
].join(',')).split(',');
// /ride/choose prices a draft the home search saves in the tab, so it is reached the visitor's way.
const TRIP = MARKET === 'US' ? ['Boise State University', 'The Village at Meridian'] : ['Charminar', 'HITEC City'];
async function bookFromHome(page) {
  await page.goto(SITE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  for (const [id, text] of [['hp-pickup', TRIP[0]], ['hp-dest', TRIP[1]]]) {
    await page.click(`#${id}`);
    await page.fill(`#${id}`, text);
    const opt = page.locator('.s-book__suggest button').first();
    await opt.waitFor({ timeout: 15000 });
    await opt.click();
  }
  await page.locator('button.s-book__go').click();
  await page.waitForURL(/\/ride\/choose/, { timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
}

const slug = (p) => (p === '/' ? 'home' : p.slice(1).replace(/[/?=&]/g, '_'));
const findings = [];
const add = (width, page, kind, detail) => findings.push({ width, page, kind, detail });

/** Runs in the page: everything the brief measures, as plain data. */
function measure(phone) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = { hscroll: 0, tiny: [], small: [], taps: [], clipped: [], overlaps: [], offscreen: [], h1: null, imgs: [] };
  // Not judged: screen-reader-only text, the skip link (shown on focus), and Google's own map
  // controls and attribution, which the page may not restyle.
  const vis = (el) => {
    if (el.closest('.sr-only, .skip-link, .gm-style, thead[style], .sg-legal-doc__table thead')) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => {
    const t = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('alt') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ');
    const c = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
    return `${el.tagName.toLowerCase()}${c ? '.' + c : ''} "${t.slice(0, 40)}"`;
  };
  out.hscroll = document.scrollingElement.scrollWidth - vw;

  // Text sizes: every element that directly holds visible text.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.textContent.trim() || !vis(el)) continue;
    if (el.closest('[aria-hidden="true"], .s-mock, svg, script, style, noscript')) continue;
    seen.add(el);
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 14) out.tiny.push(`${fs}px ${label(el)}`);
    else if (phone && fs < 16 && el.closest('main p, main li') && n.textContent.trim().length > 60) out.small.push(`${fs}px ${label(el)}`);
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) out.offscreen.push(`${Math.round(r.left)}..${Math.round(r.right)} ${label(el)}`);
  }
  // Tap targets: controls that are not a link inside a sentence.
  const ctrls = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], summary, label:has(input[type=checkbox]), label:has(input[type=radio])')]
    .filter((el) => vis(el) && !el.closest('[aria-hidden="true"]'));
  for (const el of ctrls) {
    if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) continue;
    const r = el.getBoundingClientRect();
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p, li, td');
    if (!inline && (r.width < 44 || r.height < 44)) {
      // A small control inside a bigger tappable parent is fine.
      const p = el.parentElement?.closest('a[href], button, label');
      const pr = p?.getBoundingClientRect();
      if (!pr || pr.width < 44 || pr.height < 44) out.taps.push(`${Math.round(r.width)}x${Math.round(r.height)} ${label(el)}`);
    }
  }
  // Overlaps between controls and headings that are not nested.
  const blocks = [...ctrls, ...document.querySelectorAll('h1, h2, h3, img, .s-book, .s-hero__card, .s-mapcard')].filter(vis);
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (x > 2 && y > 2) {
        const pa = getComputedStyle(a).position, pb = getComputedStyle(b).position;
        if (pa === 'fixed' || pb === 'fixed' || pa === 'sticky' || pb === 'sticky') continue;
        out.overlaps.push(`${label(a)} x ${label(b)} (${Math.round(x)}x${Math.round(y)})`);
      }
    }
  }
  // Clipped text: a box whose content is wider than itself while it hides the overflow.
  for (const el of document.querySelectorAll('main *, header *, footer *')) {
    if (!vis(el) || el.closest('[aria-hidden="true"]')) continue;
    const s = getComputedStyle(el);
    if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2 && el.innerText?.trim() && s.textOverflow !== 'ellipsis') {
      out.clipped.push(`${el.scrollWidth}>${el.clientWidth} ${label(el)}`);
    }
  }
  const h1 = document.querySelector('main h1, h1');
  if (h1) { const r = h1.getBoundingClientRect(); out.h1 = { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), vh, text: h1.innerText.trim().slice(0, 60) }; }
  for (const img of document.querySelectorAll('main img, main svg:not([aria-hidden="true"] svg)')) {
    if (!vis(img)) continue;
    const r = img.getBoundingClientRect();
    if (phone && r.height > vh * 0.6) out.imgs.push(`${Math.round(r.width)}x${Math.round(r.height)} ${label(img)}`);
  }
  for (const k of Object.keys(out)) if (Array.isArray(out[k])) out[k] = [...new Set(out[k])];
  return out;
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
for (const width of WIDTHS) {
  const phone = width < 768;
  fs.mkdirSync(path.join(OUT, String(width)), { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width, height: phone ? 800 : 900 }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone,
    locale: MARKET === 'US' ? 'en-US' : 'en-IN', timezoneId: MARKET === 'US' ? 'America/Boise' : 'Asia/Kolkata',
    userAgent: phone ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' : undefined,
  });
  await ctx.addCookies([{ name: 'sg-market', value: MARKET, url: SITE }]);
  const page = await ctx.newPage();
  for (const p of PAGES) {
    try {
      if (p === '/ride/choose') await bookFromHome(page);
      else await page.goto(SITE + p, { waitUntil: 'networkidle', timeout: 45000 });
    } catch { await page.waitForTimeout(3000); }
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(p === '/ride/choose' ? 6000 : 800);
    const m = await page.evaluate(measure, phone);
    const s = slug(p);
    await page.screenshot({ path: path.join(OUT, String(width), `${s}.jpg`), fullPage: true, type: 'jpeg', quality: 72 });
    await page.screenshot({ path: path.join(OUT, String(width), `${s}--first.jpg`), type: 'jpeg', quality: 80 });
    if (m.hscroll > 0) add(width, p, 'sideways scroll', `${m.hscroll}px`);
    for (const x of m.tiny) add(width, p, 'text under 14px', x);
    for (const x of m.small) add(width, p, 'body text under 16px', x);
    for (const x of m.taps) add(width, p, 'tap target under 44px', x);
    for (const x of m.overlaps) add(width, p, 'overlap', x);
    for (const x of m.clipped) add(width, p, 'clipped', x);
    for (const x of m.offscreen) add(width, p, 'off screen', x);
    for (const x of m.imgs) add(width, p, 'image taller than 60% of the screen', x);
    if (!m.h1) add(width, p, 'no h1', '');
    else if (m.h1.bottom > m.h1.vh) add(width, p, 'heading below the first screen', `${m.h1.text} at ${m.h1.top}px`);

    // The phone menu: opens, shows its links, closes again.
    if (phone && p === '/') {
      const btn = page.locator('button[aria-controls="s-drawer"]').first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(400);
        const open = await btn.getAttribute('aria-expanded');
        await page.screenshot({ path: path.join(OUT, String(width), 'menu-open.jpg'), type: 'jpeg', quality: 80 });
        const mm = await page.evaluate(measure, phone);
        for (const x of mm.taps) add(width, 'menu', 'tap target under 44px', x);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        let closed = await btn.getAttribute('aria-expanded');
        if (closed === 'true') { await btn.click({ force: true }); await page.waitForTimeout(300); closed = await btn.getAttribute('aria-expanded'); }
        if (open !== 'true' || closed !== 'false') add(width, 'menu', 'menu open/close', `open=${open} closed=${closed}`);
      } else add(width, 'menu', 'menu button', 'not found');
    }
    process.stdout.write(`${width} ${p} ok\n`);
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 1));
const byKind = {};
for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
console.log(JSON.stringify(byKind));
process.exit(findings.length ? 1 : 0);
