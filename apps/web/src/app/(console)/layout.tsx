'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, clearTokens, readOperator, readToken } from '@/lib/api';
import { Logo } from '@/components/sg/Logo';
import '@/styles/console.css';

/**
 * The console shell.
 *
 * IT USED TO BE SEVEN FLAT LINKS with no sense of what the app is for and
 * no sign of where the work was. An operator had to open each page to
 * discover whether anything was waiting on them, which is the opposite of
 * what a console is for.
 *
 * Now the nav is grouped the way a shift is shaped — what is happening
 * now, the money, the people — and each item carries the number of things
 * waiting, fetched once here rather than by every page.
 *
 * THE COUNTS ARE ALLOWED TO BE UNKNOWN. A failed count renders as nothing
 * at all, never as a zero: "0 drivers awaiting review" is a sentence an
 * operator acts on, and it must never be the way a broken request looks.
 */
const GROUPS = [
  {
    label: 'Live',
    items: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/sos', label: 'SOS', key: 'sos', urgent: true },
      { href: '/trips', label: 'Trips' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/drivers', label: 'Drivers', key: 'drivers' },
      { href: '/support', label: 'Support', key: 'support' },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/withdrawals', label: 'Withdrawals', key: 'withdrawals' },
      { href: '/zones', label: 'Zones & fares' },
    ],
  },
] as const;

type Counts = Partial<Record<'sos' | 'drivers' | 'support' | 'withdrawals', number>>;

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [counts, setCounts] = useState<Counts>({});
  const [operator, setOperator] = useState(readOperator());

  useEffect(() => {
    if (!readToken()) router.replace('/login');
    else setOperator(readOperator());
  }, [router, pathname]);

  /**
   * How much is waiting. Each is independent: one failing leaves the
   * others alone and leaves its own badge absent rather than zero.
   */
  const loadCounts = useCallback(() => {
    if (!readToken()) return;

    const take = (key: keyof Counts) => (value: unknown) => {
      const n = (value as { count?: number })?.count;
      if (typeof n === 'number') setCounts((c) => ({ ...c, [key]: n }));
    };

    api.get('/driver/admin/?approved=false&page_size=1').then(take('drivers')).catch(() => {});
    api.get('/driver/admin/withdrawals/?status=pending&page_size=1').then(take('withdrawals')).catch(() => {});
    api.get('/support/admin/tickets/?status=open&page_size=1').then(take('support')).catch(() => {});
    api.get('/sos/admin/?status=open&page_size=1').then(take('sos')).catch(() => {});
  }, []);

  useEffect(() => {
    loadCounts();
    // An operator leaves this open all day; a queue that only updates on
    // reload is a queue they stop trusting.
    const tick = setInterval(loadCounts, 60000);
    return () => clearInterval(tick);
  }, [loadCounts, pathname]);

  function signOut() {
    clearTokens();
    router.replace('/login');
  }

  const isCurrent = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/');

  return (
    // Pinned dark. The console is built on this palette and an operator who
    // switched the rider site to light must still get a readable console.
    <div data-theme="dark" className="ops">
      <aside className="ops__side">
        <div className="ops__brand">
          <Logo variant="emblem" />
          <div>
            <b>SaaradhiGo</b>
            <span>Operations</span>
          </div>
        </div>

        <nav aria-label="Console">
          {GROUPS.map((group) => (
            <div className="ops__group" key={group.label}>
              <div className="ops__group-label">{group.label}</div>
              {group.items.map((item) => {
                const key = 'key' in item ? (item.key as keyof Counts) : undefined;
                const count = key ? counts[key] : undefined;
                const urgent = 'urgent' in item && item.urgent;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="ops__link"
                    aria-current={isCurrent(item.href) ? 'page' : undefined}
                  >
                    {item.label}
                    {typeof count === 'number' && count > 0 && (
                      <span
                        className={`ops__count ${urgent ? 'ops__count--urgent' : ''}`}
                        aria-label={`${count} waiting`}
                      >
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="ops__who">
          <b>{operator?.full_name?.trim() || 'Operator'}</b>
          <span>{operator?.email || operator?.phone_number || ''}</span>
          <button onClick={signOut} className="btn-ghost text-left mt-2">
            Sign out
          </button>
        </div>
      </aside>

      <main className="ops__main">{children}</main>
    </div>
  );
}
