/**
 * Gate (8 Nov): an expired session never leaves a page loading. A 401 that a
 * renewal cannot fix signs out cleanly -- the role cookie first, then the
 * tokens -- and goes to Log in with a message; a renewal that works sends the
 * request again instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const B64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
const jwt = (exp: number) => `h.${B64({ exp })}.s`;
const LATER = () => Math.floor(Date.now() / 1000) + 600;

const calls: string[] = [];
let answer: (url: string) => Response;
const assign = vi.fn();

beforeEach(() => {
  vi.resetModules();
  calls.length = 0;
  assign.mockReset();
  localStorage.clear();
  localStorage.setItem('saaradhi_rider_access_token', jwt(LATER()));
  localStorage.setItem('saaradhi_rider_refresh_token', 'r1');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url).replace(/^https?:\/\/[^/]+/, '')}`);
    return answer(String(url));
  }));
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: '/driver/earnings', search: '', assign },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('area requests and an expired session', () => {
  it('401 and the refresh refused: sign out and go to Log in with a message', async () => {
    answer = (url) => (url.includes('/auth/refresh/') ? json(400, {}) : url.endsWith('/api/session') ? json(200, {}) : json(401, {}));
    const { areaGet } = await import('./api');
    await expect(areaGet('/driver/earnings/period/?period=today')).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(assign).toHaveBeenCalled());
    expect(assign).toHaveBeenCalledWith('/driver/sign-in?ended=1&next=%2Fdriver%2Fearnings');
    expect(calls).toContain('DELETE /api/session');
    expect(localStorage.getItem('saaradhi_rider_access_token')).toBeNull();
    expect(localStorage.getItem('saaradhi_rider_refresh_token')).toBeNull();
  });

  it('401, then the refresh works: the request is sent again and nobody is signed out', async () => {
    let first = true;
    answer = (url) => {
      if (url.includes('/auth/refresh/')) return json(200, { data: { token: jwt(LATER() + 60), refresh_token: 'r2' } });
      if (first) { first = false; return json(401, {}); }
      return json(200, { data: { ok: true } });
    };
    const { areaGet } = await import('./api');
    await expect(areaGet('/driver/earnings/period/?period=today')).resolves.toEqual({ ok: true });
    expect(assign).not.toHaveBeenCalled();
    expect(localStorage.getItem('saaradhi_rider_refresh_token')).toBe('r2');
  });

  it('no token at all: never sent as the console session, and the visitor goes to Log in', async () => {
    localStorage.clear();
    answer = (url) => (url.endsWith('/api/session') ? json(200, {}) : json(401, {}));
    const { areaGet } = await import('./api');
    await expect(areaGet('/driver/earnings/daily/')).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(assign).toHaveBeenCalled());
    expect(calls.filter((c) => c.includes('/driver/earnings/daily/'))).toHaveLength(1);
  });
});
