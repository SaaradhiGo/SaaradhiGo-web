/**
 * The admin address (20 Nov, owner: "make proper urls"). The console lives at
 * admin.saaradhigo.com: that host serves only the console (`/ops`), its sign-in and the BFF,
 * and sends every public page to www. The public host keeps `/ops` working until DNS for the
 * admin host is live, so nobody is locked out during the switch.
 */
export const ADMIN_HOSTS = ['admin.saaradhigo.com'];
export const PUBLIC_ORIGIN = 'https://www.saaradhigo.com';

export type HostDecision = { kind: 'redirect'; to: string } | { kind: 'next' } | null;

export function adminHostDecision(host: string | null, pathname: string, search: string): HostDecision {
  const h = (host ?? '').toLowerCase().split(':')[0];
  if (!ADMIN_HOSTS.includes(h)) return null;
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (p === '/' || p === '') return { kind: 'redirect', to: '/ops' };
  if (p === '/login') return { kind: 'redirect', to: `/ops/login${search}` };
  if (p === '/ops' || p.startsWith('/ops/') || p.startsWith('/api/') || p.startsWith('/_next/')) return { kind: 'next' };
  // Static files (brand marks, fonts, icons) are served on either host.
  if (/\.[a-z0-9]{2,5}$/i.test(p)) return { kind: 'next' };
  return { kind: 'redirect', to: `${PUBLIC_ORIGIN}${p}${search}` };
}

/** The paths the area routing (`decide`) owns; everything else passes straight through. */
const PREFIX = ['/ride', '/trips', '/driver', '/rider', '/approvals', '/dashboard', '/drivers', '/finance', '/fraud',
  '/kyc', '/live-ops', '/notifications', '/pricing', '/promotions', '/reports', '/riders', '/safety-ops',
  '/settings', '/sos', '/start', '/support', '/withdrawals', '/zones', '/login'];
const EXACT = ['/account', '/my-trips', '/sign-in', '/book'];

export function isRoutedPath(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return EXACT.includes(p) || PREFIX.some((r) => p === r || p.startsWith(`${r}/`));
}

/**
 * The public host's console paths move to the admin host once it has its certificate (20 Nov):
 * switched on by ADMIN_HOST_LIVE=1, so nobody is sent to an address that does not answer yet.
 */
export function consoleOnPublicHost(host: string | null, pathname: string, search: string, live: boolean): HostDecision {
  if (!live) return null;
  const h = (host ?? '').toLowerCase().split(':')[0];
  if (ADMIN_HOSTS.includes(h)) return null;
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (p === '/ops' || p.startsWith('/ops/')) return { kind: 'redirect', to: `https://${ADMIN_HOSTS[0]}${p}${search}` };
  return null;
}
