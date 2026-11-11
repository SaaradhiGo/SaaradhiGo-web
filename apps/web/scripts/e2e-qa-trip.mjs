// Usage: SEC_FILE=<private token file, never committed> node scripts/e2e-qa-trip.mjs
// The file holds RIDER_/DRIVER_ TOK and REF lines for the QA test accounts (AUDIT 29).
// QA end-to-end: the rider books on the web, the driver (over the app's own
// sockets) accepts, is told the ride code the rider's screen shows, starts and
// ends the trip; then the receipt must match the locked fare and the driver's
// earnings and trips must have moved. Tokens come from the private file and
// are never printed. Prints steps and amounts only.
import { chromium } from 'playwright-core';
import { signIn, tokens } from './qa-login.mjs';

const SITE = process.env.SITE || 'https://www.qa.saaradhigo.com';
const API = 'https://backend-qa-811d.up.railway.app/api/v1';
const WSB = 'wss://backend-qa-811d.up.railway.app';
const OUT = process.env.OUT;
const FROM = [17.4504, 78.381], TO = [17.4344, 78.3866];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};

async function api(tok, path) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${tok}` } });
  const j = await r.json().catch(() => null);
  return j?.data ?? j;
}

function socket(url) {
  const ws = new WebSocket(url);
  const queue = [];
  const waiters = [];
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    const w = waiters.findIndex((x) => x.test(m));
    if (w >= 0) waiters.splice(w, 1)[0].resolve(m); else queue.push(m);
  };
  const opened = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const next = (test, ms) => {
    const i = queue.findIndex(test);
    if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
    return new Promise((resolve) => {
      const w = { test, resolve };
      waiters.push(w);
      setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) { waiters.splice(k, 1); resolve(null); } }, ms);
    });
  };
  return { ws, opened, next };
}

const driver = await tokens('DRIVER');
const before = await api(driver.access, '/driver/earnings/period/?period=today');
log('driver today before:', before?.trips, 'trips, net', before?.net);

// Driver online near the pickup, pinging its position.
const loc = socket(`${WSB}/ws/driver/location/?token=${driver.access}&lat=${FROM[0] - 0.003}&lng=${FROM[1] - 0.002}`);
await loc.opened;
const ping = setInterval(() => { try { loc.ws.send(JSON.stringify({ lat: FROM[0] - 0.003, lng: FROM[1] - 0.002 })); } catch {} }, 4000);
log('driver online');

// Rider books on the web.
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, geolocation: { latitude: FROM[0], longitude: FROM[1] }, permissions: ['geolocation'] });
await ctx.addInitScript(() => { try { localStorage.setItem('sg-theme', 'light'); } catch {} });
log('rider session', (await signIn(ctx, SITE, 'RIDER')).status);
const page = await ctx.newPage();
await page.goto(`${SITE}/ride/choose?from=${FROM.join(',')}&to=${TO.join(',')}&tl=Inorbit%20Mall%2C%20Madhapur`, { waitUntil: 'networkidle', timeout: 60000 });
const option = page.getByRole('radio', { name: /Sedan/ });
await option.waitFor({ timeout: 30000 });
await option.click();
const locked = (await option.innerText()).match(/₹[\d,.]+/)?.[0];
results.locked = locked;
log('rider picked Sedan, locked fare', locked);
await page.getByRole('button', { name: /^Book Sedan/ }).click();

const offer = await loc.next((m) => m.type === 'ride_request', 120000);
if (!offer) { log('FAIL no offer reached the driver in 2 min'); process.exit(1); }
const tripId = offer.trip_id;
log('driver offered trip', tripId, 'fare', offer.estimated_fare);
await page.waitForURL(new RegExp(`/ride/trip/${tripId}`), { timeout: 30000 }).catch(() => {});
log('rider on', new URL(page.url()).pathname);

const trip = socket(`${WSB}/ws/ride/trip/${tripId}/?token=${driver.access}`);
await trip.opened;
let n = 0;
async function act(action, extra = {}) {
  const command_id = `${action}-${Date.now()}-${n++}`;
  trip.ws.send(JSON.stringify({ action, command_id, ...extra }));
  const m = await trip.next((x) => (x.type === 'command_ack' && x.command_id === command_id) || x.type === 'error', 20000);
  return m?.type === 'error' ? `error: ${m.message}` : m?.status ?? 'no ack';
}
log('accept', await act('accept'));
await sleep(5000);
log('reached', await act('reached'));

// The rider reads the code off their screen and tells the driver.
await page.getByRole('button', { name: 'Show' }).waitFor({ timeout: 30000 });
if (OUT) await page.screenshot({ path: `${OUT}/e2e-rider-trip-hidden.png` });
await page.getByRole('button', { name: 'Show' }).click();
const code = (await page.locator('.ar-panel [aria-live="polite"]').innerText()).replace(/\D/g, '');
log('rider screen shows a', code.length, 'digit code');
const wrong = code.split('').reverse().join('') === code ? '000000' : code.split('').reverse().join('');
log('start with a wrong code:', await act('start', { otp: wrong }));
log('start with the code from the rider screen:', await act('start', { otp: code }));
await sleep(6000);
log('complete', await act('complete'));
await sleep(3000);
log('confirm cash', await act('confirm_cash'));
clearInterval(ping);
loc.ws.close(); trip.ws.close();

// Receipt on the web must match the locked fare.
await sleep(4000);
await page.goto(`${SITE}/trips/${tripId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const receipt = await page.evaluate(() => document.querySelector('main')?.innerText ?? '');
if (OUT) await page.screenshot({ path: `${OUT}/e2e-rider-receipt.png` });
const paid = receipt.match(/You paid\s*(₹[\d,.]+)/)?.[1];
results.paid = paid;
results.matches = /Matches your locked fare/.test(receipt);
log('receipt: you paid', paid, '| matches badge', results.matches);
await browser.close();

const after = await api(driver.access, '/driver/earnings/period/?period=today');
const hist = await api(driver.access, '/ride/driver-history/?page_size=5');
const inHist = (hist?.results ?? []).some((t) => t.id === tripId && t.status === 'completed');
log('driver today after:', after?.trips, 'trips, net', after?.net, '| trip in driver history:', inHist);
const ok = locked && paid === locked && results.matches && after?.trips === (before?.trips ?? 0) + 1 && Number(after?.net) > Number(before?.net) && inHist;
console.log(ok ? `E2E PASS trip ${tripId}` : `E2E FAIL trip ${tripId}`, JSON.stringify(results));
process.exit(ok ? 0 : 1);
