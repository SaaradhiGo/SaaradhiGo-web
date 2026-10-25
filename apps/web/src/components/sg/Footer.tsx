'use client';

import Link from 'next/link';
import { Logo } from './Logo';
import { useT } from '@/i18n/LocaleProvider';

/**
 * The public footer: the lockup, the same navigation as the header, and the
 * two legal documents.
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
          <Logo variant="lockup" width={132} label="SaaradhiGo" />
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
