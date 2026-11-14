'use client';

import { ApiError, RIDER_SESSION, api } from '@/lib/api';
import { clearRiderTokens, readRiderToken } from '@/lib/publicAuth';
import { tagEndpoint } from '@/lib/report';

/**
 * Requests from the rider and driver areas. 14 Nov (owner): the login keys are HttpOnly cookies
 * held by this site's server, which adds the token, renews it before it runs out (or once when it
 * is refused) and retries (lib/session/bff.ts). A 401 that still reaches here means the session
 * could not be renewed: it is over.
 */

/** RIDER_SESSION while signed in, else null. Not a token: the page never holds one. */
export async function areaToken(): Promise<string | null> {
  return readRiderToken();
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

/** Send as the session; a 401 (renewal already tried on the server) ends it. */
async function withSession<T>(go: (token: string) => Promise<T>): Promise<T> {
  try {
    return await go(RIDER_SESSION);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) void endAreaSession();
    throw e;
  }
}

// Always RIDER_SESSION, never `undefined`: `undefined` means the console's session to api.ts.
export async function areaGet<T>(path: string): Promise<T> {
  return withSession((t) => api.get<T>(path, t)).catch((e) => { throw tagEndpoint(e, path); });
}

export async function areaPost<T>(path: string, body: unknown): Promise<T> {
  return withSession((t) => api.post<T>(path, body, t)).catch((e) => { throw tagEndpoint(e, path); });
}

export async function areaPatch<T>(path: string, body: unknown): Promise<T> {
  return withSession((t) => api.patch<T>(path, body, t)).catch((e) => { throw tagEndpoint(e, path); });
}

export async function areaDelete<T>(path: string): Promise<T> {
  return withSession((t) => api.delete<T>(path, t)).catch((e) => { throw tagEndpoint(e, path); });
}
