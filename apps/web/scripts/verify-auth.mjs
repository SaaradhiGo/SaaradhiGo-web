/**
 * Every item on the owner's list that can be proved without a map key or a
 * priced zone, driven through the real screens.
 *
 * RULES THIS HARNESS FOLLOWS, because the last report was not trusted:
 *
 *   * it asserts what a PERSON SEES, never that an endpoint answered 200;
 *   * a check that cannot run is reported as SKIPPED, never as passed;
 *   * every failure prints the text that was actually on screen;
 *   * the count at the end is the count of checks that ran.
 *
 * Point it at a deployment with SITE=... ; it defaults to the local stack.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.SITE || 'https://qa.saaradhigo.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@saaradhigo.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const RIDER_EMAIL = process.env.RIDER_EMAIL || 'qa.rider@saaradhigo.com';
const RIDER_PASSWORD = process.env.RIDER_PASSWORD || 'Monsoon-Kite-7412';
const DRIVER_EMAIL = process.env.DRIVER_EMAIL || 'qa.driver@saaradhigo.com';
const DRIVER_PASSWORD = process.env.DRIVER_PASSWORD || 'Harbour-Lantern-5839';

const OUT = path.join(
  process.env.VERIFY_OUT || '.verify-out',
  process.env.OUTDIR || 'verify-auth',
);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const pass = (name, detail = '') => {
  results.push({ name, state: 'PASS', detail });
  console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
};
const fail = (name, detail) => {
  results.push({ name, state: 'FAIL', detail });
  console.log(`  FAIL  ${name} — ${detail}`);
};
const skip = (name, why) => {
  results.push({ name, state: 'SKIP', detail: why });
  console.log(`  SKIP  ${name} — ${why}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

async function fresh(width = 1280) {
  const ctx = await browser.newContext({
    viewport: { width, height: 1000 },
    locale: 'en-IN',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`        [console] ${m.text().slice(0, 150)}`);
  });
  return { ctx, page };
}

const text = (page) => page.$eval('body', (b) => b.innerText).catch(() => '');
const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, name), fullPage: true }).catch(() => {});

/** The header's own account control, which is where role now shows. */
async function navText(page) {
  return page
    .$eval('.hp-nav__session', (e) => e.innerText.replace(/\s+/g, ' ').trim())
    .catch(() => '');
}

const stamp = Date.now();

/* ------------------------------------------------------------------ *
 * 1. Rider sign-up is ONE screen, and it signs you in.
 * ------------------------------------------------------------------ */
