/**
 * Lighthouse accessibility on the Reports pages (catalogue, revenue and supply; was: payouts and
 * reconciliation), in both themes. Target: 95 or better on each.
 *
 * Same method as a11y-console.mjs: Lighthouse's own chrome-launcher starts a
 * Chrome with a debugging port, Playwright attaches over CDP to set the theme
 * and sign in, and Lighthouse then audits each page in that same Chrome with
 * storage left alone so the session and the theme survive.
 *
 *   LIGHTHOUSE_DIR=<a node_modules containing lighthouse + chrome-launcher> \
 *   SITE=http://127.0.0.1:3099 ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *     node scripts/a11y-finance.mjs
 *
 * Run it against the local fixture stack (money rows in two currencies and
 * some reconciliation findings), so the audited pages have rows and not only
 * their empty state.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = process.env.SITE || 'http://127.0.0.1:3099';
const EMAIL = process.env.ADMIN_EMAIL || '';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const OUT = (process.env.VERIFY_OUT || '.verify-out') + '/a11y-reports';
const LH_DIR = process.env.LIGHTHOUSE_DIR || '';
const PAGES = (process.env.PAGES || '/reports,/reports/revenue?from=2026-09-01&to=2026-10-30&granularity=month,/reports/supply?from=2026-09-01&to=2026-10-30&granularity=week').split(',');
fs.mkdirSync(OUT, { recursive: true });

if (!EMAIL || !PASSWORD || !LH_DIR) {
  console.log('ADMIN_EMAIL, ADMIN_PASSWORD and LIGHTHOUSE_DIR are required.');
  process.exit(2);
}

const { default: lighthouse } = await import(pathToFileURL(path.join(LH_DIR, 'lighthouse/core/index.js')).href);
const { launch } = await import(pathToFileURL(path.join(LH_DIR, 'chrome-launcher/dist/index.js')).href);

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

  console.log(`\n=== ${theme}`);
  for (const route of PAGES) {
    const r = await lighthouse(`${APP}${route}`, {
      port: chrome.port,
      output: 'json',
      onlyCategories: ['accessibility'],
      disableStorageReset: true,
      formFactor: 'desktop',
      screenEmulation: { disabled: true },
      throttlingMethod: 'provided',
      logLevel: 'error',
    });
    const name = route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'root';
    fs.writeFileSync(path.join(OUT, `${theme}-${name}.json`), r.report);
    const score = Math.round((r.lhr.categories.accessibility.score ?? 0) * 100);
    const failing = Object.values(r.lhr.audits)
      .filter((a) => a.score !== null && a.score < 1
        && !['informative', 'notApplicable', 'manual'].includes(a.scoreDisplayMode))
      .map((a) => `${a.id} (${a.details?.items?.length ?? 0})`);
    console.log(`  ${theme} ${route}: ${score}${failing.length ? '  failing: ' + failing.join(', ') : ''}`);
    results.push({ theme, route, score });
  }
  await browser.close();
  await chrome.kill();
}

const worst = Math.min(...results.map((r) => r.score ?? 0));
console.log(`\nlowest score: ${worst} (target 95)`);
process.exit(worst >= 95 ? 0 : 1);
