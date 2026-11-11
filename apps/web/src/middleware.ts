import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionSecret, verifySession } from '@/lib/session/cookie';
import { decide } from '@/lib/session/routing';

/** Routes riders and drivers to their own areas, on the server (owner, 2026-11-08). */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret());
  const d = decide(pathname, search, session);
  if (d.kind === 'redirect') return NextResponse.redirect(new URL(d.to, req.url));
  if (d.kind === 'rewrite') return NextResponse.rewrite(new URL(d.to, req.url));
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/ride', '/ride/:path*', '/trips', '/trips/:path*', '/account', '/my-trips',
    '/driver', '/driver/:path*', '/rider', '/rider/:path*', '/sign-in',
  ],
};
