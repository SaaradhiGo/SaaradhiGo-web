/**
 * Lighthouse accessibility on the Promotions pages (module 12): the four tabs, and the campaign
 * drawer open on its create form and on a saved campaign, in both themes. Target: 95 or better.
 *
 * Same method as a11y-console.mjs: Lighthouse's own chrome-launcher starts a Chrome with a
 * debugging port, Playwright attaches over CDP to set the theme and sign in, and Lighthouse audits
 * each page in that same Chrome with storage left alone. The two drawer states are SNAPSHOTS (a
 * navigation reload would close the drawer before it was audited), taken through the
 * puppeteer-core that ships with Lighthouse.
 *
 *   LIGHTHOUSE_DIR=<a node_modules containing lighthouse + chrome-launcher> \
 *   SITE=http://127.0.0.1:3099 ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *     node scripts/a11y-promotions.mjs
 *
 * Run it against the local fixture stack (campaigns in every state, a blocked referral, fraud
 * flags), so the audited pages have rows and not only their empty state. Sign in as a role that
 * holds promo.read, promo.write, incentive.write and fraud.read (Super Admin) so every tab draws.
 */
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = process.env.SITE || 'http://127.0.0.1:3099';
const EMAIL = process.env.ADMIN_EMAIL || '';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const OUT = (process.env.VERIFY_OUT || '.verify-out') + '/a11y-promotions';
const LH_DIR = process.env.LIGHTHOUSE_DIR || '';
const PAGES = ['/promotions', '/promotions/incentives', '/promotions/referrals', '/promotions/fraud'];
fs.mkdirSync(OUT, { recursive: true });

if (!EMAIL || !PASSWORD || !LH_DIR) {
  console.log('ADMIN_EMAIL, ADMIN_PASSWORD and LIGHTHOUSE_DIR are required.');
  process.exit(2);
}

const { default: lighthouse, snapshot } = await import(pathToFileURL(path.join(LH_DIR, 'lighthouse/core/index.js')).href);
const { launch } = await import(pathToFileURL(path.join(LH_DIR, 'chrome-launcher/dist/index.js')).href);
const puppeteer = createRequire(pathToFileURL(path.join(LH_DIR, 'x')).href)('puppeteer-core');

const results = [];

for (const theme of ['dark', 'light']) {
  const chrome = await launch({ chromeFlags: ['--headless=new', '--window-size=1440,900'] });
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
  const page = await browser.contexts()[0].newPage();
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.evaluate((t) => window.localStorage.setItem('saaradhi_console_theme', t), theme);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 });
  await page.waitForLoadState('networkidle');

  const record = (name, r) => {
    fs.writeFileSync(path.join(OUT, `${theme}-${name.replace(/\W+/g, '-').replace(/^-|-$/g, '')}.json`), r.report);
    const score = Math.round((r.lhr.categories.accessibility.score ?? 0) * 100);
    const failing = Object.values(r.lhr.audits)
      .filter((a) => a.score !== null && a.score < 1
        && !['informative', 'notApplicable', 'manual'].includes(a.scoreDisplayMode))
      .map((a) => `${a.id} (${a.details?.items?.length ?? 0})`);
    console.log(`  ${theme} ${name}: ${score}${failing.length ? '  failing: ' + failing.join(', ') : ''}`);
    results.push({ theme, name, score });
  };

  console.log(`\n=== ${theme}`);
  for (const route of PAGES) {
    record(route, await lighthouse(`${APP}${route}`, {
      port: chrome.port,
      output: 'json',
      onlyCategories: ['accessibility'],
      disableStorageReset: true,
      formFactor: 'desktop',
      screenEmulation: { disabled: true },
      throttlingMethod: 'provided',
      logLevel: 'error',
    }));
  }

  const runSnapshot = async (name) => {
    const lhBrowser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null });
    const target = (await lhBrowser.pages()).find((p) => p.url() === page.url());
    if (!target) throw new Error(`no puppeteer page at ${page.url()}`);
    const r = await snapshot(target, {
      flags: {
        output: 'json', onlyCategories: ['accessibility'], formFactor: 'desktop',
        screenEmulation: { disabled: true }, logLevel: 'error',
      },
    });
    lhBrowser.disconnect();
    record(name, r);
  };

  // The create form, open (a driver incentive: the longest form with a projection).
  await page.bringToFront();
  await page.goto(`${APP}/promotions/incentives`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /New driver incentive/ }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByLabel('Reward (INR)').fill('800');
  await page.getByLabel('Budget (INR)').fill('10000');
  await page.getByLabel('Trips to complete').fill('12');
  await runSnapshot('drawer-create-form');
  await page.keyboard.press('Escape');

  // A saved campaign with its budget bar and activity, open.
  await page.goto(`${APP}/promotions/referrals`, { waitUntil: 'networkidle' });
  await page.getByRole('row', { name: /Refer a rider/ }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByText('Reward blocked').first().waitFor();
  await runSnapshot('drawer-saved-campaign');

  await browser.close();
  await chrome.kill();
}

const worst = Math.min(...results.map((r) => r.score ?? 0));
console.log(`\nlowest score: ${worst} (target 95)`);
process.exit(worst >= 95 ? 0 : 1);
