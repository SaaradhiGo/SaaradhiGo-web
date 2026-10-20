'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthNav from '@/components/AuthNav';
import { Wordmark } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { Close, Menu } from './icons';

/**
 * The top bar.
 *
 * ALWAYS `noir`, IN BOTH THEMES. The black band is part of the brand and the
 * logo artwork sits on it, so its text uses `on-noir` / `on-noir-muted` and
 * never `ink` -- which is what stops the bar inverting when a rider chooses
 * the light theme. The same is true of the Saaradhi Black band and the
 * footer.
 *
 * On a phone the links collapse into a menu and the wordmark and the primary
 * action stay, as the design system specifies. The emblem does not shrink
 * below its 40px minimum: it stays at 50px and the links go instead.
 *
 * ONE PRIMARY ACTION PER VIEW, AND THE NAV IS PART OF THE VIEW. On the
 * booking pages the screen's own primary is "Sign in" or "Confirm Sedan ·
 * ₹248", so the nav gives up its gold fill rather than competing with it.
 * That is decided here, from the route, instead of asking every page to
 * remember a prop -- which is the version that gets forgotten.
 */
const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/book', label: 'Book a ride' },
  { href: '/drive', label: 'Drive with us' },
  { href: '/contact', label: 'Contact' },
];

export function NavBar({ quiet }: { quiet?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // `/book` owns the page's gold button in every one of its states.
  const quietHere = quiet ?? pathname.startsWith('/book');

  // A route change must close the menu, or the panel stays over the page you
  // just navigated to.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40">
      <nav className="sg-nav sg-on-noir" aria-label="Main">
        <Wordmark />

        {/* Hidden under 768px by the stylesheet, not by a JS width check. */}
        <div className="sg-nav__links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="sg-nav__link"
              aria-current={isCurrent(l.href) ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-sg-2">
          <ThemeToggle />
          <div className="hidden sm:flex items-center gap-sg-2">
            <AuthNav quiet={quietHere} />
          </div>
          <button
            type="button"
            className="sg-btn sg-btn--ghost sg-btn--sm md:hidden"
            aria-expanded={open}
            aria-controls="sg-mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <Close /> : <Menu />}
          </button>
        </div>
      </nav>

      {open && (
        <div
          id="sg-mobile-menu"
          className="sg-on-noir md:hidden bg-noir border-b border-gold-line px-sg-4 pb-sg-5 pt-sg-2"
        >
          <ul className="flex flex-col">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isCurrent(l.href) ? 'page' : undefined}
                  className="flex items-center min-h-[48px] px-sg-3 body font-semibold text-on-noir-muted aria-[current=page]:text-on-noir"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-sg-3 flex items-center gap-sg-3 border-t border-gold-line pt-sg-4 sm:hidden">
            <AuthNav quiet={quietHere} />
          </div>
        </div>
      )}
    </header>
  );
}
