/**
 * The operations console, driven as an operator, page by page.
 *
 * An operator lives in this app all day: it approves drivers, releases
 * payouts and answers SOS. It has never been exercised end to end against a
 * deployed backend, so this establishes what actually works BEFORE anything
 * is redesigned on top of it.
 *
 * For each page it records what a person would see and what the browser
 * actually did: failed API calls, console errors, visible error text, and
 * whether the screen rendered content or an empty shell. An empty table is
 * reported as EMPTY rather than PASS -- "no rows" and "the request failed"
 * look identical on screen and must not look identical here.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run verify:console
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.SITE || 'https://www.qa.saaradhigo.com';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@saaradhigo.com';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const OUT = (process.env.VERIFY_OUT || '.verify-out') + '/'
  + (process.env.OUTDIR || 'console');
fs.mkdirSync(OUT, { recursive: true });

const rows = [];
const log = (state, page, detail) => {
  rows.push({ state, page, detail });
  const mark = { PASS: 'PASS', FAIL: 'FAIL', EMPTY: 'EMPTY', SKIP: 'SKIP' }[state];
  console.log(`  ${mark.padEnd(5)} ${page}${detail ? ' — ' + detail : ''}`);
};

if (!PASSWORD) {
  console.log('ADMIN_PASSWORD is not set; nothing can be checked.');
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

/** Per-page collection, reset as we navigate. */
let apiFailures = [];
let consoleErrors = [];
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/api/v1/') && r.status() >= 400) {
    apiFailures.push(`${r.status()} ${r.request().method()} ${u.split('/api/v1/')[1].split('?')[0]}`);
  }
});
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 160)}`));

const body = () => page.$eval('body', (b) => b.innerText.replace(/\s+/g, ' ').trim())
  .catch(() => '');

/* ---- sign in ---------------------------------------------------------- */
console.log('\n=== operator sign-in ===');
await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const emailField = await page.$('input[name="email"]');
if (!emailField) {
  log('FAIL', '/login', 'no email + password form');
  await browser.close();
  process.exit(1);
}
await emailField.fill(EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(7000);
if (!/\/dashboard/.test(page.url())) {
  log('FAIL', '/login', `did not reach the console: ${(await body()).slice(0, 160)}`);
  await page.screenshot({ path: path.join(OUT, 'login-failed.png'), fullPage: true });
  await browser.close();
  process.exit(1);
}
log('PASS', '/login', `signed in as ${EMAIL}`);

/* ---- every page ------------------------------------------------------- */
const PAGES = [
  { path: '/dashboard', wants: /trip|driver|revenue|today|total/i },
  { path: '/safety-ops', wants: /sos|alert|incident|no .*(alert|sos)/i },
  { path: '/trips', wants: /trip|status|fare|no trips/i },
  { path: '/drivers', wants: /driver|approved|kyc|no drivers/i },
  { path: '/withdrawals', wants: /withdraw|amount|payout|no withdraw/i },
  { path: '/support', wants: /ticket|support|subject|no tickets/i },
  { path: '/zones', wants: /zone|rate|city|no zones/i },
];

for (const entry of PAGES) {
  console.log(`\n=== ${entry.path} ===`);
  apiFailures = [];
  consoleErrors = [];

  try {
    await page.goto(APP + entry.path, { waitUntil: 'networkidle' });
  } catch (err) {
    log('FAIL', entry.path, `navigation failed: ${String(err.message).slice(0, 90)}`);
    continue;
  }
  await page.waitForTimeout(6000);

  const text = await body();
  const name = entry.path.replace(/\//g, '') || 'root';
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
    .catch(() => {});

  // Bounced back to the sign-in screen: the session did not survive, which
  // is a different defect from the page being broken.
  if (/\/login/.test(page.url())) {
    log('FAIL', entry.path, 'redirected to /login — the console session did not hold');
    continue;
  }

  if (apiFailures.length) {
    log('FAIL', entry.path, [...new Set(apiFailures)].join(' | ').slice(0, 170));
    continue;
  }

  // Text the page itself renders when it has given up.
  const shownError = (text.match(/(could not [^.]{0,70}\.|failed to [^.]{0,70}\.|unexpected error[^.]{0,40}\.)/i) || [])[0];
  if (shownError) {
    log('FAIL', entry.path, `screen says: ${shownError}`);
    continue;
  }

  // Counted across the console's own parts as well as the legacy ones, so
  // a redesign does not make a working page look empty. The first version
  // of this check looked only for `.card` and reported the rebuilt
  // dashboard -- four queues and six metrics -- as rendering nothing.
  const tableRows = await page
    .$$eval('.ops-table tbody tr, table tbody tr', (els) => els.length).catch(() => 0);
  const cards = await page
    .$$eval('.ops-queue, .ops-stat, .ops-panel, .card', (els) => els.length).catch(() => 0);

  if (!entry.wants.test(text)) {
    log('FAIL', entry.path, `nothing recognisable rendered: ${text.slice(0, 120)}`);
  } else if (tableRows === 0 && cards === 0) {
    // Honest: an empty screen may be a genuinely empty database. It is NOT
    // a pass, because a silently failing fetch looks exactly the same.
    log('EMPTY', entry.path, 'rendered, but no rows or cards — empty data or a silent miss');
  } else {
    log('PASS', entry.path, `${tableRows} row(s), ${cards} card(s)`);
  }

  if (consoleErrors.length) {
    log('FAIL', entry.path + ' (console)', [...new Set(consoleErrors)].join(' | ').slice(0, 160));
  }
}

/* ---- the driver detail page, which is where KYC happens --------------- */
console.log('\n=== /drivers/[id] — the KYC review screen ===');
apiFailures = [];
consoleErrors = [];
await page.goto(APP + '/drivers', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
const firstDriver = await page.$('table tbody tr a, table tbody tr td a');
if (!firstDriver) {
  log('SKIP', '/drivers/[id]', 'no driver row to open');
} else {
  await firstDriver.click();
  await page.waitForTimeout(7000);
  const text = await body();
  await page.screenshot({ path: path.join(OUT, 'driver-detail.png'), fullPage: true })
    .catch(() => {});
  if (apiFailures.length) {
    log('FAIL', '/drivers/[id]', [...new Set(apiFailures)].join(' | ').slice(0, 170));
  } else if (/approve to drive|send back|decision|revoke approval/i.test(text)) {
    // The point of this screen: the decision AND the evidence for it. A
    // decision with nothing to read is the defect it was built to fix.
    const hasDocs = /licence|license|registration certificate|insurance/i.test(text);
    const hasOutcome = /outstanding|everything this driver/i.test(text);
    log(hasDocs && hasOutcome ? 'PASS' : 'EMPTY', '/drivers/[id]',
      hasDocs && hasOutcome
        ? 'decision, checklist and documents all present'
        : `decision present but evidence thin (docs=${hasDocs} checklist=${hasOutcome})`);
  } else {
    log('FAIL', '/drivers/[id]', `no KYC controls: ${text.slice(0, 120)}`);
  }
}

await browser.close();

const counts = rows.reduce((acc, r) => ({ ...acc, [r.state]: (acc[r.state] || 0) + 1 }), {});
console.log('\n================= CONSOLE =================');
console.log(`site:   ${APP}`);
console.log(`operator: ${EMAIL}`);
console.log(`pass ${counts.PASS || 0} · fail ${counts.FAIL || 0} · empty ${counts.EMPTY || 0} · skip ${counts.SKIP || 0}`);
const bad = rows.filter((r) => r.state === 'FAIL');
if (bad.length) {
  console.log('\nbroken:');
  for (const r of bad) console.log(`  - ${r.page}: ${r.detail}`);
}
const empty = rows.filter((r) => r.state === 'EMPTY');
if (empty.length) {
  console.log('\nrendered but empty (verify the data, not just the screen):');
  for (const r of empty) console.log(`  - ${r.page}`);
}
console.log(`screenshots -> ${OUT}`);
process.exit(bad.length ? 1 : 0);
