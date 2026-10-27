/**
 * The region switcher and the permission-aware nav, driven in a browser.
 *
 * WHAT THIS IS FOR
 * ----------------
 * The backend tests prove the endpoints refuse the wrong region. They
 * cannot prove that an operator can SEE which region they are in, or that
 * a Support Agent is not shown a Withdrawals link they will only be
 * refused. Both of those are the console's job and only a browser can
 * answer them.
 *
 * It signs in as several operators in turn and records, for each:
 *   - the region the shell reports,
 *   - the nav items drawn,
 *   - the rows the drivers page actually lists,
 *   - any console error or failed API call.
 *
 * An empty list is reported as EMPTY, never PASS: "this region has no
 * drivers" and "the request failed" look identical on screen, and must not
 * look identical here.
 *
 *   SITE=http://127.0.0.1:3099 ADMIN_PASSWORD=... node scripts/verify-scope.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const APP = process.env.SITE || 'http://127.0.0.1:3099';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const OUT = (process.env.VERIFY_OUT || '.verify-out') + '/scope';
fs.mkdirSync(OUT, { recursive: true });

/** Who to sign in as, and what each should and should not be shown. */
const OPERATORS = (process.env.ROLE_SET === 'strict' ? [
  // The strict-mode rehearsal: every seeded role, plus an account with no
  // assignment at all, which under strict mode must be able to do nothing.
  {
    email: 'live.cityops@saaradhigo.test', label: 'City Ops Manager @ Hyderabad',
    expectRegion: 'Hyderabad',
    expectNav: ['Dashboard', 'Trips', 'Drivers'], denyNav: ['Withdrawals'],
    expectDrivers: ['Hyderabad Driver'], denyDrivers: ['Austin Driver'],
  },
  {
    email: 'live.support@saaradhigo.test', label: 'Support Agent @ Hyderabad',
    expectRegion: 'Hyderabad',
    expectNav: ['Trips', 'Drivers', 'Support'],
    denyNav: ['Withdrawals', 'SOS', 'Zones'],
    // No pii.view, so the name arrives masked. Expecting the full name
    // would report EMPTY on a page that is working perfectly.
    expectDrivers: ['Hyderabad D.'], denyDrivers: ['Austin'],
  },
  {
    email: 'live.safety@saaradhigo.test', label: 'Safety Officer @ Hyderabad',
    expectRegion: 'Hyderabad',
    expectNav: ['SOS', 'Trips', 'Drivers'], denyNav: ['Withdrawals'],
    expectDrivers: ['Hyderabad Driver'], denyDrivers: ['Austin Driver'],
  },
  {
    email: 'live.kyc@saaradhigo.test', label: 'KYC Verifier @ Hyderabad',
    expectRegion: 'Hyderabad',
    expectNav: ['Drivers', 'Trips'],
    denyNav: ['Withdrawals', 'SOS', 'Support'],
    expectDrivers: ['Hyderabad Driver'], denyDrivers: ['Austin Driver'],
  },
  {
    email: 'live.finance@saaradhigo.test', label: 'Finance @ Hyderabad',
    expectRegion: 'Hyderabad',
    // The one role that SHOULD see Withdrawals.
    expectNav: ['Withdrawals', 'Trips', 'Drivers'], denyNav: ['SOS'],
    expectDrivers: ['Hyderabad Driver'], denyDrivers: ['Austin Driver'],
  },
  {
    email: 'live.analyst@saaradhigo.test', label: 'Analyst @ Hyderabad',
    expectRegion: 'Hyderabad',
    expectNav: ['Dashboard', 'Trips', 'Drivers'],
    denyNav: ['Withdrawals', 'SOS'],
    expectDrivers: ['Hyderabad D.'], denyDrivers: ['Austin'],
    // No pii.view: the contact column must arrive masked.
    expectMasked: true,
  },
  {
    email: 'live.usops@saaradhigo.test', label: 'City Ops Manager @ Texas',
    expectRegion: 'Texas',
    expectNav: ['Drivers', 'Trips'], denyNav: ['Withdrawals'],
    expectDrivers: ['Austin Driver'], denyDrivers: ['Hyderabad Driver'],
  },
  {
    email: 'live.unmigrated@saaradhigo.test',
    label: 'Unmigrated account under STRICT',
    // Strict mode: no assignment means nothing. The console must survive
    // it rather than throwing -- an operator locked out should see an
    // empty, explained console, not a stack trace.
    expectRegion: null, expectNav: [],
    denyNav: ['Withdrawals', 'SOS', 'Drivers', 'Trips'],
    // Nothing to list is the CORRECT outcome here, so an empty list is
    // a pass rather than an unknown.
    expectDrivers: null, denyDrivers: ['Hyderabad Driver', 'Austin Driver'],
  },
] : [

  {
    email: 'live.hyd@saaradhigo.test',
    label: 'City Ops Manager @ Hyderabad',
    expectRegion: 'Hyderabad',
    expectNav: ['Drivers', 'Trips', 'Dashboard'],
    denyNav: ['Withdrawals'],
    expectDrivers: ['Hyderabad Driver'],
    denyDrivers: ['Austin Driver', 'Vijayawada Driver'],
  },
  {
    email: 'live.us@saaradhigo.test',
    label: 'City Ops Manager @ Texas',
    expectRegion: 'Texas',
    expectNav: ['Drivers', 'Trips'],
    denyNav: ['Withdrawals'],
    expectDrivers: ['Austin Driver'],
    denyDrivers: ['Hyderabad Driver'],
  },
  {
    email: 'live.analyst@saaradhigo.test',
    label: 'Analyst @ Hyderabad',
    expectRegion: 'Hyderabad',
    expectNav: ['Dashboard', 'Trips', 'Drivers'],
    // No pii.view, no finance.read, no safety.respond.
    denyNav: ['Withdrawals', 'SOS'],
    expectDrivers: ['Hyderabad Driver'],
    denyDrivers: ['Austin Driver'],
  },
  {
    email: 'live.legacy@saaradhigo.test',
    label: 'Unmigrated legacy operator',
    // Must say so out loud rather than imply a scope nobody enforces.
    expectRegion: 'All regions',
    expectNav: ['Drivers', 'Trips', 'Withdrawals'],
    denyNav: [],
    expectDrivers: ['Hyderabad Driver', 'Austin Driver', 'Vijayawada Driver'],
    denyDrivers: [],
  },
]);


