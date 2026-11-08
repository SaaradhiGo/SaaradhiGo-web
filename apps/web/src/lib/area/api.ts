'use client';

import { api } from '@/lib/api';
import { RIDER_REFRESH_KEY, readRiderToken, writeRiderTokens } from '@/lib/publicAuth';

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

export async function areaGet<T>(path: string): Promise<T> {
  return api.get<T>(path, (await areaToken()) ?? undefined);
}

export async function areaPost<T>(path: string, body: unknown): Promise<T> {
  return api.post<T>(path, body, (await areaToken()) ?? undefined);
}
