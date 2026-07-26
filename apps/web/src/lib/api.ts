// Thin REST client for the backend API.
//
// Token persistence lives in localStorage (NOT cookies) so we can run
// the console as a static SPA bundled by Next.js. If we later need
// CSRF-protected mutations from a server component, we'll migrate to
// httpOnly cookies + a /api/auth proxy on the Next side.

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

export const TOKEN_KEY = 'saaradhi_admin_access_token';
export const REFRESH_KEY = 'saaradhi_admin_refresh_token';

export function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function writeTokens({ access, refresh }: { access: string; refresh?: string }) {
  window.localStorage.setItem(TOKEN_KEY, access);
  if (refresh) window.localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = readToken();
  const resp = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    /* empty response is fine */
  }
  if (!resp.ok) {
    const err = json?.error ?? {};
    throw new ApiError(
      resp.status,
      err.code ?? 'UNKNOWN_ERROR',
      err.message ?? `HTTP ${resp.status}`,
    );
  }
  // Standard backend envelope: {status, data} for success
  // or DRF pagination response (results / next / previous).
  return (json?.data ?? json) as T;
}

export const api = {
  get: <T,>(path: string) => call<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => call<T>('POST', path, body),
  patch: <T,>(path: string, body?: unknown) => call<T>('PATCH', path, body),
  delete: <T,>(path: string) => call<T>('DELETE', path),
};

// ---- Auth helpers ----

export async function requestOtp(phone: string) {
  return api.post<{ message?: string }>('/auth/otp/', { phone_number: phone, role: 'admin' });
}

export async function loginWithOtp(phone: string, otp: string) {
  type LoginResp = { access?: string; refresh?: string; user?: unknown };
  const data = await api.post<LoginResp>('/auth/login/', {
    phone_number: phone,
    otp,
    role: 'admin',
  });
  if (data?.access) {
    writeTokens({ access: data.access, refresh: data.refresh });
  }
  return data;
}
