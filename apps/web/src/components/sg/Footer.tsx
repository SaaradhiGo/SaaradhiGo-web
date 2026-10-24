import Link from 'next/link';
import { Logo } from './Logo';

/**
 * The public footer: the lockup, the same navigation as the header, and the
 * two legal documents.
 *
 * EVERY LINK RESOLVES TO A ROUTE THAT EXISTS. No invented contact details,
 * no social accounts, no app-store badges, no `href="#"`. Safety and About
 * address the homepage sections that hold that content until those pages
 * exist, which is the same rule the header follows.
 */
const NAV = [
  { key: 'ride', href: '/book', label: 'Ride' },
  { key: 'drive', href: '/drive', label: 'Drive' },
  { key: 'safety', href: '/#safety', label: 'Safety' },
  { key: 'about', href: '/#how-it-works', label: 'About' },
  { key: 'help', href: '/contact', label: 'Help' },
  { key: 'contact', href: '/contact', label: 'Contact' },
];

const LEGAL = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
];

export function Footer() {
  return (
    <footer className="hp-footer sg-on-noir">
      <div className="hp">
        <div className="hp-footer__top">
          <Logo variant="lockup" width={132} label="SaaradhiGo" />
          <nav className="hp-footer__nav" aria-label="Footer">
            {NAV.map((l) => (
              <Link key={l.key} href={l.href}>
                {l.label}
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
