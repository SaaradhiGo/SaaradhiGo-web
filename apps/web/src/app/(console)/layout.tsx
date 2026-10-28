'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { clearTokens, readOperator, readToken } from '@/lib/api';
import {
  AdminAccess, can, fetchAdminAccess, isLockedOut, scopeLabel,
} from '@/lib/adminScope';
import { ScopeSwitcher } from '@/components/console/ScopeSwitcher';
import { fetchQueueCounts } from '@/lib/consoleQueues';
import { Logo } from '@/components/sg/Logo';
import {
  Gauge, LifeBuoy, MapPin, Route, Siren, Users, Wallet,
} from '@/components/console/icons';
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
// `need` is the permission that governs the page. It hides a link the
// operator cannot use; it is NOT what stops them using it -- the endpoints
// behind each page re-check the permission and re-filter the rows. An item
// with no `need` is open to every operator.
const GROUPS = [
  {
    label: 'Live',
    items: [
      { href: '/dashboard', label: 'Dashboard', Icon: Gauge, need: 'report.read' },
      { href: '/sos', label: 'SOS', key: 'sos', urgent: true, Icon: Siren, need: 'safety.respond' },
      { href: '/trips', label: 'Trips', Icon: Route, need: 'trip.read' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/drivers', label: 'Drivers', key: 'drivers', Icon: Users, need: 'driver.read' },
      { href: '/support', label: 'Support', key: 'support', Icon: LifeBuoy, need: 'support.read' },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/withdrawals', label: 'Withdrawals', key: 'withdrawals', Icon: Wallet, need: 'finance.read' },
      { href: '/zones', label: 'Zones & fares', Icon: MapPin, need: 'zone.write' },
    ],
  },
] as const;

type Counts = Partial<Record<'sos' | 'drivers' | 'support' | 'withdrawals', number>>;

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [counts, setCounts] = useState<Counts>({});
  // NOT `useState(readOperator())`. localStorage is unreadable during
  // server rendering, so the server emitted "Operator" and the client
  // immediately rendered the real name -- a hydration mismatch, which React
  // reports as minified error 418 on every console page. Read it after
  // mount instead, where the two sides agree.
  const [operator, setOperator] = useState<ReturnType<typeof readOperator>>(null);
  // What this operator holds. Null until it arrives, and null on failure --
  // `can()` then returns true for everything, so a failed lookup shows the
  // full nav rather than an empty one. Showing a link the server will
  // refuse is a dead end; hiding one it would have allowed is an operator
  // who cannot do their job.
  //
  // THREE STATES, NOT TWO. `undefined` means "not asked yet", `null` means
  // "asked and could not tell". They must differ: counting the queues
  // while the answer is still in flight asked for every queue and
  // collected a 403 per page load, because an unknown permission is
  // treated as allowed. So the badges wait, and only an actual failure
  // falls back to asking for everything.
  const [access, setAccess] = useState<AdminAccess | null | undefined>(undefined);

  useEffect(() => {
    if (!readToken()) router.replace('/login');
    else setOperator(readOperator());
  }, [router, pathname]);

  useEffect(() => {
    if (!readToken()) return;
    void fetchAdminAccess().then((a) => setAccess(a ?? null));
  }, [pathname]);

  /**
   * How much is waiting. Each is independent: one failing leaves the
   * others alone and leaves its own badge absent rather than zero.
   */
  const loadCounts = useCallback(() => {
    if (!readToken()) return;
    // Still waiting to hear what this operator holds; see the note above.
    if (access === undefined) return;

    // The queries live in lib/consoleQueues.ts, because the three endpoints
    // disagree about the CASE of their status values and support silently
    // matches nothing when it is wrong.
    // `access` gates which queues are asked for at all: the sidebar used
    // to request every one of them and collect a 403 per page load.
    void fetchQueueCounts(access ?? null).then((c) => setCounts({
      drivers: c.driversAwaiting ?? undefined,
      withdrawals: c.withdrawalsPending ?? undefined,
      support: c.supportOpen ?? undefined,
      sos: c.sosOpen ?? undefined,
    }));
  }, [access]);

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

        <ScopeSwitcher access={access ?? null} />

        <nav aria-label="Console">
          {GROUPS.filter((group) => group.items.some(
            (item) => !('need' in item) || can(access ?? null, item.need),
          )).map((group) => (
            <div className="ops__group" key={group.label}>
              <div className="ops__group-label">{group.label}</div>
              {group.items.filter(
                (item) => !('need' in item) || can(access ?? null, item.need),
              ).map((item) => {
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
                    <item.Icon />
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
          {/* The role, so an operator can see which hat they are wearing
              when a page refuses them. */}
          {access?.roles?.length ? (
            <span className="ops__who-role">
              {access.roles.map((r) => r.role_name).join(', ')}
              {scopeLabel(access ?? null) ? ` · ${scopeLabel(access ?? null)}` : ''}
            </span>
          ) : null}
          <button onClick={signOut} className="btn-ghost text-left mt-2">
            Sign out
          </button>
        </div>
      </aside>

      <main className="ops__main">
        {/* The floor, as a standing prompt to the only people who can act
            on it. One named Super Admin is a deliberate, warned state --
            not an error -- so this is a notice, not an alarm. */}
        {access && access.super_admin_shortfall > 0 && (
          <div className="ops-banner" role="status">
            <b>
              {access.super_admin_shortfall} more named Super Admin
              {access.super_admin_shortfall === 1 ? '' : 's'} needed
            </b>
            <span>
              The platform should have two accountable people who can
              administer it. The emergency account does not count.
            </span>
          </div>
        )}

        {access === undefined ? (
          /* Nothing is rendered until we know what this operator holds.
             Rendering the page first meant it fired its own fetch during
             the gap, which for a locked-out account is a guaranteed 403
             and a console error on every load -- the operator's first
             sight of the product being an error they cannot act on. */
          <div className="ops-empty" aria-busy="true">
            <b>Loading…</b>
          </div>
        ) : isLockedOut(access) ? (
          /* Strict mode, no assignment. Without this the operator gets a
             blank nav and an empty table and has to guess why. */
          <div className="ops-empty" role="status">
            <b>Your account has no access yet</b>
            <span>
              Operator access is now granted per role and region, and
              nothing has been assigned to this account. Ask a Super Admin
              to assign you a role — until then there is nothing here to
              show you.
            </span>
          </div>
        ) : children}
      </main>
    </div>
  );
}
