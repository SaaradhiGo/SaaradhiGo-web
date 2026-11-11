'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthNav from '@/components/AuthNav';
import { Close, Menu } from './icons';
import { LanguagePicker } from './LanguagePicker';
import { ThemeToggle } from './ThemeToggle';
import { useTr } from '@/i18n/website';

/**
 * The public header (approved design, 2026-11-07): 84px of black, the
 * chariot emblem and "Saaradhi Go" in Cinzel on the left, the five pages in
 * the middle, then the language globe, the theme switch, Log in and Sign up.
 *
 * The emblem shows at load on every page and links home. It is cropped from
 * the vector logo (public/brand/emblem-gold.svg), so it has no lettering of
 * its own; the name beside it is text.
 *
 * Under 1100px the bar is 68px with the emblem, the name, the theme switch
 * and a menu; the drawer holds the links, the language and the session.
 */
const LINKS = [
  { label: 'Ride', href: '/ride' },
  { label: 'Drive', href: '/drive' },
  { label: 'Safety', href: '/safety' },
  { label: 'About', href: '/about' },
  { label: 'Help', href: '/help' },
] as const;

export function NavBar({ quiet }: { quiet?: boolean }) {
  const pathname = usePathname();
  const tr = useTr();
  const [open, setOpen] = useState(false);

  // `/book` owns the page's gold button in every one of its states.
  const quietHere = quiet ?? pathname.startsWith('/book');

  // A route change must close the drawer, or it stays over the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isCurrent = (href: string) => pathname.startsWith(href);

  return (
    <header className="s-header s-cb">
      <nav className="s-wrap s-header__bar" aria-label="Main">
        <Link href="/" className="s-brand" aria-label={tr('SaaradhiGo home')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="s-brand__mark" src="/brand/emblem-gold.svg" alt="" width={76} height={66} />
          <span className="s-brand__name">Saaradhi Go</span>
        </Link>

        <div className="s-nav">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="s-nav__link"
              aria-current={isCurrent(l.href) ? 'page' : undefined}
            >
              {tr(l.label)}
            </Link>
          ))}
        </div>

        <div className="s-header__end">
          <LanguagePicker />
          <ThemeToggle />
          <AuthNav quiet={quietHere} />
        </div>

        <div className="s-header__phone">
          <ThemeToggle />
          <button
            type="button"
            className="s-icon-btn"
            aria-expanded={open}
            aria-controls="s-drawer"
            aria-label={tr(open ? 'Close menu' : 'Open menu')}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <Close /> : <Menu />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="s-drawer" className="s-drawer">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="s-drawer__link"
              aria-current={isCurrent(l.href) ? 'page' : undefined}
            >
              {tr(l.label)}
            </Link>
          ))}
          <div className="s-drawer__end">
            <LanguagePicker />
            <AuthNav quiet={quietHere} />
          </div>
        </div>
      )}
    </header>
  );
}
