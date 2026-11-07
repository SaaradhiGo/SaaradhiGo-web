'use client';

import Link from 'next/link';
import { useTr } from '@/i18n/website';
import { useSite } from '@/i18n/site';

/**
 * The public footer (approved design, 2026-11-07), about 150px on desktop:
 * the emblem and one line on the left, the five pages on the right, then the
 * year with Privacy, Terms and Contact. No language list, no social links,
 * no store badges. On a phone the links sit in a three-column grid.
 */
const NAV = [
  { label: 'Ride', href: '/ride' },
  { label: 'Drive', href: '/drive' },
  { label: 'Safety', href: '/safety' },
  { label: 'About', href: '/about' },
  { label: 'Help', href: '/help' },
] as const;

export function Footer() {
  const tr = useTr();
  const s = useSite();

  return (
    <footer className="s-footer s-cb">
      <div className="s-wrap s-footer__top">
        <div className="s-footer__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="s-footer__mark" src="/brand/emblem-gold.svg" alt="SaaradhiGo logo" width={52} height={46} />
          <span className="s-footer__line">
            <span className="s-only-desk">{s.footer.line}</span>
            <span className="s-only-phone">{s.footer.lineShort}</span>
          </span>
        </div>
        <nav className="s-footer__nav" aria-label="Footer">
          {NAV.map((l) => (
            <Link key={l.href} href={l.href}>
              {tr(l.label)}
            </Link>
          ))}
          <Link href="/contact" className="s-footer__phone-link">
            {s.footer.contact}
          </Link>
        </nav>
      </div>

      <div className="s-wrap s-footer__base">
        <span>© {new Date().getFullYear()} SaaradhiGo</span>
        <span className="s-footer__legal">
          <Link href="/privacy">{s.footer.privacy}</Link>
          <Link href="/terms">{s.footer.terms}</Link>
          <Link href="/contact" className="s-only-desk">{s.footer.contact}</Link>
        </span>
      </div>
    </footer>
  );
}
