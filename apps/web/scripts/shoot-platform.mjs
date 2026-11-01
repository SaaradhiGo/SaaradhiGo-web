/**
 * Four screenshots of Platform settings against the local fixture stack (fixture data only).
 *
 *   SITE=http://127.0.0.1:3099 ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *   CHECKER_EMAIL=... CHECKER_PASSWORD=... VERIFY_OUT=<dir> node scripts/shoot-platform.mjs
 *
 * 1. Markets, a city's readiness checklist with one blocking item (light)
 * 2. Markets, a launch request awaiting a checker, seen by the checker (dark)
 * 3. Integrations (light)
 * 4. Audit log with an entry's detail drawer (light)
 *
 * Use it on a production build (`next build && next start`), never `next dev`, and do not rebuild
 * while it runs.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.SITE || 'http://127.0.0.1:3099';
const EMAIL = process.env.ADMIN_EMAIL || '';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const CHECKER_EMAIL = process.env.CHECKER_EMAIL || EMAIL;
const CHECKER_PASSWORD = process.env.CHECKER_PASSWORD || PASSWORD;
const BLOCKED_CITY = process.env.BLOCKED_CITY || 'Warangal';
const OUT = process.env.VERIFY_OUT || '.verify-out/platform';
fs.mkdirSync(OUT, { recursive: true });
if (!EMAIL || !PASSWORD) {
  console.log('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
  process.exit(2);
}

const SHOTS = [
  { file: 'platform-1-markets-readiness-light.png', theme: 'light', as: 'maker', url: '/settings',
    ready: 'Platform settings',
    act: async (page) => {
      await page.getByRole('cell', { name: new RegExp(BLOCKED_CITY) }).first().click();
      await page.getByRole('dialog').getByText('Blocks launch', { exact: false }).first().waitFor({ timeout: 20000 });
    } },
  { file: 'platform-2-launch-request-dark.png', theme: 'dark', as: 'checker', url: '/settings',
    ready: 'Waiting for a second admin' },
  { file: 'platform-3-integrations-light.png', theme: 'light', as: 'maker', url: '/settings/integrations',
    ready: 'Payment gateway' },
  { file: 'platform-4-audit-drawer-light.png', theme: 'light', as: 'maker', url: '/settings/audit',
    ready: 'Hash chain',
    act: async (page) => {
      await page.getByRole('cell', { name: 'platform_setting_changed' }).first().click();
      await page.getByRole('dialog').getByText('Before and after', { exact: false }).first().waitFor({ timeout: 20000 });
    } },
];

const browser = await chromium.launch({ channel: 'chrome' });
for (const shot of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.evaluate((t) => window.localStorage.setItem('saaradhi_console_theme', t), shot.theme);
  await page.fill('input[name="email"]', shot.as === 'checker' ? CHECKER_EMAIL : EMAIL);
  await page.fill('input[name="password"]', shot.as === 'checker' ? CHECKER_PASSWORD : PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 });
  await page.goto(`${APP}${shot.url}`, { waitUntil: 'networkidle' });
  await page.getByText(shot.ready, { exact: false }).first().waitFor({ timeout: 20000 });
  if (shot.act) await shot.act(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, shot.file) });
  console.log('wrote', shot.file);
  await ctx.close();
}
await browser.close();
