import { NextResponse, type NextRequest } from 'next/server';
import {
  ROLES,
  type Role,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  type Session,
  sessionSecret,
  signSession,
  verifySession,
} from '@/lib/session/cookie';
import { AREA_COOKIE } from '@/lib/session/routing';

/**
 * Turns the browser's rider/driver token into the signed role cookie the
 * middleware reads. POST { token } after sign-in; PATCH { role } to switch
 * area on an account that holds both; DELETE on sign-out.
 *
 * The role is never taken from the request: the backend is asked who the
 * token belongs to, and only its answer is signed.
 */
const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

type Profile = { id?: number | string; role?: string | null; roles?: string[] | null; country?: string | null };

/** 13 Nov: the account's market, which the footer and legal pages fall back to (lib/legal.ts). */
export const ACCOUNT_MARKET_COOKIE = 'sg-account-market';

function rolesOf(p: Profile): Role[] {
  const all = [...(p.roles ?? []), p.role ?? ''];
  return ROLES.filter((r) => all.includes(r));
}

function cookieFor(res: NextResponse, value: string, maxAge = SESSION_MAX_AGE, area?: Role) {
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
  // 12 Nov: which sign-in to send this browser to once the session has ended (routing.ts AREA_COOKIE).
  if (area) {
    res.cookies.set(AREA_COOKIE, area, {
      sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 365 * 24 * 60 * 60,
    });
  }
  return res;
}

export async function POST(req: NextRequest) {
  const secret = sessionSecret();
  if (!secret) return NextResponse.json({ error: 'SESSION_UNCONFIGURED' }, { status: 503 });
  const { token, role: wanted } = (await req.json().catch(() => ({}))) as { token?: string; role?: string };
  if (!token) return NextResponse.json({ error: 'NO_TOKEN' }, { status: 400 });

  const res = await fetch(`${API}/auth/profile/`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  }).catch(() => null);
  if (!res || !res.ok) return NextResponse.json({ error: 'TOKEN_REFUSED' }, { status: 401 });
  // success_response wraps it: { data: { user } } or { data }.
  const body = (await res.json()) as Profile & { data?: Profile & { user?: Profile } };
  const profile = body.data?.user ?? body.data ?? body;
  const roles = rolesOf(profile);
  if (!roles.length || profile.id == null) return NextResponse.json({ error: 'NOT_RIDER_OR_DRIVER' }, { status: 403 });

  const role = roles.includes(wanted as Role) ? (wanted as Role) : roles[0];
  const session: Session = { uid: String(profile.id), roles, role, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
  const out = cookieFor(NextResponse.json({ role, roles }), await signSession(session, secret), SESSION_MAX_AGE, role);
  const country = String(profile.country ?? '').toUpperCase();
  if (country === 'IN' || country === 'US') {
    out.cookies.set(ACCOUNT_MARKET_COOKIE, country, {
      sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_MAX_AGE,
    });
  }
  return out;
}

/** Switch area; only to a role the signed cookie already lists. */
export async function PATCH(req: NextRequest) {
  const secret = sessionSecret();
  const current = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret);
  if (!current || !secret) return NextResponse.json({ error: 'NO_SESSION' }, { status: 401 });
  const { role } = (await req.json().catch(() => ({}))) as { role?: string };
  if (!current.roles.includes(role as Role)) return NextResponse.json({ error: 'ROLE_NOT_HELD' }, { status: 403 });
  const next: Session = { ...current, role: role as Role };
  return cookieFor(NextResponse.json({ role: next.role, roles: next.roles }), await signSession(next, secret), SESSION_MAX_AGE, next.role);
}

/** The active role and the roles held, for the "Switch to …" control. */
export async function GET(req: NextRequest) {
  const s = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret());
  if (!s) return NextResponse.json({ error: 'NO_SESSION' }, { status: 401 });
  return NextResponse.json({ role: s.role, roles: s.roles });
}

export async function DELETE() {
  return cookieFor(NextResponse.json({ ok: true }), '', 0);
}
