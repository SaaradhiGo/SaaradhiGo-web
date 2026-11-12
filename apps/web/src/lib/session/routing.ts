import type { Session } from './cookie';

/**
 * Who sees which signed-in area (owner, 2026-11-08).
 *
 * Riders and drivers get separate areas on the same site:
 *   rider   /ride, /ride/choose, /ride/trip/[id], /trips, /trips/[id], /account
 *   driver  /driver, /driver/earnings, /trips, /documents, /payouts, /profile, /support
 *
 * A rider who opens a driver URL goes to /ride, a driver who opens a rider URL
 * goes to /driver, and a visitor who is not signed in is sent to the right
 * sign-in. The rider pages are served from /rider/* by rewrite, because two of
 * their public URLs are already taken by other pages: /ride is the marketing
 * page a guest sees, and /trips is the operations console's trip list, which
 * operators (who have no rider/driver session) keep reaching.
 */
export type Decision =
  | { kind: 'next' }
  | { kind: 'rewrite'; to: string }
  | { kind: 'redirect'; to: string };

/**
 * Which sign-in this browser used last (12 Nov), from the `sg-area` cookie: rider and driver sign-in
 * set it (app/api/session), the console sets 'console' (lib/api writeTokens). Not a session and never
 * trusted for access; it only decides where a visitor WITHOUT a session is sent to sign in, so a rider
 * whose session ended on /trips/207 goes to the rider sign-in and comes back, not to the staff login.
 */
export const AREA_COOKIE = 'sg-area';
export type AreaHint = 'rider' | 'driver' | 'console' | null;

export const RIDER_HOME = '/ride';
export const DRIVER_HOME = '/driver';

/** Rider URLs, as the visitor sees them. */
export const RIDER_ROUTES = ['/ride', '/ride/choose', '/ride/trip/1', '/trips', '/trips/1', '/account'];
/** Driver URLs. */
export const DRIVER_ROUTES = [
  '/driver',
  '/driver/earnings',
  '/driver/trips',
  '/driver/documents',
  '/driver/payouts',
  '/driver/profile',
  '/driver/support',
];

const DRIVER_GUEST = ['/driver/sign-in', '/driver/sign-up'];

function isRiderPath(p: string) {
  return p === '/ride' || p === '/ride/choose' || p.startsWith('/ride/trip/')
    || p === '/trips' || p.startsWith('/trips/') || p === '/account' || p === '/my-trips';
}

function isDriverPath(p: string) {
  return (p === '/driver' || p.startsWith('/driver/')) && !DRIVER_GUEST.includes(p);
}

function signIn(path: string, search: string, driver: boolean) {
  const next = encodeURIComponent(path + search);
  return `${driver ? '/driver/sign-in' : '/sign-in'}?next=${next}`;
}

export function decide(pathname: string, search: string, session: Session | null, area: AreaHint = null): Decision {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  // The internal rider paths are never addressed directly.
  if (p === '/rider' || p.startsWith('/rider/')) return { kind: 'redirect', to: RIDER_HOME };

  if (isDriverPath(p)) {
    if (!session) return { kind: 'redirect', to: signIn(p, search, true) };
    if (session.role !== 'driver') return { kind: 'redirect', to: RIDER_HOME };
    // The old driver home and the one-page account moved into the area.
    if (p === '/driver/home') return { kind: 'redirect', to: DRIVER_HOME };
    return { kind: 'next' };
  }

  if (isRiderPath(p)) {
    if (!session) {
      // A guest keeps the marketing /ride and the console's /trips -- unless this browser last signed
      // in as a rider or driver: then their session ended here, and they sign in again and come back.
      if ((p === '/trips' || p.startsWith('/trips/')) && (area === 'rider' || area === 'driver')) {
        return { kind: 'redirect', to: signIn(p, search, area === 'driver') };
      }
      if (p === '/ride' || p === '/trips' || p.startsWith('/trips/')) return { kind: 'next' };
      if (p === '/my-trips') return { kind: 'redirect', to: signIn('/trips', '', false) };
      return { kind: 'redirect', to: signIn(p, search, false) };
    }
    if (session.role !== 'rider') return { kind: 'redirect', to: DRIVER_HOME };
    if (p === '/my-trips') return { kind: 'redirect', to: '/trips' };
    return { kind: 'rewrite', to: `/rider${p}${search}` };
  }

  // Signed in already: the sign-in pages lead to the visitor's own area.
  if (session && (p === '/sign-in' || p === '/driver/sign-in')) {
    return { kind: 'redirect', to: session.role === 'driver' ? DRIVER_HOME : RIDER_HOME };
  }
  return { kind: 'next' };
}
