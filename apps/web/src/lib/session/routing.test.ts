/**
 * Gate: riders and drivers are kept to their own areas ON THE SERVER
 * (owner, 2026-11-08). Runs the real middleware against signed cookies.
 */
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { middleware } from '@/middleware';
import { SESSION_COOKIE, type Session, signSession, verifySession } from './cookie';
import { DRIVER_ROUTES, RIDER_ROUTES } from './routing';

const SECRET = 'test-secret-that-is-at-least-32-characters';
beforeAll(() => { process.env.WEB_SESSION_SECRET = SECRET; });

const exp = () => Math.floor(Date.now() / 1000) + 3600;
const rider: Session = { uid: '1', roles: ['rider'], role: 'rider', exp: exp() };
const driver: Session = { uid: '2', roles: ['driver'], role: 'driver', exp: exp() };

async function visit(path: string, session?: Session | string) {
  const req = new NextRequest(new URL(path, 'https://qa.example'));
  if (session) {
    const value = typeof session === 'string' ? session : await signSession(session, SECRET);
    req.cookies.set(SESSION_COOKIE, value);
  }
  const res = await middleware(req);
  return {
    redirect: res.headers.get('location') ? new URL(res.headers.get('location')!).pathname : null,
    rewrite: res.headers.get('x-middleware-rewrite') ? new URL(res.headers.get('x-middleware-rewrite')!).pathname : null,
  };
}

describe('role routing', () => {
  it.each(DRIVER_ROUTES)('a rider is sent from %s to /ride', async (p) => {
    expect((await visit(p, rider)).redirect).toBe('/ride');
  });

  it.each(RIDER_ROUTES)('a driver is sent from %s to /driver', async (p) => {
    expect((await visit(p, driver)).redirect).toBe('/driver');
  });

  it.each(RIDER_ROUTES)('a rider gets the rider area at %s', async (p) => {
    expect((await visit(p, rider)).rewrite).toBe(`/rider${p}`);
  });

  it.each(DRIVER_ROUTES)('a driver gets %s', async (p) => {
    const r = await visit(p, driver);
    expect(r.redirect).toBeNull();
    expect(r.rewrite).toBeNull();
  });

  it('a guest is asked to sign in for the areas, but keeps /ride and the console /trips', async () => {
    expect((await visit('/driver/earnings')).redirect).toBe('/driver/sign-in');
    expect((await visit('/account')).redirect).toBe('/sign-in');
    expect((await visit('/ride/choose')).redirect).toBe('/sign-in');
    expect((await visit('/ride')).redirect).toBeNull();
    expect((await visit('/trips')).rewrite).toBeNull();
    expect((await visit('/driver/sign-in')).redirect).toBeNull();
  });

  it('refuses a hand-written or tampered cookie', async () => {
    const forged = btoa(JSON.stringify(driver)).replace(/=+$/, '') + '.AAAA';
    expect((await visit('/driver', forged)).redirect).toBe('/driver/sign-in');
    const real = await signSession(rider, SECRET);
    const [body, sig] = real.split('.');
    const swapped = btoa(JSON.stringify({ ...rider, role: 'driver', roles: ['driver'] })).replace(/=+$/, '');
    expect(await verifySession(`${swapped}.${sig}`, SECRET)).toBeNull();
    expect(await verifySession(`${body}.${sig}`, SECRET)).not.toBeNull();
  });

  it('refuses an expired session', async () => {
    expect((await visit('/driver', { ...driver, exp: 10 })).redirect).toBe('/driver/sign-in');
  });

  it('an account with both roles is routed by the active one', async () => {
    const both: Session = { uid: '3', roles: ['rider', 'driver'], role: 'driver', exp: exp() };
    expect((await visit('/trips', both)).redirect).toBe('/driver');
    expect((await visit('/driver/payouts', { ...both, role: 'rider' })).redirect).toBe('/ride');
  });

  it('never serves /rider/* directly', async () => {
    expect((await visit('/rider/account', rider)).redirect).toBe('/ride');
  });
});
