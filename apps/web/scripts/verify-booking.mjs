/**
 * The booking journey, against the real QA backend.
 *
 * The three things the owner said were wrong:
 *   * prices should appear without pressing "Show fares";
 *   * /book must not demand a sign-in;
 *   * guest booking with an email or a mobile number must exist.
 *
 * It books a REAL trip on QA and then cancels it, because "it reaches the
 * dispatch screen" is not the same claim as "a trip was created". The
 * cancellation is part of the run, not an afterthought: a test that leaves a
 * live request on the board is a test somebody else has to clean up.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.SITE || 'https://qa.saaradhigo.com';
const PHONE = process.env.GUEST_PHONE || '9999000001';
const CODE = process.env.GUEST_CODE || '100001';
const BOOK = process.env.BOOK_FOR_REAL === '1';

const OUT = path.join(
  process.env.VERIFY_OUT || '.verify-out',
  process.env.OUTDIR || 'verify-booking',
);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const pass = (n, d = '') => { results.push({ n, s: 'PASS', d }); console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`); };
const fail = (n, d) => { results.push({ n, s: 'FAIL', d }); console.log(`  FAIL  ${n} — ${d}`); };
const skip = (n, d) => { results.push({ n, s: 'SKIP', d }); console.log(`  SKIP  ${n} — ${d}`); };

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, locale: 'en-IN' });
const page = await ctx.newPage();

const api = [];
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/api/v1/')) api.push({ p: u.split('/api/v1/')[1].split('?')[0], s: r.status() });
});

const body = () => page.$eval('body', (b) => b.innerText.replace(/\s+/g, ' ')).catch(() => '');
const shot = (n) => page.screenshot({ path: path.join(OUT, n), fullPage: true }).catch(() => {});

try {
  /* 1 -- a real trip from the homepage ------------------------------- */
  console.log('\n=== 1. pick a real pickup and destination ===');
  await page.goto(APP + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  async function pick(index, typed, what) {
    const fields = await page.$$('.hp-field__box input');
    await fields[index].fill(typed);
    await page.waitForTimeout(2500);
    const options = await page.$$('.hp-suggest button');
    if (options.length === 0) throw new Error(`no ${what} suggestions for "${typed}"`);
    const chosen = (await options[0].textContent()).trim();
    await options[0].click();
    await page.waitForTimeout(800);
    return chosen;
  }

  const pickup = await pick(0, 'Forum Mall Kukatpally', 'pickup');
  pass('pickup search works from the homepage', pickup.slice(0, 44));
  const dest = await pick(1, 'Inorbit Mall Madhapur', 'destination');
  pass('destination search works', dest.slice(0, 44));

  /* 2 -- fares arrive WITHOUT a press --------------------------------- */
  console.log('\n=== 2. fares, with nothing pressed ===');
  await page.click('.hp-hero__form .sg-btn--primary');
  await page.waitForURL(/\/book/, { timeout: 30000 });

  const showFares = await page.$('button:has-text("Show fares")');
  if (showFares) {
    fail('"Show fares" is still there', 'the prices are still behind a press');
  } else {
    pass('there is no "Show fares" button to press');
  }

  // Nothing is clicked between arriving and reading the prices.
  let priced = '';
  for (let i = 0; i < 25; i += 1) {
    await page.waitForTimeout(1000);
    priced = await body();
    if ((priced.match(/₹\s?[\d,]+/g) || []).length >= 2) break;
  }
  const fares = (priced.match(/₹\s?[\d,]+/g) || []).slice(0, 6);
  if (fares.length >= 2) {
    pass('fares appear on their own, signed out', fares.join('  '));
  } else {
    fail('no fares appeared without pressing anything', priced.slice(0, 220));
  }
  await shot('1-fares-unprompted.png');

  const fareCalls = api.filter((c) => c.p.includes('estimate-fare'));
  const ok200 = fareCalls.filter((c) => c.s === 200).length;
  if (fareCalls.length && ok200 === fareCalls.length) {
    pass('every fare came from the server', `${ok200}/${fareCalls.length} at 200`);
  } else if (fareCalls.length) {
    fail('some fare calls failed', `${ok200}/${fareCalls.length} at 200`);
  } else {
    fail('no /ride/estimate-fare/ call was made at all', '');
  }

  /* 3 -- the confirm button, signed out -------------------------------- */
  console.log('\n=== 3. confirm does not demand an account ===');
  const confirm = await page.$('.sg-ws__primary button');
  const label = confirm ? (await confirm.textContent()).replace(/\s+/g, ' ').trim() : '';
  if (!confirm) {
    fail('no confirm button for a signed-out visitor', priced.slice(0, 160));
  } else if (/sign in to confirm/i.test(label)) {
    fail('confirm still says it needs a sign-in', label);
  } else if (/^confirm/i.test(label)) {
    pass('confirm reads as confirm, signed out', label);
  } else {
    fail('confirm says something unexpected', label);
  }

  await confirm.click();
  await page.waitForTimeout(1500);
  if (/\/sign-in/.test(page.url())) {
    fail('pressing confirm still throws you at the sign-in page', page.url());
  } else {
    pass('pressing confirm keeps you on the booking page');
  }

  /* 4 -- the guest form ------------------------------------------------ */
  console.log('\n=== 4. guest booking, with a name, a mobile and an email ===');
  const guestBody = await body();
  const hasName = (await page.$('input[name="guestName"]')) !== null;
  const hasPhone = (await page.$('input[type="tel"]')) !== null;
  const hasEmail = (await page.$('input[name="guestEmail"]')) !== null;
  if (hasName && hasPhone && hasEmail) {
    pass('the guest form asks for a name, a mobile number and an email');
  } else {
    fail('the guest form is incomplete',
      `name=${hasName} mobile=${hasPhone} email=${hasEmail} :: ${guestBody.slice(0, 180)}`);
  }
  const signInOption = await page.$('button:has-text("I already have an account")');
  if (signInOption) pass('signing in is offered beside booking as a guest');
  else fail('no sign-in option on the guest step', guestBody.slice(0, 160));
  await shot('2-guest-form.png');

  if (!BOOK) {
    skip('guest books a real trip', 'BOOK_FOR_REAL=1 was not set; no trip was dispatched on QA');
  } else {
    await page.fill('input[name="guestName"]', 'QA Guest Rider');
    await page.fill('input[type="tel"]', PHONE);
    await page.fill('input[name="guestEmail"]', 'qa.guest@saaradhigo.com');
    await page.waitForTimeout(400);
    const send = await page.$('form button[type="submit"]');
    if (await send.isDisabled()) {
      fail('"Send code" is disabled for the documented QA test number', PHONE);
    } else {
      await send.click();
      await page.waitForTimeout(4000);
      const otp = await page.$('input[name="otp"]');
      if (!otp) {
        fail('no code field after Send code', (await body()).slice(0, 180));
      } else {
        pass('a code was requested without an SMS (QA test number)');
        await otp.fill(CODE);
        await page.click('form button[type="submit"]');

        // The ride is requested the instant the code is accepted -- that is
        // the point of guest checkout. Wait for the live-trip panel.
        let booked = '';
        for (let i = 0; i < 30; i += 1) {
          await page.waitForTimeout(1000);
          booked = await body();
          if (/Finding your Saaradhi|driver on the way|Waiting for a driver/i.test(booked)) break;
        }
        if (/Finding your Saaradhi|Waiting for a driver|on the way/i.test(booked)) {
          pass('a guest booked a real ride, with no account and no password');
        } else {
          fail('the guest code was accepted but no ride was created', booked.slice(0, 220));
        }
        await shot('3-guest-booked.png');

        // The header must now show the guest as a signed-in rider.
        const nav = await page.$eval('.hp-nav__session', (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
        if (/log in|sign up/i.test(nav)) {
          fail('the header still offers sign-in after a guest booking', nav);
        } else {
          pass('the guest has a session and the header shows it', nav);
        }

        /* 5 -- clean up: cancel the trip --------------------------- */
        console.log('\n=== 5. cancel the trip this test created ===');
        const cancel = await page.$('button:has-text("Cancel ride")');
        if (!cancel) {
          fail('NO CANCEL CONTROL — a live trip was left on the QA board', '');
        } else {
          await cancel.click();
          await page.waitForTimeout(6000);
          const after = await body();
          if (/cancelled/i.test(after)) {
            pass('the trip was cancelled, nothing left running on QA');
          } else {
            fail('CANCEL DID NOT CONFIRM — check the QA board by hand', after.slice(0, 200));
          }
          await shot('4-cancelled.png');
        }
      }
    }
  }
} catch (err) {
  fail('the run stopped', String(err.message || err).slice(0, 220));
  await shot('error.png');
}

await browser.close();

const p = results.filter((r) => r.s === 'PASS').length;
const f = results.filter((r) => r.s === 'FAIL').length;
const s = results.filter((r) => r.s === 'SKIP').length;
console.log('\n================= RESULT =================');
console.log(`site:    ${APP}`);
console.log(`checks:  ${results.length} ran`);
console.log(`passed:  ${p}\nfailed:  ${f}\nskipped: ${s}`);
if (f) {
  console.log('\nfailures:');
  for (const r of results.filter((x) => x.s === 'FAIL')) console.log(`  - ${r.n}: ${r.d}`);
}
console.log(`screenshots -> ${OUT}`);
process.exit(f ? 1 : 0);
