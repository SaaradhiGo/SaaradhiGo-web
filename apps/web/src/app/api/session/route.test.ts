/**
 * POST /api/session for an account that rides and drives (13 Nov): the role asked for wins;
 * with none asked for, the browser keeps the area it is using, never silently the first role.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE, signSession, verifySession } from '@/lib/session/cookie';
import { POST } from './route';

const SECRET = 'test-secret-that-is-at-least-32-characters';
beforeAll(() => { process.env.WEB_SESSION_SECRET = SECRET; });
afterEach(() => vi.unstubAllGlobals());

function backend(roles: string[], role = roles[roles.length - 1]) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { user: { id: 70, role, roles } } }), { status: 200 })));
}

async function post(body: object, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL('/api/session', 'https://qa.example'), { method: 'POST', body: JSON.stringify(body) });
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  const res = await POST(req);
  const value = res.cookies.get(SESSION_COOKIE)?.value;
  return (await verifySession(value, SECRET))?.role;
}

describe('POST /api/session, an account with both roles', () => {
  it('the driver sign-in asks for driving and gets it', async () => {
    backend(['rider', 'driver']);
    expect(await post({ token: 't', role: 'driver' })).toBe('driver');
  });

  it('a hand-over with no role keeps the live session\'s role', async () => {
    backend(['rider', 'driver']);
    const live = await signSession({ uid: '70', roles: ['rider', 'driver'], role: 'driver', exp: Math.floor(Date.now() / 1000) + 600 }, SECRET);
    expect(await post({ token: 't' }, { [SESSION_COOKIE]: live })).toBe('driver');
  });

  it('with no live session, the last area this browser signed in to', async () => {
    backend(['rider', 'driver']);
    expect(await post({ token: 't' }, { 'sg-area': 'driver' })).toBe('driver');
  });

  it('with nothing to go on, the first role', async () => {
    backend(['rider', 'driver']);
    expect(await post({ token: 't' })).toBe('rider');
  });

  it('never a role the account does not hold', async () => {
    backend(['rider']);
    expect(await post({ token: 't' }, { 'sg-area': 'driver' })).toBe('rider');
  });
});
