/**
 * The session proxy (14 Nov, owner): login keys in Secure, HttpOnly cookies; renewal on the server;
 * an expired session never breaks a public call (place search) and ends cleanly.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COOKIES, adopt, proxy, safePath } from './bff';

const B64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
const jwt = (inSeconds: number, tag = 'a') => `${B64({ alg: 'HS256' })}.${B64({ exp: Math.floor(Date.now() / 1000) + inSeconds, tag })}.sig`;

afterEach(() => vi.unstubAllGlobals());

type Seen = { url: string; method: string; auth?: string; body?: string };
function backend(answer: (s: Seen) => Response) {
  const seen: Seen[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const h = (init.headers ?? {}) as Record<string, string>;
    const body = init.body ? Buffer.from(init.body as ArrayBuffer).toString('utf8') : undefined;
    const s = { url: String(url).replace(/^https?:\/\/[^/]+\/api\/v1/, ''), method: init.method ?? 'GET', auth: h.Authorization, body };
    seen.push(s);
    return answer(s);
  }));
  return seen;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function req(path: string, { method = 'GET', body, cookies = {}, bff = true }: { method?: string; body?: string; cookies?: Record<string, string>; bff?: boolean } = {}) {
  const r = new NextRequest(new URL(`/api/rider?to=${path}`, 'https://qa.example'), {
    method, body, headers: { ...(bff ? { 'x-sg-bff': '1' } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  });
  for (const [k, v] of Object.entries(cookies)) r.cookies.set(k, v);
  return r;
}
const R = COOKIES.rider;

describe('a signed-in call', () => {
  it('carries the token from the cookie, not from the page', async () => {
    const at = jwt(600);
    const seen = backend(() => json(200, { data: { ok: 1 } }));
    const res = await proxy(req('/ride/ride-history/?status=completed', { cookies: { [R.at]: at, [R.rt]: 'r1' } }), 'rider');
    expect(res.status).toBe(200);
    expect(seen).toEqual([{ url: '/ride/ride-history/?status=completed', method: 'GET', auth: `Bearer ${at}`, body: undefined }]);
  });

  it('renews first when the access token is about to run out', async () => {
    const fresh = jwt(900, 'new');
    const seen = backend((s) => (s.url === '/auth/refresh/' ? json(200, { data: { token: fresh, refresh_token: 'r2' } }) : json(200, { data: {} })));
    const res = await proxy(req('/auth/profile/', { cookies: { [R.at]: jwt(10), [R.rt]: 'r1' } }), 'rider');
    expect(seen.map((s) => s.url)).toEqual(['/auth/refresh/', '/auth/profile/']);
    expect(seen[1].auth).toBe(`Bearer ${fresh}`);
    const set = res.cookies.get(R.at);
    expect(set?.value).toBe(fresh);
    expect(set?.httpOnly).toBe(true);
    expect(res.cookies.get(R.rt)?.value).toBe('r2');
  });

  it('a 401 is renewed once and sent again', async () => {
    const fresh = jwt(900, 'new');
    let first = true;
    const seen = backend((s) => {
      if (s.url === '/auth/refresh/') return json(200, { data: { token: fresh, refresh_token: 'r2' } });
      if (first) { first = false; return json(401, { error: { code: 'TOKEN_INVALID' } }); }
      return json(200, { data: { ok: 1 } });
    });
    const res = await proxy(req('/rider/locations/', { cookies: { [R.at]: jwt(600), [R.rt]: 'r-401' } }), 'rider');
    expect(res.status).toBe(200);
    expect(seen.map((s) => s.url)).toEqual(['/rider/locations/', '/auth/refresh/', '/rider/locations/']);
    expect(res.headers.get('x-sg-session')).toBeNull();
  });

  it('three calls at once share one renewal', async () => {
    const seen = backend((s) => (s.url === '/auth/refresh/' ? json(200, { data: { token: jwt(900), refresh_token: 'r2' } }) : json(200, { data: {} })));
    const cookies = { [R.at]: jwt(5), [R.rt]: 'r-shared' };
    await Promise.all([1, 2, 3].map((n) => proxy(req(`/x/${n}/`, { cookies }), 'rider')));
    expect(seen.filter((s) => s.url === '/auth/refresh/')).toHaveLength(1);
  });
});

describe('an expired session (owner, 14 Nov: place search went silent with a stale login)', () => {
  it('a public search still answers, as a guest, and the browser is told the session ended', async () => {
    const seen = backend((s) => {
      if (s.url === '/auth/refresh/') return json(401, { error: { code: 'TOKEN_INVALID' } });
      return s.auth ? json(401, { error: { code: 'TOKEN_INVALID' } }) : json(200, { data: { predictions: [{ description: 'Boise State University' }] } });
    });
    const res = await proxy(req('/ride/maps/geocode', { method: 'POST', body: '{"input":"Boise State"}', cookies: { [R.at]: jwt(600), [R.rt]: 'dead' } }), 'rider');
    expect(res.status).toBe(200);
    expect((await res.json()).data.predictions[0].description).toBe('Boise State University');
    expect(seen.at(-1)).toMatchObject({ url: '/ride/maps/geocode', auth: undefined, body: '{"input":"Boise State"}' });
    expect(res.headers.get('x-sg-session')).toBe('ended');
    expect(res.cookies.get(R.at)?.value).toBe('');
    expect(res.cookies.get(R.marker)?.value).toBe('');
    expect(res.cookies.get('sg-session')?.value).toBe('');
  });
});

describe('signing in', () => {
  it('moves the tokens into HttpOnly cookies and out of the answer', async () => {
    backend(() => json(200, { status: 'success', data: { token: jwt(900), refresh_token: 'r9', user: { full_name: 'Rider' } } }));
    const res = await proxy(req('/auth/email/login/', { method: 'POST', body: '{"email":"a@b.c","password":"x"}' }), 'rider');
    const body = await res.json();
    expect(body.data).toEqual({ user: { full_name: 'Rider' }, session: true });
    expect(JSON.stringify(body)).not.toMatch(/eyJ|r9/);
    expect(res.cookies.get(R.at)?.httpOnly).toBe(true);
    expect(res.cookies.get(R.rt)?.httpOnly).toBe(true);
    expect(res.cookies.get(R.rt)?.sameSite).toBe('lax');
    expect(res.cookies.get(R.marker)?.httpOnly).toBe(false);
  });

  it('never sends a stale session on a sign-in', async () => {
    const seen = backend(() => json(200, { data: { token: jwt(900), refresh_token: 'r9' } }));
    await proxy(req('/auth/email/login/', { method: 'POST', body: '{}', cookies: { [R.at]: jwt(600), [R.rt]: 'old' } }), 'rider');
    expect(seen).toHaveLength(1);
    expect(seen[0].auth).toBeUndefined();
  });

  it('staff cookies are Strict and sent only to /api/staff', async () => {
    backend(() => json(200, { data: { token: jwt(900), refresh_token: 's1' } }));
    const r = new NextRequest(new URL('/api/staff?to=/auth/admin/login/', 'https://qa.example'), { method: 'POST', body: '{}', headers: { 'x-sg-bff': '1' } });
    const res = await proxy(r, 'staff');
    const c = res.cookies.get(COOKIES.staff.at);
    expect(c?.path).toBe('/api/staff');
    expect(c?.sameSite).toBe('strict');
    expect(c?.httpOnly).toBe(true);
  });
});

describe('signing out', () => {
  it('sends the refresh token from the cookie to be revoked, then clears the cookies', async () => {
    const at = jwt(600);
    const seen = backend(() => json(200, { data: {} }));
    const res = await proxy(req('/auth/logout/', { method: 'POST', body: '{}', cookies: { [R.at]: at, [R.rt]: 'r1' } }), 'rider');
    expect(seen[0]).toMatchObject({ url: '/auth/logout/', auth: `Bearer ${at}`, body: '{"refresh_token":"r1"}' });
    expect(res.cookies.get(R.at)?.value).toBe('');
    expect(res.cookies.get(R.rt)?.value).toBe('');
  });
});

describe('forgery and paths', () => {
  it('refuses a call without the x-sg-bff header', async () => {
    const seen = backend(() => json(200, {}));
    const res = await proxy(req('/auth/profile/', { bff: false, cookies: { [R.at]: jwt(600) } }), 'rider');
    expect(res.status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  it('accepts API paths only', () => {
    expect(safePath('/ride/trip/5/?q=a..b')).toBe('/ride/trip/5/?q=a..b');
    for (const bad of ['//evil.example/x', 'https://evil.example', '/ride/../admin/', '/ride/%2e%2e/admin/', '/a\\b', null]) {
      expect(safePath(bad as string | null)).toBeNull();
    }
  });
});

describe('a session saved before 14 Nov', () => {
  it('becomes cookies when the backend accepts it, and ends cleanly when it does not', async () => {
    backend((s) => (s.auth === 'Bearer good' ? json(200, { data: {} }) : json(401, {})));
    const mk = (access: string) => new NextRequest(new URL('/api/rider/adopt', 'https://qa.example'), {
      method: 'POST', body: JSON.stringify({ access, refresh: 'r1' }), headers: { 'x-sg-bff': '1' },
    });
    const good = await adopt(mk('good'), 'rider');
    expect(good.status).toBe(200);
    expect(good.cookies.get(R.at)?.value).toBe('good');
    const bad = await adopt(mk('bad'), 'rider');
    expect(bad.status).toBe(401);
    expect(bad.cookies.get(R.marker)?.value).toBe('');
  });
});

describe('the visitor address (rate limits and the login lockout key on it)', () => {
  it('is sent with the shared key only, and is the edge-appended entry, not the client-written one', async () => {
    const seen: Array<Record<string, string>> = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { seen.push(init.headers as Record<string, string>); return json(200, { data: {} }); }));
    const mk = () => {
      const r = new NextRequest(new URL('/api/rider?to=/auth/email/login/', 'https://qa.example'), {
        method: 'POST', body: '{}', headers: { 'x-sg-bff': '1', 'x-forwarded-for': '6.6.6.6, 81.2.69.142, 10.0.0.7' },
      });
      return r;
    };
    process.env.BFF_CLIENT_IP_SECRET = 'k'.repeat(40);
    await proxy(mk(), 'rider');
    expect(seen[0]['X-SG-Client-IP']).toBe('81.2.69.142');
    expect(seen[0]['X-SG-Client-IP-Key']).toBe('k'.repeat(40));
    delete process.env.BFF_CLIENT_IP_SECRET;
    await proxy(mk(), 'rider');
    expect(seen[1]['X-SG-Client-IP']).toBeUndefined();
  });
});
