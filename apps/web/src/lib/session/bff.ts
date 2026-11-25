/**
 * Login keys live in HttpOnly cookies, never in browser storage (owner, 14 Nov).
 *
 * Before, rider and staff access and refresh tokens sat in localStorage, where any script on the
 * page could read them. Now the browser never holds a token: every signed-in request goes to this
 * site (`/api/rider`, `/api/staff`) with the backend path after `?to=`, and this server adds the
 * token from a Secure, HttpOnly, SameSite cookie, renews it when it is about to run out (or was
 * refused), and passes the answer back. A sign-in answer that carries tokens has them moved into
 * cookies and taken out of the body, so page script never sees them.
 *
 * Two principals, two sets of cookies:
 *   rider (riders and drivers)  sg_rider_at / sg_rider_rt, Path=/api       (also read by /api/session)
 *   staff (the console)         sg_staff_at / sg_staff_rt, Path=/api/staff (sent nowhere else)
 * Each has a readable `sg-rider-in` / `sg-staff-in` = 1 that only says "signed in", for the header.
 *
 * Forgery: every call must carry `x-sg-bff: 1`. Another site cannot add a custom header to a
 * cross-site request without a CORS preflight, which this route never answers, so the cookies
 * cannot be ridden from elsewhere (and the rider cookies are SameSite=Lax, the staff ones Strict).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from './cookie';

export type Principal = 'rider' | 'staff';

const API = () => (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '');
const secure = () => process.env.NODE_ENV === 'production';

export const COOKIES = {
  rider: { at: 'sg_rider_at', rt: 'sg_rider_rt', marker: 'sg-rider-in', path: '/api', sameSite: 'lax' as const },
  staff: { at: 'sg_staff_at', rt: 'sg_staff_rt', marker: 'sg-staff-in', path: '/api/staff', sameSite: 'strict' as const },
};

/** The refresh token lasts 14 days on the backend (REFRESH_TOKEN_LIFETIME). */
const REFRESH_MAX_AGE = 14 * 24 * 60 * 60;
const RENEW_BEFORE_S = 60;
const TOKEN_FIELDS = ['token', 'refresh_token', 'access', 'refresh'];

/** The `jti` claim of a JWT, read without verifying (the backend checks it belongs to the caller). */
export function tokenId(token: string): string | null {
  try {
    const part = token.split('.')[1];
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json.jti === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(json.jti) ? json.jti : null;
  } catch {
    return null;
  }
}

