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

async function visit(path: string, session?: Session | string, area?: string) {
  const req = new NextRequest(new URL(path, 'https://qa.example'));
  if (area) req.cookies.set('sg-area', area);
  if (session) {
    const value = typeof session === 'string' ? session : await signSession(session, SECRET);
    req.cookies.set(SESSION_COOKIE, value);
  }
  const res = await middleware(req);
  const location = res.headers.get('location');
  return {
    next: location ? new URL(location).searchParams.get('next') : null,
    redirect: location ? new URL(location).pathname : null,
    rewrite: res.headers.get('x-middleware-rewrite') ? new URL(res.headers.get('x-middleware-rewrite')!).pathname : null,
    gate: res.headers.get('x-middleware-rewrite')
      ? (() => { const u = new URL(res.headers.get('x-middleware-rewrite')!); return u.pathname === '/role-gate' ? `${u.searchParams.get('need')} ${u.searchParams.get('next')}` : null; })()
      : null,
  };
}

describe('role routing', () => {
  // 13 Nov (owner): one account, two roles, and never a silent redirect into the other area.
  it.each(DRIVER_ROUTES)('a rider on %s gets the driving gate, not a redirect', async (p) => {
    const r = await visit(p, rider);
    expect(r.redirect).toBeNull();
    expect(r.gate).toBe(`driver ${p}`);
  });

  it.each(RIDER_ROUTES.filter((p) => p !== '/ride'))('a driver on %s gets the riding gate, not a redirect', async (p) => {
    const r = await visit(p, driver);
    expect(r.redirect).toBeNull();
    expect(r.gate).toBe(`rider ${p}`);
  });

  it('a driver keeps the public /ride explainer', async () => {
    const r = await visit('/ride', driver);
    expect(r.redirect).toBeNull();
    expect(r.rewrite).toBeNull();
  });

  it.each(RIDER_ROUTES)('a rider gets the rider area at %s', async (p) => {
    expect((await visit(p, rider)).rewrite).toBe(`/rider${p}`);
  });

  it.each(DRIVER_ROUTES)('a driver gets %s', async (p) => {
    const r = await visit(p, driver);
    expect(r.redirect).toBeNull();
    expect(r.rewrite).toBeNull();
  });

  it('a guest is asked to sign in for the areas, but keeps /ride', async () => {
    expect((await visit('/driver/earnings')).redirect).toBe('/driver/sign-in');
    expect((await visit('/account')).redirect).toBe('/sign-in');
    // 14 Nov: a guest sees the fares; sign-in is asked at Book.
    expect((await visit('/ride/choose')).redirect).toBeNull();
    expect((await visit('/ride/choose')).rewrite).toBeNull();
    expect((await visit('/ride')).redirect).toBeNull();
    expect((await visit('/trips')).redirect).toBe('/sign-in');
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

  describe('an account with both roles', () => {
    const both: Session = { uid: '3', roles: ['rider', 'driver'], role: 'driver', exp: exp() };
    const riding: Session = { ...both, role: 'rider' };
    it.each(RIDER_ROUTES)('riding: %s is the rider area', async (p) => {
      expect((await visit(p, riding)).rewrite).toBe(`/rider${p}`);
    });
    it.each(DRIVER_ROUTES)('riding: %s offers the switch to driving', async (p) => {
      expect((await visit(p, riding)).gate).toBe(`driver ${p}`);
    });
    it.each(DRIVER_ROUTES)('driving: %s is the driver area', async (p) => {
      const r = await visit(p, both);
      expect([r.redirect, r.rewrite]).toEqual([null, null]);
    });
    it.each(RIDER_ROUTES.filter((p) => p !== '/ride'))('driving: %s offers the switch to riding', async (p) => {
      expect((await visit(p, both)).gate).toBe(`rider ${p}`);
    });
  });

  it.each(['/ride/trip/1', '/account', '/driver', '/driver/profile'])('a guest on %s is asked to sign in', async (p) => {
    const r = await visit(p);
    expect(r.redirect).toBe(p.startsWith('/driver') ? '/driver/sign-in' : '/sign-in');
    expect(r.next).toBe(p);
  });

  it('"Driver sign in" while riding opens the driving gate; while driving, the driver home', async () => {
    expect((await visit('/driver/sign-in', rider)).gate).toBe('driver /driver');
    expect((await visit('/driver/sign-in', driver)).redirect).toBe('/driver');
    expect((await visit('/my-trips', driver)).gate).toBe('rider /trips');
  });

  it('never serves /rider/* directly', async () => {
    expect((await visit('/rider/account', rider)).redirect).toBe('/ride');
  });
});

describe('the console lives under /ops, and riders own /trips (13 Nov)', () => {
  const PUBLIC = ['/', '/ride', '/drive', '/safety', '/about', '/help', '/contact', '/fares', '/terms', '/driver-terms',
    '/privacy', '/refunds', '/text-messages', '/cookies', '/delete-account', '/grievance', '/sign-in', '/sign-up',
    '/driver/sign-in', '/driver/sign-up', '/book', '/my-trips'];
  const PERSONAS: [string, Session | undefined][] = [['guest', undefined], ['rider', rider], ['driver', driver],
    ['both, riding', { uid: '3', roles: ['rider', 'driver'], role: 'rider', exp: exp() }]];
  const STAFF = /^\/(ops\/)?login(\/|$)/;

  it.each(PERSONAS)('no public or rider path ever sends a %s to the staff login', async (_name, who) => {
    for (const p of [...PUBLIC, ...RIDER_ROUTES, '/trips/207', '/ride/trip/207']) {
      const r = await visit(p, who);
      expect(r.redirect ?? '').not.toMatch(STAFF);
      expect(r.rewrite ?? '').not.toMatch(/^\/ops/);
    }
  });

  it.each(['/trips', '/trips/207', '/ride/trip/207', '/account'])('a guest on %s gets the rider sign-in, keeping the page', async (p) => {
    for (const area of [undefined, 'rider', 'driver', 'console']) {
      const r = await visit(p, undefined, area);
      expect(r.redirect).toBe('/sign-in');
      expect(r.next).toBe(p);
    }
  });

  it.each(['/approvals', '/drivers/18', '/finance/payouts', '/live-ops', '/login', '/settings/security', '/support/12'])(
    'the old console path %s redirects to its /ops twin', async (p) => {
      expect((await visit(`${p}?x=1`)).redirect).toBe(`/ops${p}`);
    });

  it('/book redirects to /ride', async () => {
    expect((await visit('/book?class=sedan')).redirect).toBe('/ride');
  });

  it('the staff login exists only at /ops/login', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const app = path.resolve(__dirname, '../../app');
    expect(fs.existsSync(path.join(app, '(staff)/ops/login/page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(app, 'login'))).toBe(false);
    expect(fs.existsSync(path.join(app, '(console)/ops/trips/page.tsx'))).toBe(true);
  });
});