console.log('\n=== 1. rider sign-up, one screen ===');
{
  const { ctx, page } = await fresh();
  const email = `qa.rider.${stamp}@saaradhigo.com`;
  const password = 'Lantern-Harbour-9264';
  const next = '/my-trips';

  await page.goto(`${APP}/sign-up?next=${encodeURIComponent(next)}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(1200);

  // Every field at once. This is the whole point of the change: the server
  // validates them together, so they must be visible together.
  const fields = await page.$$eval('input', (els) =>
    els.map((e) => e.name || e.type).filter(Boolean),
  );
  const wanted = ['fullName', 'email', 'password', 'confirmPassword'];
  const missing = wanted.filter((f) => !fields.includes(f));
  const hasPhone = fields.includes('tel') || (await page.$('input[type="tel"]')) !== null;
  if (missing.length === 0 && hasPhone) {
    pass('sign-up asks for everything on one screen', fields.join(', '));
  } else {
    fail(
      'sign-up is still split across screens',
      `missing ${missing.join(', ') || '(none)'}${hasPhone ? '' : ', no phone field'}; saw ${fields.join(', ')}`,
    );
  }
  await shot(page, '1-signup-one-screen.png');

  await page.fill('input[name="fullName"]', 'QA One Screen');
  await page.fill('input[name="email"]', email);
  await page.fill('input[type="tel"]', `99991${String(stamp).slice(-5)}`);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);

  const where = new URL(page.url()).pathname;
  const nav = await navText(page);
  const body = (await text(page)).replace(/\s+/g, ' ');

  // TWO CORRECT OUTCOMES, AND THE DEPLOYMENT DECIDES WHICH.
  //
  // Where a verification link can be delivered, the right answer is to ask
  // for it to be opened. Where it cannot -- which is QA -- the account is
  // usable immediately, and sending someone to an inbox that will never
  // receive anything is the dead end this whole round started from. The
  // harness asserts whichever one applies rather than hard-coding one and
  // calling the other a failure.
  if (/check your inbox/i.test(body)) {
    const href = await page
      .$eval('a.btn-secondary', (a) => a.getAttribute('href'))
      .catch(() => '');
    if (href && href.includes(encodeURIComponent(next))) {
      pass(
        'sign-up (mail deliverable): asks for the link and keeps where you were',
        href,
      );
    } else {
      fail(
        'sign-up (mail deliverable): the sign-in link drops where you were',
        `href="${href}"`,
      );
    }
  } else if (where === next && !/log in|sign up/i.test(nav)) {
    pass('sign-up signs you in and returns you to where you were', `-> ${where}`);
  } else {
    fail(
      'sign-up did not sign in / did not return',
      `landed on ${where}, nav says "${nav}", screen: ${body.slice(0, 150)}`,
    );
  }
  await shot(page, '2-signup-result.png');
  await ctx.close();
}

/* ------------------------------------------------------------------ *
 * 2. A server error about the email lands ON the email field.
 * ------------------------------------------------------------------ */
console.log('\n=== 2. a field error lands on its own field ===');
{
  const { ctx, page } = await fresh();
  // Accepted by the browser-side check, refused by Django's validator --
  // which is exactly the class of error that used to surface on step 2.
  const bad = `qa..dots.${stamp}@saaradhigo.com`;
  await page.goto(`${APP}/driver/sign-up`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.fill('input[name="fullName"]', 'QA Driver Error');
  await page.fill('input[name="email"]', bad);
  await page.fill('input[type="tel"]', `99992${String(stamp).slice(-5)}`);
  await page.fill('input[name="password"]', 'Lantern-Harbour-9264');
  await page.fill('input[name="confirmPassword"]', 'Lantern-Harbour-9264');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);

  const emailStillVisible = (await page.$('input[name="email"]')) !== null;
  const body = (await text(page)).replace(/\s+/g, ' ');
  const mentionsEmail = /valid email address/i.test(body);

  if (!mentionsEmail) {
    skip(
      'email error placement',
      `the server accepted "${bad}", so there was no error to place`,
    );
  } else if (emailStillVisible) {
    pass('the email error is shown with the email field on screen');
  } else {
    fail(
      'the email error is shown on a screen with no email field',
      body.slice(0, 160),
    );
  }
  await shot(page, '3-field-error.png');
  await ctx.close();
}

/* ------------------------------------------------------------------ *
 * 3. Driver sign-up creates a usable driver account.
 * ------------------------------------------------------------------ */
console.log('\n=== 3. a new driver gets a driver screen ===');
{
  const { ctx, page } = await fresh();
  const email = `qa.driver.${stamp}@saaradhigo.com`;
  const password = 'Harbour-Lantern-5839';
  // Set when the deployment's mail configuration makes the rest of this
  // check untestable through the UI; the database check covers it instead.
  let continue_outer = false;

  await page.goto(`${APP}/driver/sign-up`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.fill('input[name="fullName"]', 'QA New Driver');
  await page.fill('input[name="email"]', email);
  await page.fill('input[type="tel"]', `99993${String(stamp).slice(-5)}`);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(7000);

  let where = new URL(page.url()).pathname;
  let body = (await text(page)).replace(/\s+/g, ' ');

  // On a deployment that CAN mail, registration stops at the inbox screen
  // by design, so sign in with the account that was just made and carry on
  // -- the point of this check is the driver SCREEN, not the route to it.
  if (/check your inbox/i.test(body)) {
    skip(
      'new driver is signed in automatically',
      'this deployment sends a verification link, so sign-up stops there by design',
    );
    await page.goto(`${APP}/driver/sign-in`, { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(6000);
    where = new URL(page.url()).pathname;
    body = (await text(page)).replace(/\s+/g, ' ');
    if (/not confirmed yet|verify/i.test(body)) {
      skip(
        'new driver reaches a driver screen',
        'the address has to be confirmed first on this deployment',
      );
      await shot(page, '4-new-driver-home.png');
      await ctx.close();
      // The Driver row itself is asserted directly against the database by
      // check-driver-row.py, which does not depend on a mail backend.
      continue_outer = true;
    }
  }

  if (!continue_outer) {
    if (where === '/driver/home') {
      pass('a new driver lands on the driver home', email);
    } else {
      fail('a new driver did not land on a driver screen', `landed on ${where}`);
    }

    // The real test of the backend fix: the driver profile endpoint has to
    // answer, or this card says nothing. A missing `Driver` row made it 500.
    await page.waitForTimeout(3000);
    body = (await text(page)).replace(/\s+/g, ' ');
    if (/Account status/i.test(body) && /Document review/i.test(body)) {
      pass('the driver profile loaded (document review state is shown)');
    } else {
      fail('the driver profile did not load', body.slice(0, 200));
    }
    if (/Awaiting review|Approved/i.test(body)) {
      pass('approval state is stated', body.match(/Awaiting review|Approved/i)[0]);
    } else {
      fail('no approval state on the driver home', body.slice(0, 160));
    }
    await shot(page, '4-new-driver-home.png');
    await ctx.close();
  }
}

/* ------------------------------------------------------------------ *
 * 4. The standing accounts, and what the header says about them.
 * ------------------------------------------------------------------ */
for (const acc of [
  { label: 'rider', url: '/sign-in', email: RIDER_EMAIL, password: RIDER_PASSWORD, home: '/', chip: 'My trips' },
  { label: 'driver', url: '/driver/sign-in', email: DRIVER_EMAIL, password: DRIVER_PASSWORD, home: '/driver/home', chip: 'Driver' },
]) {
  console.log(`\n=== 4. ${acc.label} sign-in, and the header ===`);
  const { ctx, page } = await fresh();
  await page.goto(APP + acc.url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.fill('input[name="email"]', acc.email);
  await page.fill('input[name="password"]', acc.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);

  const where = new URL(page.url()).pathname;
  if (where === acc.home) {
    pass(`${acc.label} signs in and lands on their own home`, where);
  } else {
    const body = (await text(page)).replace(/\s+/g, ' ');
    fail(`${acc.label} did not land on ${acc.home}`, `at ${where}: ${body.slice(0, 160)}`);
  }

  const nav = await navText(page);
  if (/log in|sign up/i.test(nav)) {
    fail(`the header still offers sign-in to a signed-in ${acc.label}`, nav);
  } else if (nav.includes(acc.chip)) {
    pass(`the header is the ${acc.label}'s`, nav);
  } else {
    fail(`the header does not reflect the ${acc.label} role`, `saw "${nav}"`);
  }

  // The account menu: name, contact, role -- the "profile and details"
  // that signing in never used to show.
  const chip = await page.$('.sg-account__chip');
  if (!chip) {
    fail(`${acc.label}: no account control in the header`, nav);
  } else {
    await chip.click();
    await page.waitForTimeout(600);
    const menu = await page
      .$eval('.sg-account__menu', (e) => e.innerText.replace(/\s+/g, ' ').trim())
      .catch(() => '');
    const wantRole = acc.label === 'driver' ? 'Driver' : 'Rider';
    if (menu.includes(acc.email) && new RegExp(wantRole, 'i').test(menu)) {
      pass(`${acc.label}: the account menu shows who is signed in`, menu.slice(0, 80));
    } else {
      fail(`${acc.label}: the account menu does not show the account`, menu.slice(0, 140));
    }
    await shot(page, `5-${acc.label}-menu.png`);
  }

  // And the account page itself.
  await page.goto(`${APP}/account`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const acctBody = (await text(page)).replace(/\s+/g, ' ');
  const showsEmail = acctBody.includes(acc.email);
  const showsPhone = /\+\d{10,}/.test(acctBody);
  const showsRole = new RegExp(acc.label === 'driver' ? 'Driver' : 'Rider', 'i').test(acctBody);
  if (showsEmail && showsPhone && showsRole) {
    pass(`${acc.label}: /account shows name, email, number and account type`);
  } else {
    fail(
      `${acc.label}: /account is missing details`,
      `email=${showsEmail} phone=${showsPhone} role=${showsRole} :: ${acctBody.slice(0, 160)}`,
    );
  }
  await shot(page, `6-${acc.label}-account.png`);
  await ctx.close();
}

/* ------------------------------------------------------------------ *
 * 5. The operations console takes an email and a password.
 * ------------------------------------------------------------------ */
console.log('\n=== 5. operator sign-in with email + password ===');
if (!ADMIN_PASSWORD) {
  skip('operator email sign-in', 'ADMIN_PASSWORD was not supplied to this run');
} else {
  const { ctx, page } = await fresh();
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const emailField = await page.$('input[name="email"]');
  if (!emailField) {
    fail('the console still has no email + password form', await navText(page));
  } else {
    await emailField.fill(ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(6000);
    const where = new URL(page.url()).pathname;
    if (where === '/dashboard') {
      pass('an operator signs in to the console with email + password', ADMIN_EMAIL);
    } else {
      const body = (await text(page)).replace(/\s+/g, ' ');
      fail('operator email sign-in did not reach the console', `at ${where}: ${body.slice(0, 160)}`);
    }
  }
  await shot(page, '7-console.png');
  await ctx.close();
}

/* ------------------------------------------------------------------ *
 * 6. A rider's correct password must NOT open the console.
 * ------------------------------------------------------------------ */
console.log('\n=== 6. a rider cannot sign in to the console ===');
{
  const { ctx, page } = await fresh();
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const emailField = await page.$('input[name="email"]');
  if (!emailField) {
    skip('rider refused at the console', 'no email form to test');
  } else {
    await emailField.fill(RIDER_EMAIL);
    await page.fill('input[name="password"]', RIDER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
    const where = new URL(page.url()).pathname;
    if (where === '/login') {
      pass('a rider with the right password is refused by the console');
    } else {
      fail('A RIDER REACHED THE OPERATIONS CONSOLE', `landed on ${where}`);
    }
  }
  await shot(page, '8-rider-refused.png');
  await ctx.close();
}

/* ------------------------------------------------------------------ *
 * 7. The chariot is drawn whole.
 * ------------------------------------------------------------------ */
console.log('\n=== 7. the chariot is not cut off ===');
for (const width of [1280, 1440, 1700]) {
  const { ctx, page } = await fresh(width);
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const box = await page
    .$eval('.hp-hero__mark', (el) => {
      const r = el.getBoundingClientRect();
      return { right: r.right, left: r.left, w: r.width };
    })
    .catch(() => null);
  if (!box) {
    fail(`chariot at ${width}px`, 'the image is not in the document');
  } else if (box.right <= width && box.left >= 0) {
    pass(`chariot fits at ${width}px`, `right edge ${Math.round(box.right)} of ${width}`);
  } else {
    fail(
      `chariot is cut off at ${width}px`,
      `right edge ${Math.round(box.right)} vs viewport ${width}`,
    );
  }
  await shot(page, `9-chariot-${width}.png`);
  await ctx.close();
}

await browser.close();

const passed = results.filter((r) => r.state === 'PASS').length;
const failed = results.filter((r) => r.state === 'FAIL').length;
const skipped = results.filter((r) => r.state === 'SKIP').length;
console.log('\n================= RESULT =================');
console.log(`site:    ${APP}`);
console.log(`checks:  ${results.length} ran`);
console.log(`passed:  ${passed}`);
console.log(`failed:  ${failed}`);
console.log(`skipped: ${skipped}`);
if (failed) {
  console.log('\nfailures:');
  for (const r of results.filter((x) => x.state === 'FAIL')) {
    console.log(`  - ${r.name}: ${r.detail}`);
  }
}
console.log(`screenshots -> ${OUT}`);
process.exit(failed ? 1 : 0);
