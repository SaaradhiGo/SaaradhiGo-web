/**
 * Four screenshots of the Reports module against the local fixture stack (fixture data only).
 *
 *   SITE=http://127.0.0.1:3099 ADMIN_EMAIL=... ADMIN_PASSWORD=... VERIFY_OUT=<dir> \
 *     node scripts/shoot-reports.mjs
 *
 * 1. the catalogue (light)
 * 2. revenue by vehicle class and month with the per-currency totals (light)
 * 3. supply and the trips funnel (dark)
 * 4. rider retention by cohort (light)
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
const OUT = process.env.VERIFY_OUT || '.verify-out/reports';
fs.mkdirSync(OUT, { recursive: true });
if (!EMAIL || !PASSWORD) {
  console.log('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
  process.exit(2);
}

const RANGE = 'from=2026-09-01&to=2026-10-30';
const SHOTS = [
  { file: 'reports-1-catalogue-light.png', theme: 'light', url: '/reports', ready: 'Trips and cancellations' },
  { file: 'reports-2-revenue-by-vehicle-month-light.png', theme: 'light',
    url: `/reports/revenue?${RANGE}&granularity=month&group_by=vehicle`, ready: 'Over time' },
  { file: 'reports-3-supply-funnel-dark.png', theme: 'dark',
    url: `/reports/supply?${RANGE}&granularity=week`, ready: 'Trips funnel' },
  { file: 'reports-4-rider-retention-light.png', theme: 'light',
    url: '/reports/rider_retention?from=2026-08-31&to=2026-10-30', ready: 'Retention by cohort' },
];

const browser = await chromium.launch({ channel: 'chrome' });
for (const shot of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.evaluate((t) => window.localStorage.setItem('saaradhi_console_theme', t), shot.theme);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 });
  await page.goto(`${APP}${shot.url}`, { waitUntil: 'networkidle' });
  await page.getByText(shot.ready, { exact: false }).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, shot.file), fullPage: shot.file.includes('revenue') || shot.file.includes('supply') });
  console.log('wrote', shot.file);
  await ctx.close();
}
await browser.close();
