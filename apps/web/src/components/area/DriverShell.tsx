'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTr } from '@/i18n/website';
import { IBank, ICard, IDashboard, IDoc, IHelp, IList } from './icons';

/**
 * The driver's signed-in frame (driver-web-*.html): a black sidebar with the
 * emblem, wordmark and DRIVER badge, and six sections; the profile lives in the
 * header's menu (10 Nov). Driving itself happens in the driver app.
 */
const NAV = [
  { href: '/driver', label: 'Dashboard', Icon: IDashboard },
  { href: '/driver/earnings', label: 'Earnings', Icon: ICard },
  { href: '/driver/trips', label: 'Trips', Icon: IList },
  { href: '/driver/documents', label: 'Documents', Icon: IDoc },
  { href: '/driver/payouts', label: 'Payouts', Icon: IBank },
  { href: '/driver/support', label: 'Support', Icon: IHelp },
];

export function DriverShell({ children }: { children: React.ReactNode }) {
  const tr = useTr();
  const path = usePathname() ?? '/driver';

  return (
    <div className="ar dr" data-area="driver">
      <aside className="dr-side">
        <Link href="/driver" className="dr-brand" style={{ textDecoration: 'none' }} aria-label={tr('SaaradhiGo home')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/emblem-gold.svg" alt="" />
          <div>
            <div className="abrand">Saaradhi Go</div>
            <div className="dr-badge">DRIVER</div>
          </div>
        </Link>
        <nav className="dr-nav" aria-label={tr('Driver')}>
          {NAV.map(({ href, label, Icon }) => {
            const on = href === '/driver' ? path === '/driver' : path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={on ? 'page' : undefined}>
                <Icon />{tr(label)}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="dr-body">{children}</div>
    </div>
  );
}

/** The page header: title (and a line under it), then the right-hand controls. */
export function DriverHead({ title, sub, children }: { title: string; sub?: string | null; children?: React.ReactNode }) {
  return (
    <header className="dr-head">
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 className="a28">{title}</h1>
        {sub && <div className="a14 amut">{sub}</div>}
      </div>
      {children}
    </header>
  );
}
