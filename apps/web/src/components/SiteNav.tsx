'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthNav from '@/components/AuthNav';

/**
 * The public site's navigation.
 *
 * WHY THIS EXISTS
 * The header rendered its links as `hidden sm:flex` with no alternative, so
 * on a phone the site had NO navigation at all -- no way to reach Book a
 * ride, Drive with us or Contact except by typing the URL. On a product
 * whose customers are overwhelmingly on phones, that is the whole nav
 * missing for the whole audience.
 *
 * There is now a real menu under `sm`, and the current page is marked so you
 * can tell where you are.
 */

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/book', label: 'Book a ride' },
  { href: '/drive', label: 'Drive with us' },
  { href: '/contact', label: 'Contact' },
];

export default function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // A route change must close the menu, or the panel stays over the page you
  // just navigated to.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-900/90 backdrop-blur-md">
      <nav
        className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-10 h-16 flex items-center gap-8"
        aria-label="Main"
      >
        <Link href="/" className="shrink-0 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid place-items-center h-8 w-8 rounded-lg bg-brand text-black font-black text-sm"
          >
            S
          </span>
          <span className="font-bold text-lg tracking-tight">
            Saaradhi<span className="text-brand">Go</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isCurrent(l.href) ? 'page' : undefined}
              className={`px-3 py-2 rounded-lg text-sm transition-colors duration-150 ${
                isCurrent(l.href)
                  ? 'text-white bg-white/[0.06]'
                  : 'text-white/65 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2 sm:gap-3">
            <AuthNav />
          </div>

          <button
            type="button"
            className="md:hidden grid place-items-center h-11 w-11 -mr-2 rounded-lg text-white/80 hover:bg-white/5"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div
          id="mobile-menu"
          className="md:hidden border-t border-white/[0.06] bg-ink-900/98 px-4 pb-5 pt-2"
        >
          <ul className="flex flex-col">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isCurrent(l.href) ? 'page' : undefined}
                  className={`block min-h-[48px] flex items-center rounded-lg px-3 text-base ${
                    isCurrent(l.href) ? 'text-brand' : 'text-white/80'
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-3 border-t border-white/[0.06] pt-4 sm:hidden">
            <AuthNav />
          </div>
        </div>
      )}
    </header>
  );
}
