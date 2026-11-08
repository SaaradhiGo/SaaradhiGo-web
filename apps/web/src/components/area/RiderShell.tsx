'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTr } from '@/i18n/website';
import { IHelp, ILogout, IMoon, ISun, ISwitch, IUser } from './icons';
import { areaPath, useArea } from './useArea';

/**
 * The rider's signed-in frame (rider-web-*.html): white top bar with the
 * emblem and wordmark, Ride / Trips / Account, then Help, the theme and the
 * account menu. Light and map-first; no driver chrome anywhere.
 */
const NAV = [
  { href: '/ride', label: 'Ride', match: (p: string) => p === '/ride' || p.startsWith('/ride/') },
  { href: '/trips', label: 'Trips', match: (p: string) => p === '/trips' || p.startsWith('/trips/') },
  { href: '/account', label: 'Account', match: (p: string) => p === '/account' },
];

export function RiderShell({ children }: { children: React.ReactNode }) {
  const tr = useTr();
  const path = areaPath(usePathname());
  const { both, signOut, switchTo } = useArea();
  const [open, setOpen] = useState(false);
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
          <button type="button" className="ar-avatar" aria-label={tr('Account')} aria-expanded={open}
            onClick={() => setOpen(!open)}>
            <IUser />
          </button>
          {open && (
            <div className="acard ar-menu" role="menu">
              <Link href="/account" role="menuitem" onClick={() => setOpen(false)}><IUser size={18} />{tr('Account')}</Link>
              {both && (
                <button type="button" role="menuitem" onClick={() => switchTo('driver')}>
                  <ISwitch size={18} />{tr('Switch to driver')}
                </button>
              )}
              <button type="button" role="menuitem" onClick={signOut}><ILogout size={18} />{tr('Log out')}</button>
            </div>
          )}
        </div>
      </header>
      <main id="main" className="ar-main">{children}</main>
    </div>
  );
}
