/**
 * Console session (owner, 2026-11-03): the console stays signed in until the
 * operator signs out. The refresh token is kept, the access token is renewed
 * silently, and "Sign out" revokes the refresh token on the server before
 * storage is cleared (AUDIT 27.78, M4), so it is dead after sign-out.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REFRESH_KEY, TOKEN_KEY, api, renewConsoleSession, signOutConsole, writeTokens } from './api';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

/** A JWT-shaped token whose `exp` is `inSeconds` from now. Unsigned: the client only reads `exp`. */
function jwt(inSeconds: number, tag = 'a'): string {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${enc({ alg: 'HS256' })}.${enc({ exp: Math.floor(Date.now() / 1000) + inSeconds, tag })}.sig`;
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('console tokens', () => {
  it('stores the access token and the refresh token', () => {
    writeTokens({ access: 'access-1', refresh: 'refresh-1' });
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('access-1');
    expect(window.localStorage.getItem(REFRESH_KEY)).toBe('refresh-1');
  });

  it('renews an expired access token before the request, without the stale Authorization header', async () => {
    const stale = jwt(-30, 'old');
    const fresh = jwt(900, 'new');
    window.localStorage.setItem(TOKEN_KEY, stale);
    window.localStorage.setItem(REFRESH_KEY, 'refresh-1');
    const calls: Array<{ url: string; auth?: string; body?: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, auth: headers.Authorization, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/auth/refresh/')) return ok({ token: fresh, refresh_token: 'refresh-2' });
      return ok({ fine: true });
    }));

    await api.get('/admin/overview/');

    expect(calls[0].url).toMatch(/\/auth\/refresh\/$/);
    expect(calls[0].auth).toBeUndefined();
    expect(calls[0].body).toEqual({ refresh_token: 'refresh-1' });
    expect(calls[1].auth).toBe(`Bearer ${fresh}`);
    expect(window.localStorage.getItem(REFRESH_KEY)).toBe('refresh-2');
  });

  it('retries once after a 401 when the token can be renewed', async () => {
    window.localStorage.setItem(TOKEN_KEY, jwt(600, 'looks-fine'));
    window.localStorage.setItem(REFRESH_KEY, 'refresh-1');
    const fresh = jwt(900, 'new');
    let first = true;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh/')) return ok({ token: fresh, refresh_token: 'refresh-2' });
      if (first) { first = false; return new Response('{}', { status: 401 }); }
      return ok({ done: 1 });
    }));
    await expect(api.post('/payments/admin/payouts/1/approve/', {})).resolves.toEqual({ done: 1 });
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe(fresh);
  });

  it('three requests at once share one renewal', async () => {
    window.localStorage.setItem(TOKEN_KEY, jwt(-1));
    window.localStorage.setItem(REFRESH_KEY, 'refresh-1');
    const fetchMock = vi.fn(async (url: string) => (url.endsWith('/auth/refresh/')
      ? ok({ token: jwt(900, 'new'), refresh_token: 'refresh-2' })
      : ok({})));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([api.get('/a/'), api.get('/b/'), api.get('/c/')]);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/auth/refresh/'))).toHaveLength(1);
  });

  it('a refused renewal ends the session; a network failure does not', async () => {
    window.localStorage.setItem(TOKEN_KEY, jwt(-1));
    window.localStorage.setItem(REFRESH_KEY, 'refresh-1');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await renewConsoleSession()).toBe(false);
    expect(window.localStorage.getItem(REFRESH_KEY)).toBe('refresh-1');

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'AUTH_INVALID_REFRESH_TOKEN' } }), { status: 400 })));
    expect(await renewConsoleSession()).toBe(false);
    expect(window.localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('revokes a stored refresh token before clearing', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'access-1');
    window.localStorage.setItem(REFRESH_KEY, 'refresh-1');
    const seen: Array<{ url: string; body: unknown; auth: string | undefined; stored: string | null }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push({
        url,
        body: JSON.parse(String(init.body)),
        auth: (init.headers as Record<string, string>).Authorization,
        // Still in storage at the moment of the call: revoked first, cleared after.
        stored: window.localStorage.getItem(REFRESH_KEY),
      });
      return new Response('{}', { status: 200 });
    }));

    await signOutConsole();

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toMatch(/\/auth\/logout\/$/);
    expect(seen[0].body).toEqual({ refresh_token: 'refresh-1' });
    expect(seen[0].auth).toBe('Bearer access-1');
    expect(seen[0].stored).toBe('refresh-1');
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('still signs out when the server cannot be reached', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'access-1');
    window.localStorage.setItem(REFRESH_KEY, 'refresh-1');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await signOutConsole();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('makes no call when there is nothing to revoke', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'access-1');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await signOutConsole();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
