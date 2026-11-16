import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionSecret, verifySession } from '@/lib/session/cookie';
import { AREA_COOKIE, type AreaHint, decide } from '@/lib/session/routing';

/** Routes riders and drivers to their own areas, on the server (owner, 2026-11-08). */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret());
  const hint = req.cookies.get(AREA_COOKIE)?.value;
  const area: AreaHint = hint === 'rider' || hint === 'driver' || hint === 'console' ? hint : null;
  const d = decide(pathname, search, session, area);
  if (d.kind === 'redirect') return NextResponse.redirect(new URL(d.to, req.url));
  if (d.kind === 'rewrite') return NextResponse.rewrite(new URL(d.to, req.url));
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/ride', '/ride/:path*', '/trips', '/trips/:path*', '/account', '/my-trips',
    '/driver', '/driver/:path*', '/rider', '/rider/:path*', '/sign-in', '/book',
    // The console's old paths (13 Nov: it moved under /ops); each redirects to its /ops twin.
    '/approvals/:path*', '/dashboard/:path*', '/drivers/:path*', '/finance/:path*', '/fraud/:path*', '/kyc/:path*',
    '/live-ops/:path*', '/notifications/:path*', '/pricing/:path*', '/promotions/:path*', '/reports/:path*',
    '/riders/:path*', '/safety-ops/:path*', '/settings/:path*', '/sos/:path*', '/start/:path*', '/support/:path*',
    '/withdrawals/:path*', '/zones/:path*', '/login/:path*',
  ],
};
