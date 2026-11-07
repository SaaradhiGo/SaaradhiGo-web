'use client';

import Link from 'next/link';
import { Logo } from './Logo';
import { useT } from '@/i18n/LocaleProvider';

/**
 * The public footer: the lockup (at most 96px tall), the header's links in
 * columns, then one line with the year and the two legal documents. At most
 * 200px tall on desktop and 280px on a phone (check-layout).
 *
 * EVERY LINK RESOLVES TO A ROUTE THAT EXISTS. No invented contact details,
 * no social accounts, no app-store badges, no `href="#"`. The navigation is
 * the header's, so a visitor who scrolls past the fold finds the same five
 * pages rather than a longer list of links that only exist in a footer.
 */
const NAV = [
  { key: 'ride', href: '/ride' },
  { key: 'drive', href: '/drive' },
  { key: 'safety', href: '/safety' },
  { key: 'about', href: '/about' },
  { key: 'help', href: '/help' },
  { key: 'contact', href: '/contact' },
] as const;

export function Footer() {
  const t = useT();
  const LEGAL = [
    { href: '/privacy', label: t.footer.privacy },
    { href: '/terms', label: t.footer.terms },
  ];

  return (
    <footer className="hp-footer sg-on-noir">
      <div className="hp">
        <div className="hp-footer__top">
          <Logo variant="lockup" className="hp-footer__logo" label="SaaradhiGo" />
          <nav className="hp-footer__nav" aria-label="Footer">
            {NAV.map((l) => (
              <Link key={l.key} href={l.href}>
                {t.nav[l.key]}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hp-footer__base">
          <span>© {new Date().getFullYear()} SaaradhiGo</span>
          <div className="hp-footer__legal">
            {LEGAL.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
