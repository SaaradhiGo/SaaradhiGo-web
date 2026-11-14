/**
 * Console session. 14 Nov (owner): the tokens are HttpOnly cookies held by this site's server
 * (lib/session/bff.ts), which renews them; the page sends every console call to /api/staff and
 * never holds a token. "Sign out" asks the server to revoke the refresh token from its cookie
 * (AUDIT 27.78, M4) and the browser forgets the operator.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_USER_KEY, CONSOLE_SESSION_ENDED, REFRESH_KEY, TOKEN_KEY, api, signOutConsole } from './api';

afterEach(() => {
  window.localStorage.clear();
  document.cookie = 'sg-staff-in=; path=/; max-age=0';
  vi.unstubAllGlobals();
});

const ok = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('console calls', () => {
  it('go to this site with the backend path and the forgery header, never a bearer token', async () => {
    document.cookie = 'sg-staff-in=1; path=/';
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string> });
      return ok({ fine: true });
    }));
    await api.get('/admin/kyc/?status=pending&page=2');
    expect(seen[0].url).toBe('/api/staff?to=/admin/kyc/?status=pending&page=2');
    expect(seen[0].headers['x-sg-bff']).toBe('1');
    expect(seen[0].headers.Authorization).toBeUndefined();
  });

  it('an ended session (the server could not renew) signs the operator out cleanly', async () => {
    document.cookie = 'sg-staff-in=1; path=/';
    window.localStorage.setItem(ADMIN_USER_KEY, JSON.stringify({ full_name: 'Old Name' }));
    const ended = vi.fn();
    window.addEventListener(CONSOLE_SESSION_ENDED, ended);
    vi.stubGlobal('fetch', vi.fn(async () => ok(null, 401, { 'x-sg-session': 'ended' })));
    await expect(api.get('/admin/kyc/')).rejects.toMatchObject({ status: 401 });
    expect(ended).toHaveBeenCalled();
    expect(document.cookie).not.toContain('sg-staff-in=1');
    expect(window.localStorage.getItem(ADMIN_USER_KEY)).toBeNull();
    window.removeEventListener(CONSOLE_SESSION_ENDED, ended);
  });
});

describe('sign out', () => {
  it('asks the server to revoke the session, then forgets the operator', async () => {
    document.cookie = 'sg-staff-in=1; path=/';
    window.localStorage.setItem(ADMIN_USER_KEY, JSON.stringify({ full_name: 'Op' }));
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push(`${init.method} ${url}`);
      return new Response('{}', { status: 200 });
    }));
    await signOutConsole();
    expect(seen).toEqual(['POST /api/staff?to=/auth/logout/']);
    expect(window.localStorage.getItem(ADMIN_USER_KEY)).toBeNull();
    expect(document.cookie).not.toContain('sg-staff-in=1');
  });

  it('still signs out when the server cannot be reached', async () => {
    document.cookie = 'sg-staff-in=1; path=/';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await signOutConsole();
    expect(document.cookie).not.toContain('sg-staff-in=1');
  });
});

describe('a session saved in browser storage before 14 Nov', () => {
  it('is handed to the server once and deleted from storage', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'old-access');
    window.localStorage.setItem(REFRESH_KEY, 'old-refresh');
    const seen: Array<{ url: string; body: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, body: String(init.body ?? '') });
      return ok({ adopted: true });
    }));
    await api.get('/admin/kyc/');
    expect(seen[0].url).toBe('/api/staff/adopt');
    expect(JSON.parse(seen[0].body)).toEqual({ access: 'old-access', refresh: 'old-refresh' });
    expect(seen[1].url).toBe('/api/staff?to=/admin/kyc/');
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(REFRESH_KEY)).toBeNull();
  });
});
