import 'server-only';

/**
 * The signed-in role, readable by the server (middleware and layouts).
 *
 * The rider/driver token lives in localStorage, which no server can see, so
 * on sign-in the browser hands its token to `/api/session` once. That route
 * asks the backend who the token belongs to and sets this cookie: the user
 * id, the roles the account holds, the active one, and an expiry, signed with
 * HMAC-SHA256 under WEB_SESSION_SECRET. The middleware verifies the signature
 * and routes by role (owner, 2026-11-08), so a hand-written cookie is refused.
 *
 * It decides which screens are shown, never what data is returned: every
 * request for data still carries the token and the backend checks it.
 */

export type Role = 'rider' | 'driver';
export const ROLES: readonly Role[] = ['rider', 'driver'];

export type Session = {
  uid: string;
  /** The roles this account holds; two for an account that is both. */
  roles: Role[];
  /** The area the visitor is using now. */
  role: Role;
  /** Seconds since the epoch. */
  exp: number;
};

export const SESSION_COOKIE = 'sg-session';
/** As long as the refresh token the browser keeps (REFRESH_TOKEN_LIFETIME). */
export const SESSION_MAX_AGE = 14 * 24 * 60 * 60;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value: string): Uint8Array {
  const s = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function key(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/**
 * WEB_SESSION_SECRET when the deployment sets one; otherwise a random key
 * made at build time (next.config.js), so sign-ins last until the next
 * deploy. It is only ever read here, and `server-only` keeps this module out
 * of every browser bundle.
 */
export function sessionSecret(): string | null {
  const s = process.env.WEB_SESSION_SECRET || process.env.SG_BUILD_SESSION_KEY;
  return s && s.length >= 32 ? s : null;
}

export async function signSession(session: Session, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(session)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** The session in a cookie value, or null if it is unsigned, tampered or expired. */
export async function verifySession(
  value: string | undefined | null,
  secret: string | null,
  now = Date.now() / 1000,
): Promise<Session | null> {
  if (!value || !secret) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    if (typeof s.exp !== 'number' || s.exp < now) return null;
    if (!ROLES.includes(s.role) || !Array.isArray(s.roles) || !s.roles.includes(s.role)) return null;
    return s;
  } catch {
    return null;
  }
}
