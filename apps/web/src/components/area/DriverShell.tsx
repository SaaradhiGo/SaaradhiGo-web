'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LegalLine } from '@/components/sg/Footer';
import { useEffect, useRef } from 'react';
import { useTr } from '@/i18n/website';
import { IBank, ICard, IDashboard, IDoc, IHelp, IList, IUser } from './icons';

/**
 * The driver's signed-in frame (driver-web-*.html): a black sidebar with the
 * emblem, wordmark and DRIVER badge, and six sections; the profile lives in the
 * header's menu (10 Nov). Driving itself happens in the driver app. On a phone
 * (11 Nov) the sidebar gives way to a bottom bar: Dashboard, Earnings, Trips,
 * Payouts and More, which holds Documents, Support and the profile.
 */
const NAV = [
  { href: '/driver', label: 'Dashboard', Icon: IDashboard },
  { href: '/driver/earnings', label: 'Earnings', Icon: ICard },
  { href: '/driver/trips', label: 'Trips', Icon: IList },
  { href: '/driver/documents', label: 'Documents', Icon: IDoc },
  { href: '/driver/payouts', label: 'Payouts', Icon: IBank },
  { href: '/driver/support', label: 'Support', Icon: IHelp },
];
const BAR = ['/driver', '/driver/earnings', '/driver/trips', '/driver/payouts'];
const MORE = [
  { href: '/driver/documents', label: 'Documents', Icon: IDoc },
  { href: '/driver/support', label: 'Support', Icon: IHelp },
  { href: '/driver/profile', label: 'Your profile', Icon: IUser },
];

const isOn = (href: string, path: string) => (href === '/driver' ? path === '/driver' : path.startsWith(href));

/** More: a menu above the bar; it closes on a choice and on Escape. */
function MoreMenu({ path }: { path: string }) {
  const tr = useTr();
  const box = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => { if (box.current) box.current.open = false; }, [path]);
  const on = MORE.some((m) => isOn(m.href, path));
  return (
    <details ref={box} className="dr-more" onKeyDown={(e) => {
      if (e.key === 'Escape' && box.current?.open) { box.current.open = false; box.current.querySelector('summary')?.focus(); }
    }}>
      <summary className={on ? 'dr-tab dr-tab--on' : 'dr-tab'}>
        <span className="dr-tab__dots" aria-hidden="true">•••</span>{tr('More')}
      </summary>
      <div className="dr-more__menu">
        {MORE.map(({ href, label, Icon }) => (
          <Link key={href} href={href} aria-current={isOn(href, path) ? 'page' : undefined}><Icon size={20} />{tr(label)}</Link>
        ))}
      </div>
    </details>
  );
}

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
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-current={isOn(href, path) ? 'page' : undefined}>
              <Icon />{tr(label)}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="dr-body">{children}<LegalLine className="dr-legal" /></div>
      <nav className="dr-tabbar" aria-label={tr('Driver sections')} data-testid="driver-tabbar">
        {NAV.filter((n) => BAR.includes(n.href)).map(({ href, label, Icon }) => (
          <Link key={href} href={href} className={isOn(href, path) ? 'dr-tab dr-tab--on' : 'dr-tab'} aria-current={isOn(href, path) ? 'page' : undefined}>
            <Icon size={22} />{tr(label)}
          </Link>
        ))}
        <MoreMenu path={path} />
      </nav>
    </div>
  );
}

/** The page header: title (and a line under it), then the right-hand controls. */
export function DriverHead({ title, sub, children }: { title: string; sub?: string | null; children?: React.ReactNode }) {
  return (
    <header className="dr-head">
      <div className="dr-head__title">
        <h1 className="a28">{title}</h1>
        {sub && <div className="a14 amut">{sub}</div>}
      </div>
      {children}
    </header>
  );
}
