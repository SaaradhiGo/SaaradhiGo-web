// Rendered check: no decorative dash before a title (owner, 2026-11-06).
//
// check-css catches the rule in the stylesheets; this catches it as the
// browser draws it, on the public pages at phone and desktop width, and saves
// a screenshot of the homepage's first screen for the report.
//
//   SITE=https://www.qa.saaradhigo.com npm run verify:no-title-dash
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const APP = process.env.SITE || 'https://www.qa.saaradhigo.com';
const OUT = path.join(process.env.VERIFY_OUT || '.verify-out', 'verify-no-title-dash');
const PAGES = ['/', '/ride', '/drive', '/safety', '/about', '/help', '/book'];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const failures = [];
for (const width of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const p of PAGES) {
    await page.goto(APP + p, { waitUntil: 'networkidle' }).catch(() => {});
    const found = await page.evaluate(() => {
      const hits = [];
      const titleLike = (el) => /^H[1-6]$/.test(el.tagName)
        || /(eyebrow|kicker|title|heading|label|panel)/i.test(el.className?.toString?.() ?? '');
      for (const el of document.querySelectorAll('body *')) {
        if (!titleLike(el)) continue;
        for (const pseudo of ['::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          if (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none') continue;
          const h = parseFloat(cs.height);
          const w = parseFloat(cs.width);
          const bg = cs.backgroundColor;
          const painted = bg && bg !== 'transparent' && !/rgba\(\d+, \d+, \d+, 0\)/.test(bg);
          if (painted && h > 0 && h <= 3 && w > 0 && w <= 80) {
            hits.push(`${el.tagName.toLowerCase()}.${el.className}${pseudo} ${w}x${h}`);
          }
        }
      }
      return hits;
    });
    for (const f of found) failures.push(`${p} @${width}: ${f}`);
    if (p === '/') await page.screenshot({ path: path.join(OUT, `home-${width}.png`) });
  }
  await page.close();
}
await browser.close();

if (failures.length) {
  console.error(`A dash is drawn before a title:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`No title dash on ${PAGES.length} pages at 390 and 1280 (${APP}). Screenshots in ${OUT}.`);
