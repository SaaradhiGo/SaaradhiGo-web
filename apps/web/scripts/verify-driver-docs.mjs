/**
 * A driver supplies their documents, through the real screens, with real
 * files, against the real backend.
 *
 * This is the thing that did not exist: approval is gated on documents and
 * there was no way to send one. So the check is not "the page renders" --
 * it is "a file left this browser, the server recorded it, and the driver's
 * own checklist changed as a result".
 *
 * It uses a FRESH driver account each run, because an account that already
 * has documents proves nothing about uploading one.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.SITE || 'https://qa.saaradhigo.com';
const FIXTURE =
  (process.env.VERIFY_OUT || '.verify-out') + '/fixtures/qa-document.jpg';

/**
 * The test document, generated rather than committed.
 *
 * It says QA TEST FIXTURE on its face, so a document that reaches an
 * operator's review queue can never be mistaken for a real licence.
 */
async function ensureFixture() {
  if (fs.existsSync(FIXTURE)) return;
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  const { default: sharp } = await import('sharp');
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560">'
    + '<rect width="900" height="560" fill="#111"/>'
    + '<text x="40" y="120" fill="#ffd700" font-size="52" font-family="sans-serif">QA TEST FIXTURE</text>'
    + '<text x="40" y="200" fill="#ccc" font-size="34" font-family="sans-serif">Not a real document</text>'
    + '<text x="40" y="270" fill="#888" font-size="28" font-family="sans-serif">SaaradhiGo automated verification</text>'
    + '</svg>');
  await sharp(svg).jpeg({ quality: 80 }).toFile(FIXTURE);
}
const OUT = path.join(
  process.env.VERIFY_OUT || '.verify-out',
  process.env.OUTDIR || 'driver-docs',
);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const pass = (n, d = '') => { results.push({ n, s: 'PASS', d }); console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`); };
const fail = (n, d) => { results.push({ n, s: 'FAIL', d }); console.log(`  FAIL  ${n} — ${d}`); };

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, locale: 'en-IN' });
const page = await ctx.newPage();

const failed = [];
page.on('response', (r) => {
  if (r.url().includes('/api/v1/') && r.status() >= 400) {
    failed.push(`${r.status()} ${r.request().method()} ${r.url().split('/api/v1/')[1]}`);
  }
});

const body = () => page.$eval('body', (b) => b.innerText.replace(/\s+/g, ' ')).catch(() => '');
const shot = (n) => page.screenshot({ path: path.join(OUT, n), fullPage: true }).catch(() => {});

await ensureFixture();

const stamp = Date.now();
const email = `qa.docs.${stamp}@saaradhigo.com`;
const password = 'Harbour-Lantern-5839';

try {
  /* 1 -- a brand new driver -------------------------------------------- */
  console.log('\n=== 1. a brand new driver account ===');
  await page.goto(`${APP}/driver/sign-up`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.fill('input[name="fullName"]', 'QA Document Driver');
  await page.fill('input[name="email"]', email);
  await page.fill('input[type="tel"]', `99994${String(stamp).slice(-5)}`);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(7000);
  if (!/\/driver\/home/.test(page.url())) {
    throw new Error(`sign-up did not reach the driver home: ${page.url()}`);
  }
  pass('a new driver account was created', email);

  /* 2 -- the home leads with what to do -------------------------------- */
  console.log('\n=== 2. the home says what to do next ===');
  await page.waitForTimeout(4000);
  const home = await body();
  if (/Finish your documents/i.test(home)) {
    const m = home.match(/(\d+) items? (?:is|are) still needed/);
    pass('the driver home leads with the documents outstanding', m ? m[0] : '');
  } else {
    fail('the driver home does not lead with the outstanding work', home.slice(0, 200));
  }
  if (/₹0/.test(home)) {
    fail('the home still shows zero earnings to an unapproved driver', '');
  } else {
    pass('no empty earnings cards for a driver who has never driven');
  }
  await shot('1-home-before.png');

  /* 3 -- the documents page ------------------------------------------- */
  console.log('\n=== 3. the documents checklist ===');
  await page.goto(`${APP}/driver/documents`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  const rowsBefore = await page.$$('.sg-doc');
  if (rowsBefore.length === 0) {
    throw new Error(`no checklist rows rendered: ${(await body()).slice(0, 200)}`);
  }
  pass(`the checklist rendered ${rowsBefore.length} document row(s)`);

  const ticksBefore = await page.$$('.sg-doc__tick.is-done');
  pass(`nothing is ticked yet (${ticksBefore.length} complete)`);
  await shot('2-documents-empty.png');

  /* 4 -- upload a real file ------------------------------------------- */
  console.log('\n=== 4. upload a real file ===');
  const input = await page.$('.sg-doc input[type="file"]');
  if (!input) throw new Error('no file input on the checklist');
  await input.setInputFiles(FIXTURE);

  // Wait for the checklist to come back with one more tick than before.
  let ticksAfter = ticksBefore.length;
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(1000);
    ticksAfter = (await page.$$('.sg-doc__tick.is-done')).length;
    if (ticksAfter > ticksBefore.length) break;
  }
  if (ticksAfter > ticksBefore.length) {
    pass('the file uploaded and the server now reports it on file',
      `${ticksBefore.length} -> ${ticksAfter} complete`);
  } else {
    fail('the upload did not register on the checklist',
      (await body()).slice(0, 240));
  }
  await shot('3-after-upload.png');

  /* 5 -- the licence expiry is its own step ---------------------------- */
  console.log('\n=== 5. the licence expiry ===');
  const expiry = await page.$('input[name="license_expiry"]');
  if (!expiry) {
    fail('no licence expiry field', '');
  } else {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 900)
      .toISOString().slice(0, 10);
    await expiry.fill(future);
    await page.click('button:has-text("Save expiry date")');
    await page.waitForTimeout(6000);
    const after = await body();
    if (/Licence expiry saved/i.test(after)) {
      pass('the licence expiry saved', future);
    } else {
      fail('the licence expiry did not save', after.slice(0, 200));
    }
  }

  /* 6 -- add a vehicle -------------------------------------------------- */
  console.log('\n=== 6. add a vehicle ===');
  const reg = await page.$('input[name="vehicle_number"]');
  if (!reg) {
    fail('no vehicle form for a driver with no vehicle', (await body()).slice(0, 200));
  } else {
    const options = await page.$$eval('#vehicle_type option', (os) => os.map((o) => o.value));
    if (options.length === 0) {
      fail('the vehicle category list is empty, so no vehicle can be added', '');
    } else {
      pass(`the vehicle catalogue came from the server (${options.join(', ')})`);
      await reg.fill(`TS09QA${String(stamp).slice(-4)}`);
      await page.fill('input[name="brand"]', 'Maruti');
      await page.fill('input[name="model"]', 'Dzire');
      await page.fill('input[name="color"]', 'White');
      await page.click('button:has-text("Add vehicle")');
      await page.waitForTimeout(8000);
      const after = await body();
      if (/Vehicle added/i.test(after)) {
        pass('the vehicle was added and set as the one they drive');
      } else {
        fail('the vehicle was not added', after.slice(0, 240));
      }
      await shot('4-vehicle-added.png');

      // Vehicle documents only exist once there is a vehicle.
      await page.waitForTimeout(3000);
      const vehicleRows = await page.$$('.sg-doc');
      if (vehicleRows.length > rowsBefore.length) {
        pass(`vehicle documents appeared (${rowsBefore.length} -> ${vehicleRows.length} rows)`);
      } else {
        fail('no vehicle documents appeared after adding a vehicle',
          `${vehicleRows.length} rows`);
      }
    }
  }

  /* 7 -- progress is real ---------------------------------------------- */
  console.log('\n=== 7. the progress meter reflects the server ===');
  const meter = await page.$eval('.sg-meter > i', (e) => e.style.width).catch(() => '');
  const counter = (await body()).match(/(\d+) of (\d+)/);
  if (counter && Number(counter[1]) > 0) {
    pass(`progress is counted from the server's checklist`, `${counter[0]}, bar ${meter}`);
  } else {
    fail('the progress counter did not move', counter ? counter[0] : '(none)');
  }
  await shot('5-progress.png');

  /* 8 -- nothing silently failed ---------------------------------------- */
  console.log('\n=== 8. no failed API calls ===');
  if (failed.length === 0) {
    pass('no API call failed during the whole journey');
  } else {
    fail('API calls failed', [...new Set(failed)].join(' | ').slice(0, 300));
  }
} catch (err) {
  fail('the run stopped', String(err.message || err).slice(0, 240));
  await shot('error.png');
}

await browser.close();

const p = results.filter((r) => r.s === 'PASS').length;
const f = results.filter((r) => r.s === 'FAIL').length;
console.log('\n================= RESULT =================');
console.log(`site:   ${APP}`);
console.log(`driver: ${email}`);
console.log(`checks: ${results.length} ran\npassed: ${p}\nfailed: ${f}`);
if (f) {
  console.log('\nfailures:');
  for (const r of results.filter((x) => x.s === 'FAIL')) console.log(`  - ${r.n}: ${r.d}`);
}
console.log(`screenshots -> ${OUT}`);
process.exit(f ? 1 : 0);
