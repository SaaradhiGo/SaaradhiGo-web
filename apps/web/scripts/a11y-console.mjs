/**
 * Lighthouse accessibility on the sign-in page, the Command Centre, and the
 * Command Centre WITH THE GLOBAL SEARCH OPEN, in both themes.
 *
 * Lighthouse drives its own tab and cannot sign in. So Lighthouse's own
 * chrome-launcher starts a Chrome with a debugging port, Playwright
 * attaches to it over CDP to set the theme and sign in, and Lighthouse is
 * then run against the same Chrome with storage left alone, so the session
 * and the theme survive. Each run prints the score and the failing audits.
 *
 *   LIGHTHOUSE_DIR=<a node_modules containing lighthouse + chrome-launcher> \
 *   SITE=http://127.0.0.1:3099 ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *     node scripts/a11y-console.mjs
 *
 * `lighthouse` is not a dependency of the app because nothing in the build
 * uses it; `npx -y lighthouse@13.5.0 --version` once leaves a copy in the
 * npx cache, and LIGHTHOUSE_DIR points at it.
 *
 * THE OPEN SEARCH IS A SNAPSHOT, NOT A NAVIGATION. Lighthouse's ordinary
 * run reloads the page, which closes the popover before it is audited, so
 * the third audit types a term into the search box with Playwright, waits
 * for the listbox, and then runs Lighthouse in snapshot mode against the
 * page as it stands. Snapshot mode wants a Puppeteer page; the copy of
 * `puppeteer-core` that ships with Lighthouse is attached to the same
 * Chrome for that one call.
 */
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = process.env.SITE || 'http://127.0.0.1:3099';
const EMAIL = process.env.ADMIN_EMAIL || '';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const OUT = (process.env.VERIFY_OUT || '.verify-out') + '/a11y';
const LH_DIR = process.env.LIGHTHOUSE_DIR || '';
fs.mkdirSync(OUT, { recursive: true });

if (!EMAIL || !PASSWORD || !LH_DIR) {
  console.log('ADMIN_EMAIL, ADMIN_PASSWORD and LIGHTHOUSE_DIR are required.');
  process.exit(2);
}

const { default: lighthouse, snapshot } = await import(pathToFileURL(path.join(LH_DIR, 'lighthouse/core/index.js')).href);
const { launch } = await import(pathToFileURL(path.join(LH_DIR, 'chrome-launcher/dist/index.js')).href);
const puppeteer = createRequire(pathToFileURL(path.join(LH_DIR, 'x')).href)('puppeteer-core');
const SEARCH_TERM = process.env.SEARCH_TERM || 'ravi';

const results = [];

for (const theme of ['dark', 'light']) {
  const chrome = await launch({ chromeFlags: ['--headless=new', '--window-size=1440,900'] });
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.evaluate((t) => window.localStorage.setItem('saaradhi_console_theme', t), theme);

  const record = (name, r) => {
    const lhr = r.lhr;
    fs.writeFileSync(path.join(OUT, `${theme}-${name}.json`), r.report);
    const score = Math.round((lhr.categories.accessibility.score ?? 0) * 100);
    const failing = Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 1
        && !['informative', 'notApplicable', 'manual'].includes(a.scoreDisplayMode))
      .map((a) => `${a.id} (${a.details?.items?.length ?? 0})`);
    console.log(`  ${theme} ${name}: ${score}${failing.length ? '  failing: ' + failing.join(', ') : ''}`);
    results.push({ theme, name, score });
  };

  const run = async (name, url) => record(name, await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    onlyCategories: ['accessibility'],
    disableStorageReset: true,
    formFactor: 'desktop',
    screenEmulation: { disabled: true },
    throttlingMethod: 'provided',
    logLevel: 'error',
  }));

  // The page as it stands, popover and all.
  const runSnapshot = async (name) => {
    const browserForLh = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null });
    const target = (await browserForLh.pages()).find((p) => p.url() === page.url());
    if (!target) throw new Error(`no puppeteer page at ${page.url()}`);
    const r = await snapshot(target, {
      flags: {
        output: 'json',
        onlyCategories: ['accessibility'],
        formFactor: 'desktop',
        screenEmulation: { disabled: true },
        logLevel: 'error',
      },
    });
    browserForLh.disconnect();
    record(name, r);
  };

  console.log(`\n=== ${theme}`);
  await run('login', `${APP}/login`);

  await page.bringToFront();
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await run('command-centre', `${APP}/dashboard`);

  // The global search, open with results, on the same page.
  await page.bringToFront();
  await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
  const box = page.getByRole('combobox');
  await box.fill(SEARCH_TERM);
  await page.getByRole('listbox', { name: 'Search results' }).waitFor({ timeout: 15000 });
  await box.press('ArrowDown');
  await runSnapshot('command-centre-search-open');

  await browser.close();
  await chrome.kill();
}

const worst = Math.min(...results.map((r) => r.score ?? 0));
console.log(`\nlowest score: ${worst} (target 95)`);
process.exit(worst >= 95 ? 0 : 1);
