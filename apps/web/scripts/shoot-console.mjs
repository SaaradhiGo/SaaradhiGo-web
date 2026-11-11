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

    // --- the rest of the console, one frame each, plus the drawers that
    //     carry a consequential action -------------------------------------
    const openFirstRow = async () => {
      const r = page.locator('tbody tr.ops-row').first();
      if (await r.count()) { await r.click(); await page.waitForTimeout(350); return true; }
      return false;
    };
    for (const [name, url] of [
      ['safety', '/safety-ops'],
      ['support', '/support?status=all'],
      ['withdrawals', '/withdrawals'],
      ['zones', '/zones'],
    ]) {
      await page.goto(`${APP}${url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await shot(page, `${tag}-${name}`);
      if (name === 'sos') {
        const ack = page.locator('.ops-sos__actions button').first();
        if (await ack.count()) { await ack.click(); await page.waitForTimeout(350); await shot(page, `${tag}-sos-action`); await page.keyboard.press('Escape'); }
      } else if (await openFirstRow()) {
        await shot(page, `${tag}-${name}-drawer`);
        if (name === 'withdrawals') {
          const release = page.locator('.ops-drawer__foot button', { hasText: 'Release' }).first();
          if (await release.count()) { await release.click(); await page.waitForTimeout(250); await shot(page, `${tag}-withdrawals-release`); }
        }
        await page.keyboard.press('Escape');
      }
    }

    // Detail pages: the first trip, the first driver, the first ticket.
    const firstHref = async (url, selector) => {
      await page.goto(`${APP}${url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      return page.locator(selector).first().getAttribute('href').catch(() => null);
    };
    for (const [name, list, selector] of [
      ['trip-detail', '/trips?status=completed', 'tbody a[href^="/trips/"]'],
      ['driver-detail', '/drivers', 'tbody a[href^="/drivers/"]'],
      ['ticket-detail', '/support?status=all', 'tbody a[href^="/support/"]'],
    ]) {
      const href = await firstHref(list, selector);
      if (!href) { console.log(`  (no ${name}: nothing listed)`); continue; }
      await page.goto(`${APP}${href}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await shot(page, `${tag}-${name}`);
      if (name === 'trip-detail') {
        const refund = page.locator('button', { hasText: 'Refund' }).first();
        if (await refund.count()) { await refund.click(); await page.waitForTimeout(300); await shot(page, `${tag}-trip-refund`); await page.keyboard.press('Escape'); }
      }
    }

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
