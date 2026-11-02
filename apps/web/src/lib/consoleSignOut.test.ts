/**
 * Console sign-out (AUDIT 27.78, M4): the console keeps no refresh token, and
 * one left by an earlier build is revoked on the server before storage is
 * cleared. Before, the refresh token sat in localStorage, valid for 14 days
 * after "Sign out".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REFRESH_KEY, TOKEN_KEY, signOutConsole, writeTokens } from './api';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('console tokens', () => {
  it('stores the access token and never the refresh token', () => {
    window.localStorage.setItem(REFRESH_KEY, 'left-by-an-old-build');
    writeTokens({ access: 'access-1', refresh: 'refresh-1' });
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('access-1');
    expect(window.localStorage.getItem(REFRESH_KEY)).toBeNull();
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
