// Signs a browser context in as a QA rider or driver from the private token file,
// the way the site does after a sign-in: tokens in localStorage, then /api/session.
// The access token lasts 15 minutes, so the pair is renewed with the refresh token
// first and the new pair written back. Nothing is printed.
import { readFileSync, writeFileSync } from 'node:fs';
const SEC = process.env.SEC_FILE;
const API = process.env.API || 'https://backend-qa-811d.up.railway.app/api/v1';
function read() {
  return Object.fromEntries(readFileSync(SEC, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}
export async function tokens(label) {
  const t = read();
  const res = await fetch(`${API}/auth/refresh/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: t[`${label}_REF`] }) });
  const j = await res.json().catch(() => null);
  const d = j?.data ?? j;
  if (res.ok && d?.token) {
    t[`${label}_TOK`] = d.token;
    if (d.refresh_token) t[`${label}_REF`] = d.refresh_token;
    writeFileSync(SEC, Object.entries(t).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  }
  return { access: t[`${label}_TOK`], refresh: t[`${label}_REF`], renewed: res.ok };
}
export async function signIn(ctx, site, label) {
  const { access, refresh, renewed } = await tokens(label);
  const page = await ctx.newPage();
  await page.goto(site + '/help', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ access, refresh }) => {
    localStorage.setItem('saaradhi_rider_access_token', access);
    localStorage.setItem('saaradhi_rider_refresh_token', refresh);
  }, { access, refresh });
  const status = await page.evaluate(async (token) => (await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })).status, access);
  await page.close();
  return { status, renewed };
}
