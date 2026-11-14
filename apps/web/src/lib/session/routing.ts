import type { Session } from './cookie';

/**
 * Who sees which signed-in area (owner, 2026-11-08).
 *
 * Riders and drivers get separate areas on the same site:
 *   rider   /ride, /ride/choose, /ride/trip/[id], /trips, /trips/[id], /account
 *   driver  /driver, /driver/earnings, /trips, /documents, /payouts, /profile, /support
 *
 * One person, one account, two roles (owner, 13 Nov): the same mobile can ride
 * and drive. A page of the other area is never a silent redirect any more: it
 * is served the role gate (/role-gate), which says the page is for riding or
 * driving and offers the switch, or for a driver with no rider role, "Ride with
 * your SaaradhiGo account". A visitor who is not signed in is sent to the right
 * sign-in. /ride stays the public explainer for anyone not riding right now. The rider pages are served from /rider/* by rewrite, because
 * /ride is also the marketing page a guest sees.
 *
 * The operations console lives under /ops (owner, 13 Nov). It used to share /trips with the
 * riders, so a guest opening their trip landed on the staff login. Every old console path
 * redirects to its /ops twin (bookmarks, emails, links the backend sends); /trips is now the
 * riders' only. /book, a second stripped-down booking page, redirects to /ride.
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

/** Console roots that moved under /ops (13 Nov). /trips is not here: it belongs to riders now. */
export const OLD_CONSOLE_ROOTS = ['/approvals', '/dashboard', '/drivers', '/finance', '/fraud', '/kyc', '/live-ops',
  '/notifications', '/pricing', '/promotions', '/reports', '/riders', '/safety-ops', '/settings', '/sos', '/start',
  '/support', '/withdrawals', '/zones', '/login'];
export const OPS = '/ops';

/** The page that says "this is for riding/driving" and offers the switch (app/(public)/role-gate). */
export const ROLE_GATE = '/role-gate';

function gate(need: 'rider' | 'driver', path: string, search: string): Decision {
  return { kind: 'rewrite', to: `${ROLE_GATE}?need=${need}&next=${encodeURIComponent(path + search)}` };
}

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

export function decide(pathname: string, search: string, session: Session | null, _area: AreaHint = null): Decision {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (OLD_CONSOLE_ROOTS.some((r) => p === r || p.startsWith(`${r}/`))) return { kind: 'redirect', to: `${OPS}${p}${search}` };
  if (p === '/book') return { kind: 'redirect', to: RIDER_HOME };

  // The internal rider paths are never addressed directly.
  if (p === '/rider' || p.startsWith('/rider/')) return { kind: 'redirect', to: RIDER_HOME };

  if (isDriverPath(p)) {
    if (!session) return { kind: 'redirect', to: signIn(p, search, true) };
    if (session.role !== 'driver') return gate('driver', p, search);
    // The old driver home and the one-page account moved into the area.
    if (p === '/driver/home') return { kind: 'redirect', to: DRIVER_HOME };
    return { kind: 'next' };
  }

  if (isRiderPath(p)) {
    if (!session) {
      // A guest keeps the marketing /ride; every other rider page asks them to sign in as a rider
      // and comes back (13 Nov: never the staff login, never the console).
      // 14 Nov: a guest also sees the fares for their trip (app/(public)/ride/choose); sign-in is asked at Book.
      if (p === '/ride' || p === '/ride/choose') return { kind: 'next' };
      return { kind: 'redirect', to: signIn(p === '/my-trips' ? '/trips' : p, p === '/my-trips' ? '' : search, false) };
    }
    if (session.role !== 'rider') {
      // Driving right now: the public explainer at /ride, and the gate on every rider page.
      if (p === '/ride') return { kind: 'next' };
      return gate('rider', p === '/my-trips' ? '/trips' : p, p === '/my-trips' ? '' : search);
    }
    if (p === '/my-trips') return { kind: 'redirect', to: '/trips' };
    return { kind: 'rewrite', to: `/rider${p}${search}` };
  }

  // Signed in already: the sign-in pages lead to the visitor's own area.
  if (session && p === '/sign-in') {
    return { kind: 'redirect', to: session.role === 'driver' ? DRIVER_HOME : RIDER_HOME };
  }
  // "Driver sign in" while riding: the driver area if this is a driver now, else the gate (switch or apply).
  if (session && p === '/driver/sign-in') {
    return session.role === 'driver' ? { kind: 'redirect', to: DRIVER_HOME } : gate('driver', DRIVER_HOME, '');
  }
  return { kind: 'next' };
}
