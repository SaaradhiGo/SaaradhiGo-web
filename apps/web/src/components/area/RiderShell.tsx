'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTr } from '@/i18n/website';
import { AREA_FLAGS } from '@/lib/area/flags';
import { IHelp, IMoon, ISun, ISwitch } from './icons';
import { ProfileMenu } from './ProfileMenu';
import { ConfirmEmail } from './rider/ConfirmEmail';
import { areaPath, useArea } from './useArea';

/**
 * The rider's signed-in frame (rider-web-*.html): white top bar with the
 * emblem and wordmark, Ride / Trips / Account, then Help, the theme and the
 * profile button with the rider's first name (10 Nov). Light and map-first.
 */
const MENU = [
  { href: '/account', label: 'Your profile' },
  { href: '/trips', label: 'Trips' },
  { href: '/account#places', label: 'Saved places' },
  { href: AREA_FLAGS.trustedContacts ? '/account#safety' : '/safety', label: 'Safety' },
  { href: '/account#language', label: 'Language' },
];

const NAV = [
  { href: '/ride', label: 'Ride', match: (p: string) => p === '/ride' || p.startsWith('/ride/') },
  { href: '/trips', label: 'Trips', match: (p: string) => p === '/trips' || p.startsWith('/trips/') },
  { href: '/account', label: 'Account', match: (p: string) => p === '/account' },
];

export function RiderShell({ children }: { children: React.ReactNode }) {
  const tr = useTr();
  const path = areaPath(usePathname());
  const { both, signOut, switchTo } = useArea();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.getAttribute('data-theme') === 'dark'), []);

  function flip() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('sg-theme', next); } catch { /* private mode */ }
    document.cookie = `sg-theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setDark(!dark);
  }

  return (
    <div className="ar" data-area="rider">
      <header className="ar-top">
        <Link href="/ride" className="arow" style={{ gap: 10, textDecoration: 'none' }} aria-label={tr('SaaradhiGo home')}>
          <span className="ar-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/emblem-gold.svg" alt="" />
          </span>
          <span className="abrand">Saaradhi Go</span>
        </Link>
        <nav className="ar-nav" aria-label={tr('Rider')}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={n.match(path) ? 'page' : undefined}>
              {tr(n.label)}
            </Link>
          ))}
        </nav>
        <div className="ar-tools">
          <Link href="/help" className="achip"><IHelp size={18} /><span>{tr('Help')}</span></Link>
          <button type="button" className="achip" style={{ width: 36, padding: 0, justifyContent: 'center' }}
            onClick={flip} aria-label={tr(dark ? 'Switch to light theme' : 'Switch to dark theme')}>
            {dark ? <ISun size={18} /> : <IMoon size={18} />}
          </button>
          <ProfileMenu links={MENU} onSignOut={() => signOut()} extra={both && (
            <button type="button" role="menuitem" onClick={() => switchTo('driver')}>
              <ISwitch size={18} />{tr('Switch to driver')}
            </button>
          )} />
        </div>
      </header>
      <ConfirmEmail />
      <main id="main" className="ar-main">{children}</main>
    </div>
  );
}
