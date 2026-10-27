/**
 * Photograph the console: sign-in states, the shell and the first three
 * pages, in both themes, at the two widths the design is judged at.
 *
 *   SITE=http://127.0.0.1:3099 ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *     node scripts/shoot-console.mjs
 *
 * Output: .verify-out/noir/<theme>-<width>-<name>.png. The script does not
 * judge anything; it exists so a reviewer can look at the same frames the
 * author did, in a production build, without clicking through 40 states.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.SITE || 'http://127.0.0.1:3099';
const EMAIL = process.env.ADMIN_EMAIL || '';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const OUT = (process.env.VERIFY_OUT || '.verify-out') + '/noir';
const THEMES = (process.env.THEMES || 'dark,light').split(',');
const WIDTHS = (process.env.WIDTHS || '1440,1024').split(',').map(Number);
fs.mkdirSync(OUT, { recursive: true });

if (!EMAIL || !PASSWORD) {
  console.log('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'chrome' });
const taken = [];

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false, ...opts });
  taken.push(file);
  console.log(`  ${name}`);
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const tag = `${theme}-${width}`;
    console.log(`\n=== ${tag}`);
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => {
      try { window.localStorage.setItem('saaradhi_console_theme', t); } catch {}
    }, theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });

    // --- sign-in states ------------------------------------------------
    for (const [name, url] of [
      ['login', '/login'],
      ['login-totp', '/login?preview=totp'],
      ['login-recovery', '/login?preview=recovery'],
      ['login-reason', '/login?preview=reason'],
      ['login-locked', '/login?preview=locked'],
      ['login-password', '/login?preview=password'],
      ['login-expired', '/login?preview=expired'],
      ['login-help', '/login/help'],
    ]) {
      await page.goto(`${APP}${url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      await shot(page, `${tag}-${name}`);
    }

    // --- sign in -------------------------------------------------------
    await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    await shot(page, `${tag}-command-centre`);

    // The profile menu open, so the theme switch and role line are seen.
    await page.click('.ops__profile-btn');
    await page.waitForTimeout(200);
    await shot(page, `${tag}-profile-menu`);
    await page.keyboard.press('Escape');

    // Collapsed rail.
    const collapse = page.locator('.ops__collapse');
    if (await collapse.isVisible()) {
      await collapse.click();
      await page.waitForTimeout(300);
      await shot(page, `${tag}-command-centre-collapsed`);
      await collapse.click();
    }

    // --- drivers, with a row open and the filters open ------------------
    await page.goto(`${APP}/drivers`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shot(page, `${tag}-drivers`);
    const row = page.locator('tbody tr.ops-row').first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(300);
      await shot(page, `${tag}-drivers-row-drawer`);
      await page.keyboard.press('Escape');
    }
    await page.click('.ops-toolbtn');
    await page.waitForTimeout(300);
    await shot(page, `${tag}-drivers-filters`);
    await page.keyboard.press('Escape');
    await page.click('.ops-seg__btn:has-text("Compact")');
    await page.waitForTimeout(200);
    await shot(page, `${tag}-drivers-compact`);

    // --- trips ----------------------------------------------------------
    await page.goto(`${APP}/trips`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shot(page, `${tag}-trips`);

    if (errors.length) {
      console.log(`  browser errors (${errors.length}):`);
      for (const e of [...new Set(errors)].slice(0, 6)) console.log(`    ${e}`);
    } else {
      console.log('  no browser errors');
    }
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${taken.length} screenshots in ${OUT}`);
