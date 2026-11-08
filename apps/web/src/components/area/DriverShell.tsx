'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTr } from '@/i18n/website';
import { IBank, ICard, IDashboard, IDoc, IHelp, IList, IUser } from './icons';
import { useArea } from './useArea';

/**
 * The driver's signed-in frame (driver-web-*.html): a black sidebar with the
 * emblem, wordmark and DRIVER badge, six sections, and the profile card at
 * the bottom. Driving itself happens in the driver app.
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
  // Sign-out lives on the profile page, as in the design.
  const { both, switchTo } = useArea();

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
        <div className="dr-me">
          <Link href="/driver/profile">
            <span className="dr-me__face"><IUser /></span>
            <span>
              <span className="ab" style={{ display: 'block' }}>{tr('Your profile')}</span>
              <span className="a14" style={{ display: 'block' }}>{tr('Account and vehicle')}</span>
            </span>
          </Link>
          {both && <button type="button" onClick={() => switchTo('rider')}>{tr('Switch to rider')}</button>}
        </div>
      </aside>
      <div className="dr-body">{children}</div>
    </div>
  );
}

/** The page header: title, then the right-hand controls. */
export function DriverHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="dr-head">
      <h1 className="a28" style={{ flex: 1 }}>{title}</h1>
      {children}
    </header>
  );
}