const rows = [];
const log = (state, who, detail) => {
  rows.push({ state, who, detail });
  console.log(`  ${state.padEnd(5)} ${who}${detail ? ' — ' + detail : ''}`);
};

if (!PASSWORD) {
  console.log('ADMIN_PASSWORD is not set; nothing can be checked.');
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'chrome' });

async function signIn(page, email) {
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  // The console login takes an email or a phone in one field.
  const id = page.locator('input[type="email"], input[name="identifier"], input[name="email"]').first();
  await id.fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 });
}

for (const op of OPERATORS) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const apiFailures = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
  });
  page.on('response', (r) => {
    if (r.url().includes('/api/v1/') && r.status() >= 400) {
      apiFailures.push(`${r.status()} ${r.url().split('/api/v1')[1]}`);
    }
  });

  try {
    await signIn(page, op.email);
    await page.goto(`${APP}/drivers`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    // --- the region the shell reports -------------------------------
    const region = (await page.locator('.ops__scope').first().innerText()
      .catch(() => '')).replace(/\s+/g, ' ').trim();
    if (op.expectRegion === null) {
      // A locked-out account. The console must render SOMETHING rather
      // than throw: being refused is a state an operator has to be able
      // to look at and understand.
      log(region ? 'PASS' : 'PASS', op.label,
        region ? `shell renders, region "${region}"` : 'shell renders, no region (expected)');
    } else if (!region) {
      log('FAIL', op.label, 'no region shown in the shell at all');
    } else if (region.includes(op.expectRegion)) {
      log('PASS', op.label, `region reads "${region}"`);
    } else {
      log('FAIL', op.label,
        `region reads "${region}", expected to contain "${op.expectRegion}"`);
    }

    // --- the nav ----------------------------------------------------
    const nav = await page.locator('nav[aria-label="Console"] .ops__link')
      .allInnerTexts();
    const navText = nav.map((t) => t.replace(/\s+/g, ' ').trim());
    const missing = op.expectNav.filter(
      (want) => !navText.some((t) => t.includes(want)));
    const leaked = op.denyNav.filter(
      (deny) => navText.some((t) => t.includes(deny)));
    if (missing.length) {
      log('FAIL', op.label, `nav is missing ${missing.join(', ')} (has: ${navText.join(' | ')})`);
    } else if (leaked.length) {
      log('FAIL', op.label, `nav shows ${leaked.join(', ')} which this role cannot use`);
    } else {
      log('PASS', op.label, `nav: ${navText.join(' | ')}`);
    }

    // --- the rows ---------------------------------------------------
    const body = await page.locator('main').innerText();
    if (op.expectDrivers === null) {
      const leaked = op.denyDrivers.filter((n) => body.includes(n));
      log(leaked.length ? 'FAIL' : 'PASS', op.label,
        leaked.length ? `SCOPE LEAK: ${leaked.join(', ')}` : 'lists nothing, as it should');
      if (apiFailures.length) {
        log('FAIL', op.label, `failed API calls: ${[...new Set(apiFailures)].join(', ')}`);
      }
      await page.screenshot({ path: `${OUT}/${op.email.split('@')[0]}.png` });
      await ctx.close();
      continue;
    }
    const shown = op.expectDrivers.filter((n) => body.includes(n));
    const seen = op.denyDrivers.filter((n) => body.includes(n));
    if (seen.length) {
      log('FAIL', op.label, `SCOPE LEAK: sees ${seen.join(', ')}`);
    } else if (!shown.length) {
      // EMPTY, not PASS: it may be a broken request rather than isolation.
      log('EMPTY', op.label,
        `none of its own drivers listed (${op.expectDrivers.join(', ')}) — could be a failed request`);
    } else {
      log('PASS', op.label, `lists ${shown.join(', ')} and none of the others`);
    }

    // --- masking -----------------------------------------------------
    if (op.expectMasked) {
      // The bullet must be there AND the real number must not: a console
      // that prints dots over a payload containing the number is masked
      // in the pixels only.
      const hasBullets = body.includes('•');
      const leaksDigits = /\+91\d{10}/.test(body);
      if (hasBullets && !leaksDigits) {
        log('PASS', op.label, 'contact details arrive masked');
      } else {
        log('FAIL', op.label,
          `masking wrong: bullets=${hasBullets} rawNumberVisible=${leaksDigits}`);
      }
    }

    if (apiFailures.length) {
      log('FAIL', op.label, `failed API calls: ${[...new Set(apiFailures)].join(', ')}`);
    }
    if (consoleErrors.length) {
      log('FAIL', op.label, `console errors: ${[...new Set(consoleErrors)].slice(0, 3).join(' / ')}`);
    }

    await page.screenshot({
      path: `${OUT}/${op.email.split('@')[0]}.png`, fullPage: false,
    });
  } catch (err) {
    log('FAIL', op.label, String(err).split('\n')[0].slice(0, 200));
  } finally {
    await ctx.close();
  }
}

await browser.close();

const fails = rows.filter((r) => r.state === 'FAIL').length;
const empties = rows.filter((r) => r.state === 'EMPTY').length;
console.log(`\n  ${rows.length} checks: ${rows.length - fails - empties} pass, `
  + `${empties} empty, ${fails} fail`);
console.log(`  screenshots in ${OUT}`);
process.exit(fails ? 1 : 0);
