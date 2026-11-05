'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The Pricing pages share one sub-navigation. All open with `zone.read`
 * (the same capability), so it is drawn whole or not at all (the link rule).
 */
const TABS = [
  { href: '/pricing', label: 'Commission' },
  { href: '/pricing/fare-cards', label: 'Fare cards' },
  { href: '/pricing/vehicle-classes', label: 'Vehicle classes' },
] as const;

export function PricingNav() {
  const pathname = usePathname() ?? '';
  const current = TABS.find((t) => (t.href === '/pricing'
    ? pathname === t.href
    : pathname === t.href || pathname.startsWith(`${t.href}/`)))?.href;
  return (
    <nav className="ops-subnav" aria-label="Pricing">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="ops-subnav__link"
          aria-current={current === t.href ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