export function expiry(token: string): number | null {
  try {
    const json = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

export function setSession(res: NextResponse, who: Principal, access: string, refresh?: string | null) {
  const c = COOKIES[who];
  const exp = expiry(access);
  const accessAge = exp ? Math.max(60, exp - Math.floor(Date.now() / 1000)) : 15 * 60;
  const base = { httpOnly: true, secure: secure(), sameSite: c.sameSite, path: c.path };
  res.cookies.set(c.at, access, { ...base, maxAge: accessAge });
  if (refresh) res.cookies.set(c.rt, refresh, { ...base, maxAge: REFRESH_MAX_AGE });
  res.cookies.set(c.marker, '1', { httpOnly: false, secure: secure(), sameSite: 'lax', path: '/', maxAge: REFRESH_MAX_AGE });
}

export function clearSession(res: NextResponse, who: Principal) {
  const c = COOKIES[who];
  const base = { httpOnly: true, secure: secure(), sameSite: c.sameSite, path: c.path, maxAge: 0 };
  res.cookies.set(c.at, '', base);
  res.cookies.set(c.rt, '', base);
  res.cookies.set(c.marker, '', { path: '/', maxAge: 0 });
}

/** One renewal per refresh token at a time: renewal rotates it, so a second would be refused. */
const renewing = new Map<string, Promise<{ access: string; refresh: string | null } | null>>();

export function renew(refresh: string) {
  const live = renewing.get(refresh);
  if (live) return live;
  const p = (async () => {
    try {
      const r = await fetch(`${API()}/auth/refresh/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }), cache: 'no-store',
      });
      const json = await r.json().catch(() => null);
      const data = json?.data ?? json;
      return r.ok && data?.token ? { access: String(data.token), refresh: data.refresh_token ? String(data.refresh_token) : null } : null;
    } catch {
      return null;
    } finally {
      setTimeout(() => renewing.delete(refresh), 5_000);
    }
  })();
  renewing.set(refresh, p);
  return p;
}

/** A backend path from the client: absolute, on the API, no tricks. */
export function safePath(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\r\n\\]/.test(raw)) return null;
  const pathOnly = raw.split('?')[0];
  if (pathOnly.includes('..') || /%2e%2e|%2f|%5c/i.test(pathOnly)) return null;
  return raw;
}

/** Take the tokens out of a sign-in answer; null when it carried none. */
export function stripTokens(json: any): { body: any; access: string; refresh: string | null } | null {
  const data = json?.data ?? json;
  if (!data || typeof data !== 'object' || typeof data.token !== 'string' || !data.token) return null;
  const clean = Object.fromEntries(Object.entries(data).filter(([k]) => !TOKEN_FIELDS.includes(k)));
  const outData = { ...clean, session: true };
  const body = json?.data ? { ...json, data: outData } : outData;
  return { body, access: data.token, refresh: typeof data.refresh_token === 'string' ? data.refresh_token : null };
}

/** Sign-in and account-recovery calls never carry a session: a stale one would only be refused. */
const NO_SESSION = /^\/auth\/(login|admin\/login|email\/login|email\/register|otp|password\/(forgot|reset)|email\/verify|refresh)\//;

/**
 * The visitor's address as our edge saw it: Railway's edge appends the address that connected to
 * it, so it is the right-most entry that is not an internal hop (the left end is client-written).
 */
export function visitorIp(req: NextRequest): string | null {
  const hops = (req.headers.get('x-forwarded-for') || '').split(',').map((h) => h.trim()).filter(Boolean);
  const internal = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;
  while (hops.length && internal.test(hops[hops.length - 1])) hops.pop();
  const ip = hops.pop() || null;
  return ip && /^[0-9a-f.:]{3,45}$/i.test(ip) ? ip : null;
}

const PASS_HEADERS = ['content-type', 'content-disposition', 'cache-control', 'retry-after', 'x-request-id'];

/** Forward one request to the backend as this principal. */
export async function proxy(req: NextRequest, who: Principal): Promise<NextResponse> {
  if (req.headers.get('x-sg-bff') !== '1') return NextResponse.json({ error: { code: 'BFF_HEADER_REQUIRED' } }, { status: 403 });
  // The backend path, exactly as the page wrote it, is in `x-sg-path`. The `?to=` copy in the URL is
  // for people reading logs only: Next re-encodes the query string before a route sees it (seen on
  // QA, 14 Nov: `?to=/a/?b=1&c=2` arrives as `?to=%2Fa%2F%3Fb%3D1&c=2`), so it cannot be trusted.
  const path = safePath(req.headers.get('x-sg-path'));
  if (!path) return NextResponse.json({ error: { code: 'BAD_PATH' } }, { status: 400 });
  const c = COOKIES[who];
  const anonymous = NO_SESSION.test(path);
  let access = anonymous ? null : req.cookies.get(c.at)?.value || null;
  let refresh = anonymous ? null : req.cookies.get(c.rt)?.value || null;
  let renewed: { access: string; refresh: string | null } | null = null;
  let ended = false;

  const tryRenew = async () => {
    if (!refresh) { if (access) { ended = true; access = null; } return false; }
    const got = await renew(refresh);
    if (!got) { ended = true; access = null; refresh = null; return false; }
    renewed = got;
    access = got.access;
    if (got.refresh) refresh = got.refresh;
    return true;
  };

  // The access cookie lapsed (or is about to) while the refresh token lives: renew first.
  const exp = access ? expiry(access) : null;
  if (refresh && (!access || (exp !== null && exp - Date.now() / 1000 < RENEW_BEFORE_S))) await tryRenew();

  const isLogout = path.startsWith('/auth/logout/');
  const raw = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
  let body: BodyInit | undefined = raw;
  if (isLogout) body = JSON.stringify({ refresh_token: refresh ?? '' });

  const send = () => {
    const headers: Record<string, string> = { Accept: req.headers.get('accept') || 'application/json' };
    const type = isLogout ? 'application/json' : req.headers.get('content-type');
    if (type) headers['Content-Type'] = type;
    const surface = req.headers.get('x-sg-surface');
    if (surface) headers['X-SG-Surface'] = surface;
    // The backend sees this server's address on every call; it believes the visitor's address
    // only with the shared key (backend base/client_ip.py), for rate limits and the login lockout.
    const visitor = visitorIp(req);
    const key = process.env.BFF_CLIENT_IP_SECRET;
    if (visitor && key && key.length >= 32) {
      headers['X-SG-Client-IP'] = visitor;
      headers['X-SG-Client-IP-Key'] = key;
    }
    if (access) headers.Authorization = `Bearer ${access}`;
    // 25 Nov: which session this browser is (My security). The refresh token's id only, never the token.
    const jti = refresh ? tokenId(refresh) : null;
    if (jti) headers['X-SG-Session'] = jti;
    return fetch(API() + path, { method: req.method, headers, body, cache: 'no-store', redirect: 'manual' });
  };

  let sentAuthed = Boolean(access);
  let upstream = await send().catch(() => null);
  if (upstream?.status === 401 && access && !renewed && (await tryRenew())) upstream = await send().catch(() => null);
  // Refused, and the session could not be renewed: the call goes again as a guest, so a public
  // read (place search, fares) still answers, and the browser is told the session has ended.
  if (upstream?.status === 401 && ended && sentAuthed) {
    access = null;
    sentAuthed = false;
    upstream = await send().catch(() => null);
  }
  if (!upstream) return NextResponse.json({ error: { code: 'UPSTREAM_UNREACHABLE', message: '' } }, { status: 502 });

  const type = upstream.headers.get('content-type') || '';
  let res: NextResponse;
  let login: ReturnType<typeof stripTokens> = null;
  if (type.includes('application/json')) {
    const json = await upstream.json().catch(() => null);
    login = upstream.ok ? stripTokens(json) : null;
    res = NextResponse.json(login ? login.body : json, { status: upstream.status });
  } else {
    res = new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), { status: upstream.status });
  }
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v && !(h === 'content-type' && login)) res.headers.set(h, v);
  }
  res.headers.set('Cache-Control', 'no-store');

  if (login) setSession(res, who, login.access, login.refresh);
  else if (isLogout || ended) {
    clearSession(res, who);
    if (ended) {
      res.headers.set('x-sg-session', 'ended');
      // The signed role cookie goes too, or the middleware would route this browser into an area it can no longer load.
      if (who === 'rider') res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    }
  } else if (renewed) setSession(res, who, (renewed as { access: string }).access, (renewed as { refresh: string | null }).refresh);
  return res;
}

/**
 * Sessions saved before 14 Nov had their tokens in localStorage. The browser hands them over once
 * (then deletes them); they are checked with the backend, renewed if need be, and become cookies.
 * Anything refused ends the session cleanly.
 */
export async function adopt(req: NextRequest, who: Principal): Promise<NextResponse> {
  if (req.headers.get('x-sg-bff') !== '1') return NextResponse.json({ error: { code: 'BFF_HEADER_REQUIRED' } }, { status: 403 });
  const { access, refresh } = (await req.json().catch(() => ({}))) as { access?: string; refresh?: string };
  let at = typeof access === 'string' ? access : '';
  let rt = typeof refresh === 'string' ? refresh : '';
  const exp = at ? expiry(at) : null;
  if ((!at || (exp !== null && exp - Date.now() / 1000 < RENEW_BEFORE_S)) && rt) {
    const got = await renew(rt);
    at = got?.access ?? '';
    rt = got?.refresh ?? rt;
  }
  const ok = at ? await fetch(`${API()}/auth/profile/`, { headers: { Authorization: `Bearer ${at}`, Accept: 'application/json' }, cache: 'no-store' })
    .then((r) => r.ok).catch(() => false) : false;
  const res = NextResponse.json({ adopted: ok }, { status: ok ? 200 : 401 });
  if (ok) setSession(res, who, at, rt || null);
  else clearSession(res, who);
  return res;
}
