'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CONSOLE_SESSION_ENDED, clearTokens, readOperator, readToken,
} from '@/lib/api';
import {
  AdminAccess, can, fetchAdminAccess, isLockedOut,
} from '@/lib/adminScope';
import { fetchQueueCounts } from '@/lib/consoleQueues';
import {
  readSidebarCollapsed, useTheme, writeSidebarCollapsed,
} from '@/lib/consolePrefs';
import { Sidebar, type NavGroup } from '@/components/console/Sidebar';
import { TopBar } from '@/components/console/TopBar';
import { RecoveryLowBanner } from '@/components/console/RecoveryLowBanner';
import {
  Gauge, LifeBuoy, MapPin, Route, Shield, Siren, UserRound, Users, Wallet,
} from '@/components/console/icons';
import '@/styles/console.css';

/**
 * The console shell: a noir rail, a top bar, and the page.
 *
 * THE RAIL IS GROUPED THE WAY THE WORK IS. Operations, People, Money,
 * Safety & Risk, Settings -- and Growth, which has nothing in it yet and
 * so is not drawn. A group only appears when the operator holds at least
 * one of its pages, and an item only when they hold its permission: a link
 * the server would refuse is a dead end, not a feature.
 *
 * `need` hides a link; it is NOT what stops the operator. Every endpoint
 * re-checks the permission and re-filters the rows. See lib/adminScope.ts.
 *
 * THE COUNTS ARE ALLOWED TO BE UNKNOWN. A failed count renders as nothing,
 * never as a zero: "0 drivers awaiting review" is a sentence an operator
 * acts on, and it must never be the way a broken request looks.
 */
const GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { href: '/dashboard', label: 'Command Centre', Icon: Gauge, need: 'trip.read' },
      { href: '/trips', label: 'Trips', Icon: Route, need: 'trip.read' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/drivers', label: 'Drivers', Icon: Users, need: 'driver.read', countKey: 'drivers' },
      { href: '/riders', label: 'Riders', Icon: UserRound, need: 'rider.read' },
      { href: '/support', label: 'Support', Icon: LifeBuoy, need: 'support.read', countKey: 'support' },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/withdrawals', label: 'Withdrawals', Icon: Wallet, need: 'finance.read', countKey: 'withdrawals' },
    ],
  },
  {
    label: 'Safety & Risk',
    items: [
      { href: '/sos', label: 'SOS', Icon: Siren, need: 'safety.respond', countKey: 'sos', urgent: true },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/zones', label: 'Zones & fares', Icon: MapPin, need: 'zone.write' },
      // No `need`: the operator's OWN authenticator and recovery codes.
      // The endpoints behind it identify them from the token and answer
      // about nobody else, so every operator may open it.
      { href: '/settings/security', label: 'Security', Icon: Shield },
    ],
  },
];

// Growth (promotions, markets) has no page yet and so no group: a heading
// with nothing under it is a promise the console cannot keep. It joins
// GROUPS when something exists to put in it.

type Counts = Record<string, number | undefined>;

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [counts, setCounts] = useState<Counts>({});
  const [theme, setTheme] = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  // NOT `useState(readOperator())`. localStorage is unreadable during
  // server rendering, so the server emitted "Operator" and the client
  // immediately rendered the real name -- a hydration mismatch, which React
  // reports as minified error 418 on every console page. Read it after
  // mount instead, where the two sides agree.
  const [operator, setOperator] = useState<ReturnType<typeof readOperator>>(null);

  // What this operator holds. THREE STATES, NOT TWO. `undefined` means
  // "not asked yet", `null` means "asked and could not tell". They must
  // differ: counting the queues while the answer is still in flight asked
  // for every queue and collected a 403 per page load, because an unknown
  // permission is treated as allowed. So the badges wait, and only an
  // actual failure falls back to asking for everything.
  const [access, setAccess] = useState<AdminAccess | null | undefined>(undefined);

  useEffect(() => {
    if (!readToken()) router.replace('/login');
    else setOperator(readOperator());
  }, [router, pathname]);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
  }, []);

  // The console's theme is the operator's choice; the <html> attribute has
  // to follow so native controls and the scrollbar agree with the page.
  // Put back to dark on the way out, which is what the public site expects.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', theme);
    return () => { root.setAttribute('data-theme', before ?? 'dark'); };
  }, [theme]);

  useEffect(() => {
    if (!readToken()) return;
    void fetchAdminAccess().then((a) => setAccess(a ?? null));
  }, [pathname]);

  // A request refused for its token: the session ended. Say so on the
  // sign-in page and remember where the operator was.
  useEffect(() => {
    const onEnded = () => {
      const next = pathname && pathname !== '/login' ? `&next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login?reason=expired${next}`);
    };
    window.addEventListener(CONSOLE_SESSION_ENDED, onEnded);
    return () => window.removeEventListener(CONSOLE_SESSION_ENDED, onEnded);
  }, [router, pathname]);

  /**
   * How much is waiting. Each is independent: one failing leaves the
   * others alone and leaves its own badge absent rather than zero.
   */
  const loadCounts = useCallback(() => {
    if (!readToken()) return;
    if (access === undefined) return;
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

  function toggleSidebar() {
    setCollapsed((c) => {
      writeSidebarCollapsed(!c);
      return !c;
    });
  }

  const isCurrent = useCallback((href: string) =>
    pathname === href || Boolean(pathname?.startsWith(href + '/')), [pathname]);

  const groups = useMemo(() => GROUPS
    .map((g) => ({ ...g, items: g.items.filter((item) => !item.need || can(access ?? null, item.need)) }))
    .filter((g) => g.items.length > 0), [access]);

  return (
    <div className="ops" data-theme={theme} data-collapsed={collapsed ? 'true' : undefined}>
      <a href="#ops-content" className="skip-link">Skip to content</a>
      <Sidebar
        groups={groups}
        counts={counts}
        collapsed={collapsed}
        onToggle={toggleSidebar}
        isCurrent={isCurrent}
      />

      <div className="ops__main">
        <TopBar
          access={access ?? null}
          operator={operator}
          sosOpen={counts.sos}
          theme={theme}
          onTheme={setTheme}
          onSignOut={signOut}
        />

        <main className="ops__content" id="ops-content" tabIndex={-1}>
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

          {/* A recovery code was spent at sign-in and few are left. Said
              once, here, with the way to fix it. */}
          <RecoveryLowBanner />

          {access === undefined ? (
            /* Nothing is rendered until we know what this operator holds.
               Rendering the page first meant it fired its own fetch during
               the gap, which for a locked-out account is a guaranteed 403
               and a console error on every load. */
            <div className="ops-loading" aria-busy="true" aria-live="polite">
              <span className="ops-skel ops-skel--text" style={{ width: '12rem' }} aria-hidden="true" />
              <span className="sr-only">Loading your console</span>
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
    </div>
  );
}
