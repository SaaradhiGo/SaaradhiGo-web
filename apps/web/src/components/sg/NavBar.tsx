'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthNav from '@/components/AuthNav';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { Close, Menu } from './icons';
import { LanguagePicker } from './LanguagePicker';
import { useT } from '@/i18n/LocaleProvider';

/**
 * The public header: logo left, links centred, session controls right.
 *
 * ALWAYS `noir`, IN BOTH THEMES. The bar is part of the brand and the logo
 * artwork sits on it, so its text uses `on-noir` / `on-noir-muted` and never
 * `ink` -- which is what stops the bar inverting when a visitor picks the
 * light theme.
 *
 * EVERY LINK RESOLVES. Ride, Drive and Help have routes. Safety and About do
 * not have pages yet, so they address the homepage sections that carry
 * exactly that content; they become `/safety` and `/about` the day those
 * pages exist. Nothing points at `href="#"`.
 *
 * Under 768px the links collapse into a drawer holding the same items plus
 * the session controls, which are hidden from the bar at that width.
 */
/** Labels come from the dictionary; the hrefs never move. */
const LINKS = [
  { key: 'ride', href: '/book' },
  { key: 'drive', href: '/drive' },
  { key: 'safety', href: '/#safety' },
  { key: 'about', href: '/#how-it-works' },
  { key: 'help', href: '/contact' },
] as const;

export function NavBar({ quiet }: { quiet?: boolean }) {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);

  // `/book` owns the page's gold button in every one of its states.
  const quietHere = quiet ?? pathname.startsWith('/book');

  // A route change must close the drawer, or it stays over the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // An anchor on the homepage is not a page of its own, so it is never
  // `aria-current`. Without this every nav item lights up on `/`.
  const isCurrent = (href: string) => {
    if (href.includes('#')) return false;
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  };

  return (
    <header className="hp-header sg-on-noir">
      <nav className="hp hp-nav" aria-label="Main">
        <Link href="/" className="hp-nav__logo">
          <Logo variant="emblem" />
          <span className="hp-nav__name">Saaradhi Go</span>
        </Link>

        <div className="hp-nav__links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hp-nav__link"
              aria-current={isCurrent(l.href) ? 'page' : undefined}
            >
              {t.nav[l.key]}
            </Link>
          ))}
        </div>

        <div className="hp-nav__session">
          <LanguagePicker />
          <ThemeToggle />
          <AuthNav quiet={quietHere} />
        </div>

        {/* On a phone the bar keeps the logo, the language and the menu. */}
        <div className="hp-nav__mobile">
          <LanguagePicker compact />
          <button
            type="button"
            className="hp-nav__toggle"
            aria-expanded={open}
            aria-controls="hp-drawer"
            aria-label={open ? t.nav.menuClose : t.nav.menuOpen}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <Close /> : <Menu />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="hp-drawer" className="hp-drawer sg-on-noir">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isCurrent(l.href) ? 'page' : undefined}
            >
              {t.nav[l.key]}
            </Link>
          ))}
          <div className="hp-drawer__session">
            <AuthNav quiet={quietHere} />
            <ThemeToggle />
          </div>
        </div>
      )}
    </header>
  );
}
