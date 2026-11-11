/**
 * The public site on a 375px phone, against a real deployment.
 *
 * Owner review (2026-11-03): on /book the ride panel was 707px wide on a 375px
 * screen, so the fares and Confirm were off-screen. A grid item's minimum size
 * is its content, and a long Google address is long content; the panel grids
 * now use `minmax(0, 1fr)`. This picks two LONG real addresses through the
 * live Google suggestions, waits for the fares, and fails if ANY element is
 * wider than the viewport, the page scrolls sideways, or Confirm is off-screen.
 *
 * It also checks the homepage and About keep their side gutter: `.hp-section`
 * used `padding: 96px 0`, which zeroed the `.hp` gutter on the same element.
 *
 *   SITE=https://www.qa.saaradhigo.com node scripts/verify-phone-width.mjs
 *
 * CHROME_PATH points at a Chromium build when no installed Chrome is wanted.
 * Exit code 1 on any failure.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.SITE || 'https://www.qa.saaradhigo.com';
const WIDTH = 375;
const PICKUP = process.env.PICKUP || 'Sarath City Capital Mall Kondapur';
const DROP = process.env.DROP || 'Rajiv Gandhi International Airport Shamshabad';
const OUT = path.join(process.env.VERIFY_OUT || '.verify-out', 'verify-phone-width');
fs.mkdirSync(OUT, { recursive: true });

let failed = 0;
const pass = (n, d = '') => console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`);
const fail = (n, d) => { failed += 1; console.log(`  FAIL  ${n} — ${d}`); };

const browser = await chromium.launch(process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-IN',
});
const page = await ctx.newPage();

/** Every visible element wider than the viewport, or poking past its right edge. */
const tooWide = () => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.position === 'fixed') continue;
    // Google's map draws 256px tiles past its own edge and clips them; that is the map,
    // not the page. Everything else counts, clipped or not: a Confirm cut off by a
    // clipping panel is exactly the bug.
    if (el.closest('.gm-style')) continue;
    // Text inside an ellipsis box is cut on purpose; the box itself is still measured.
    let truncated = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).textOverflow === 'ellipsis') { truncated = true; break; }
    }
    if (truncated) continue;
    if (r.width > vw + 1 || r.right > vw + 1) {
      const name = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
      out.push(`${name} ${Math.round(r.width)}px`);
    }
  }
  return { vw, scroll: document.documentElement.scrollWidth, out: out.slice(0, 8), total: out.length };
});

function judge(where, w) {
  if (w.total === 0 && w.scroll <= w.vw) pass(`${where}: nothing wider than ${w.vw}px`);
  else fail(`${where}: wider than the ${w.vw}px screen`, `page ${w.scroll}px; ${w.total} element(s): ${w.out.join(', ')}`);
}

async function gutter(where) {
  const pads = await page.$$eval('.hp', (els) => els.map((e) => parseFloat(getComputedStyle(e).paddingLeft)));
  const lost = pads.filter((p) => p < 16).length;
  if (pads.length && lost === 0) pass(`${where}: every .hp block keeps its side gutter`, `${Math.min(...pads)}px or more`);
  else fail(`${where}: side gutter lost`, `${lost} of ${pads.length} .hp blocks under 16px`);
}

try {
  console.log(`\n=== homepage and About at ${WIDTH}px ===`);
  await page.goto(APP + '/', { waitUntil: 'networkidle' });
  judge('homepage', await tooWide());
  await gutter('homepage');
  await page.goto(APP + '/about', { waitUntil: 'networkidle' });
  await gutter('about');

  console.log(`\n=== /book at ${WIDTH}px with long real addresses ===`);
  await page.goto(APP + '/', { waitUntil: 'networkidle' });
  async function pick(index, typed) {
    const fields = await page.$$('.hp-field__box input');
    await fields[index].fill(typed);
    await page.waitForTimeout(2500);
    const options = await page.$$('.hp-suggest button');
    if (options.length === 0) throw new Error(`no suggestions for "${typed}"`);
    const chosen = (await options[0].textContent()).replace(/\s+/g, ' ').trim();
    await options[0].click();
    await page.waitForTimeout(800);
    return chosen;
  }
  const a = await pick(0, PICKUP);
  const b = await pick(1, DROP);
  pass('picked two long addresses', `${a.length} and ${b.length} characters`);
  await page.click('.hp-hero__form .sg-btn--primary');
  await page.waitForURL(/\/book/, { timeout: 30000 });
  let text = '';
  for (let i = 0; i < 25; i += 1) {
    await page.waitForTimeout(1000);
    text = await page.$eval('body', (el) => el.innerText).catch(() => '');
    if ((text.match(/₹\s?[\d,]+/g) || []).length >= 2) break;
  }
  if ((text.match(/₹\s?[\d,]+/g) || []).length >= 2) pass('fares arrived');
  else fail('no fares arrived', 'cannot judge the priced panel');
  judge('/book with fares', await tooWide());

  const confirm = await page.$('.sg-ws__primary button');
  if (!confirm) {
    fail('no Confirm button', '');
  } else {
    const r = await confirm.boundingBox();
    if (r && r.x >= 0 && r.x + r.width <= WIDTH + 1) pass('Confirm is on-screen', `${Math.round(r.x)}..${Math.round(r.x + r.width)}px`);
    else fail('Confirm is off-screen', JSON.stringify(r));
  }
  await page.screenshot({ path: path.join(OUT, 'book-375.png'), fullPage: true });
} catch (err) {
  fail('run', err.message);
} finally {
  await browser.close();
}

console.log(failed ? `\n${failed} failure(s). Screenshots in ${OUT}` : `\nAll passed. Screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
