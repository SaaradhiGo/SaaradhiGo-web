import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionSecret, verifySession } from '@/lib/session/cookie';
import { AREA_COOKIE, type AreaHint, decide } from '@/lib/session/routing';
import { adminHostDecision, consoleOnPublicHost, isRoutedPath } from '@/lib/session/adminHost';

/** Routes riders and drivers to their own areas, on the server (owner, 2026-11-08). */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // 20 Nov: admin.saaradhigo.com serves the console only.
  const host = adminHostDecision(req.headers.get('x-forwarded-host') ?? req.headers.get('host'), pathname, search);
  if (host?.kind === 'redirect') return NextResponse.redirect(new URL(host.to, req.url));
  if (host?.kind === 'next') return NextResponse.next();
  const moved = consoleOnPublicHost(req.headers.get('x-forwarded-host') ?? req.headers.get('host'), pathname, search,
    process.env.ADMIN_HOST_LIVE === '1');
  if (moved?.kind === 'redirect') return NextResponse.redirect(moved.to, 308);
  if (!isRoutedPath(pathname)) return NextResponse.next();
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret());
  const hint = req.cookies.get(AREA_COOKIE)?.value;
  const area: AreaHint = hint === 'rider' || hint === 'driver' || hint === 'console' ? hint : null;
  const d = decide(pathname, search, session, area);
  if (d.kind === 'redirect') return NextResponse.redirect(new URL(d.to, req.url));
  if (d.kind === 'rewrite') return NextResponse.rewrite(new URL(d.to, req.url));
  return NextResponse.next();
}

export const config = {
  // Every page, so the admin host can be answered; the area routing still only acts on its own
  // paths (`isRoutedPath`, the list this matcher used to hold).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
