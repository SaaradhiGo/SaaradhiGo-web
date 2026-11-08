'use client';

import { ApiError, api } from '@/lib/api';
import { RIDER_REFRESH_KEY, clearRiderTokens, readRiderToken, writeRiderTokens } from '@/lib/publicAuth';

/**
 * Requests from the rider and driver areas, with the access token renewed
 * the way the console renews its own (api.ts, renewConsoleSession): the
 * access token lasts 15 minutes, and an area left open longer used to fail
 * every request after that. Single-flight, because renewal rotates the
 * refresh token and a second concurrent renewal would be refused.
 */
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';
const RENEW_BEFORE_S = 60;
let renewing: Promise<string | null> | null = null;

function expiry(token: string): number | null {
  try {
    const json = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

function renew(): Promise<string | null> {
  if (renewing) return renewing;
  let refresh: string | null = null;
  try { refresh = localStorage.getItem(RIDER_REFRESH_KEY); } catch { /* private mode */ }
  if (!refresh) return Promise.resolve(null);
  renewing = (async () => {
    try {
      const resp = await fetch(`${BASE}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      const json = await resp.json().catch(() => null);
      const data = json?.data ?? json;
      if (resp.ok && data?.token) {
        writeRiderTokens(data.token, data.refresh_token);
        return data.token as string;
      }
      return null;
    } catch {
      return null;
    } finally {
      renewing = null;
    }
  })();
  return renewing;
}

/** The access token, renewed first when it is about to run out. */
export async function areaToken(): Promise<string | null> {
  const token = readRiderToken();
  if (!token) return null;
  const exp = expiry(token);
  if (exp && exp - Date.now() / 1000 < RENEW_BEFORE_S) return (await renew()) ?? token;
  return token;
}

/**
 * The token another tab saved after renewing, when it is newer than the one
 * this request was refused with. Renewal rotates the refresh token, so the tab
 * that loses the race gets 400 for its own renewal while a good token is
 * already in storage.
 */
function newerToken(sent: string | null): string | null {
  const now = readRiderToken();
  if (!now || now === sent) return null;
  const exp = expiry(now);
  return exp && exp * 1000 > Date.now() ? now : null;
}

let ending = false;

/**
 * The session is over (8 Nov): the token was refused and could not be
 * renewed. Sign out cleanly -- the server's role cookie first, so the sign-in
 * page does not route straight back here -- and go to Log in with a message,
 * instead of leaving every card waiting for an answer that will never come.
 */
export async function endAreaSession(): Promise<void> {
  if (ending || typeof window === 'undefined') return;
  ending = true;
  await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
  clearRiderTokens();
  const { pathname, search } = window.location;
  const signIn = pathname.startsWith('/driver') ? '/driver/sign-in' : '/sign-in';
  window.location.assign(`${signIn}?ended=1&next=${encodeURIComponent(pathname + search)}`);
}

/** Send once; on 401 renew (or take another tab's renewal) and send again; then end the session. */
async function withSession<T>(go: (token: string | null) => Promise<T>): Promise<T> {
  const sent = await areaToken();
  try {
    return await go(sent);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    const again = sent ? ((await renew()) ?? newerToken(sent)) : null;
    if (again && again !== sent) {
      try {
        return await go(again);
      } catch (e2) {
        if (e2 instanceof ApiError && e2.status === 401) void endAreaSession();
        throw e2;
      }
    }
    void endAreaSession();
    throw e;
  }
}

// `null`, never `undefined`, when there is no token: `undefined` means "the
// console's session" to api.ts, which must never be sent from these areas.
export async function areaGet<T>(path: string): Promise<T> {
  return withSession((t) => api.get<T>(path, t));
}

export async function areaPost<T>(path: string, body: unknown): Promise<T> {
  return withSession((t) => api.post<T>(path, body, t));
}
