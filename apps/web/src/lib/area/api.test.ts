/**
 * Gate (8 Nov): an expired session never leaves a page loading. 14 Nov: the server renews the
 * session (lib/session/bff.ts); a 401 that reaches the page means it could not, so the page signs
 * out cleanly -- the role cookie first -- and goes to Log in with a message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
let answer: (url: string) => Response;
const assign = vi.fn();

beforeEach(() => {
  vi.resetModules();
  calls.length = 0;
  assign.mockReset();
  localStorage.clear();
  document.cookie = 'sg-rider-in=1; path=/';
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
  it('401 (the server could not renew): sign out and go to Log in with a message', async () => {
    answer = (url) => (url.endsWith('/api/session') ? json(200, {}) : json(401, {}));
    const { areaGet } = await import('./api');
    await expect(areaGet('/driver/earnings/period/?period=today')).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(assign).toHaveBeenCalled());
    expect(assign).toHaveBeenCalledWith('/driver/sign-in?ended=1&next=%2Fdriver%2Fearnings');
    expect(calls).toContain('DELETE /api/session');
    expect(calls).toContain('GET /api/rider?to=/driver/earnings/period/?period=today');
  });

  it('answered: no sign-out, and the call went through the rider session route', async () => {
    answer = () => json(200, { data: { ok: true } });
    const { areaGet } = await import('./api');
    await expect(areaGet('/driver/earnings/period/?period=today')).resolves.toEqual({ ok: true });
    expect(assign).not.toHaveBeenCalled();
    expect(calls).toEqual(['GET /api/rider?to=/driver/earnings/period/?period=today']);
  });

  it('no session at all: never sent as the console session, and the visitor goes to Log in', async () => {
    document.cookie = 'sg-rider-in=; path=/; max-age=0';
    answer = (url) => (url.endsWith('/api/session') ? json(200, {}) : json(401, {}));
    const { areaGet } = await import('./api');
    await expect(areaGet('/driver/earnings/daily/')).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(assign).toHaveBeenCalled());
    expect(calls.filter((c) => c.includes('/api/staff'))).toHaveLength(0);
  });
});
