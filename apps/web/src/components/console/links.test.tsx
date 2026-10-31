/**
 * THE LINK RULE, as a table (owner, AUDIT 27.40).
 *
 * Never render a link, nav item, tab, button or count that leads to a page or
 * action the role cannot open. For each of the nine role templates this
 * renders the sidebar, the top-bar badges and a city board, and compares the
 * set of destinations with a literal table: a new link that forgets to ask
 * `canOpen` shows up here as a role holding a link it should not.
 *
 * `TEMPLATES` mirrors `servers/admin_access/roles.py` (ROLE_TEMPLATES). The
 * backend has a test that `/admin-access/me/` lists exactly what
 * `bridge.granted` allows for each template, so the two repositories agree
 * through that list; if a template changes, change it here too.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import type { CityRow } from '@/lib/commandCentre';
import { CityBoard } from '@/components/console/command-centre/CityBoard';
import { NAV_GROUPS, homeFor, visibleGroups } from '@/components/console/navGroups';
import { Sidebar } from '@/components/console/Sidebar';
import { TopBar } from '@/components/console/TopBar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
}));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

let current: AdminAccess | null = null;
vi.mock('@/lib/adminScope', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/adminScope')>();
  return { ...original, useAdminAccess: () => current, withScope: (p: string) => p };
});
vi.mock('@/components/console/GlobalSearch', () => ({ GlobalSearch: () => null }));
vi.mock('@/components/console/ProfileMenu', () => ({ ProfileMenu: () => null }));
vi.mock('@/components/console/ScopeSwitcher', () => ({ ScopeSwitcher: () => null }));
vi.mock('@/components/console/EnvBadge', () => ({ EnvBadge: () => null }));

afterEach(cleanup);

const TEMPLATES: Record<string, { permissions: string[]; global?: boolean }> = {
  super_admin: {
    global: true,
    permissions: [
      'trip.read', 'rider.read', 'driver.read', 'support.read', 'finance.read', 'report.read', 'audit.read',
      'zone.read', 'pii.view', 'trip.write', 'rider.write', 'rider.note', 'rider.flag', 'rider.signout',
      'rider.block', 'driver.write', 'driver.kyc', 'driver.deactivate', 'support.reply', 'support.refund',
      'support.macro', 'support.sla', 'support.dashboard', 'finance.payout', 'finance.adjust', 'finance.export', 'finance.config', 'finance.aggregate', 'pricing.write',
      'zone.write', 'promo.write', 'notify.send', 'safety.read', 'safety.respond', 'safety.config',
      'fraud.review', 'admin.manage', 'platform.settings', 'approval.check', 'liveops.read', 'liveops.aggregate',
    ],
  },
  city_ops_manager: {
    permissions: [
      'trip.read', 'trip.write', 'rider.read', 'driver.read', 'driver.write', 'support.read', 'report.read',
      'zone.read', 'zone.write', 'promo.write', 'pii.view', 'rider.note', 'rider.flag', 'rider.signout',
      'rider.block', 'pricing.write', 'safety.read', 'support.sla', 'support.dashboard', 'finance.aggregate',
      'liveops.read',
    ],
  },
  support_agent: {
    permissions: ['trip.read', 'rider.read', 'driver.read', 'support.read', 'support.reply', 'support.refund',
      'rider.note', 'rider.flag', 'rider.signout'],
  },
  support_lead: {
    permissions: ['trip.read', 'rider.read', 'driver.read', 'support.read', 'support.reply', 'support.refund',
      'support.macro', 'support.dashboard', 'rider.note', 'rider.flag', 'rider.signout'],
  },
  safety_officer: {
    permissions: ['trip.read', 'rider.read', 'driver.read', 'driver.write', 'safety.respond', 'safety.read',
      'support.read', 'rider.note', 'rider.flag', 'rider.signout', 'rider.block', 'pii.view', 'liveops.read'],
  },
  kyc_verifier: { permissions: ['driver.read', 'driver.kyc', 'pii.view'] },
  finance: {
    permissions: ['trip.read', 'driver.read', 'rider.read', 'support.read', 'finance.read', 'finance.payout',
      'finance.adjust', 'finance.export', 'finance.config', 'finance.aggregate', 'support.refund',
      'report.read', 'zone.read', 'pii.view', 'rider.note'],
  },
  marketing: { permissions: ['promo.write', 'notify.send', 'report.read', 'liveops.aggregate'] },
  analyst: { permissions: ['trip.read', 'driver.read', 'rider.read', 'report.read', 'zone.read', 'finance.aggregate', 'liveops.aggregate'] },
};

const CITY = { code: 'IN-TG-HYD', name: 'Hyderabad', kind: 'city', status: 'active', depth: 3, path: '/IN/IN-TG/IN-TG-HYD/' };

function accessFor(role: string): AdminAccess {
  const t = TEMPLATES[role];
  return {
    id: 1, email: `${role}@saaradhigo.test`, full_name: role, is_superuser: false, is_break_glass: false,
    permissions: t.permissions,
    roles: [{
      role, role_name: role, scope: t.global ? 'GLOBAL' : CITY.code, scope_name: '', scope_kind: t.global ? 'global' : 'city',
      scope_path: t.global ? '/GLOBAL/' : CITY.path, permissions: t.permissions,
    }],
    scopes: [CITY],
    unrestricted: Boolean(t.global),
    access_model: 'assignments',
    super_admin_shortfall: 0,
  };
}

const pair = (now: number | null, last: number | null = null) => ({ now, last_week: last });
const ROW: CityRow = {
  code: CITY.code, name: CITY.name, status: 'active', country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata',
  window: { key: '24h', start: '2026-10-27T01:30:00Z', end: '2026-10-28T01:30:00Z', last_week_start: '', last_week_end: '' },
  trips: { requested: pair(10, 5), accepted: pair(7, 4), completed: pair(6, 4), cancelled: pair(3, 1), unfulfilled: pair(2, 1) },
  rates: { unfulfilled_rate: pair(20, 20), acceptance_rate: pair(70, 80), avg_eta_minutes: pair(10, 6) },
  money: { collected: { INR: { now_minor: 210_000, last_week_minor: 40_000 } },
    withdrawals_pending_sum: { INR: { now_minor: 5_000, last_week_minor: null } } },
  drivers: { online_now: pair(1), online_source: 'db', active: pair(1, 1) },
  riders: { active_24h: pair(2, 1) },
  queues: {
    sos_open: pair(1), sos_oldest_open_minutes: 10, sos_raised: pair(1, 0),
    tickets_open: pair(1), tickets_raised: pair(1, 0),
    withdrawals_pending: pair(1), withdrawals_oldest_pending_hours: 60, withdrawals_requested: pair(1, 0),
    kyc_awaiting: pair(3), alerts_open: pair(2),
  },
};

const NAV = {
  super_admin: ['/dashboard', '/live-ops', '/trips', '/drivers', '/riders', '/support', '/finance', '/finance/payouts', '/pricing', '/safety-ops', '/zones', '/settings/security'],
  city_ops_manager: ['/dashboard', '/live-ops', '/trips', '/drivers', '/riders', '/support', '/pricing', '/safety-ops', '/zones', '/settings/security'],
  support_agent: ['/dashboard', '/trips', '/drivers', '/riders', '/support', '/settings/security'],
  support_lead: ['/dashboard', '/trips', '/drivers', '/riders', '/support', '/settings/security'],
  safety_officer: ['/dashboard', '/live-ops', '/trips', '/drivers', '/riders', '/support', '/safety-ops', '/settings/security'],
  kyc_verifier: ['/drivers', '/settings/security'],
  finance: ['/dashboard', '/trips', '/drivers', '/riders', '/support', '/finance', '/finance/payouts', '/pricing', '/settings/security'],
  // Owner ruling 4: Marketing keeps the Command Centre (aggregates only).
  marketing: ['/dashboard', '/live-ops', '/settings/security'],
  analyst: ['/dashboard', '/live-ops', '/trips', '/drivers', '/riders', '/pricing', '/settings/security'],
} as const;

/** Every destination on the city board (a tile or a queue), without the city query. */
const BOARD = {
  super_admin: ['/trips', '/trips?status=completed', '/trips?status=cancelled', '/drivers?status=online', '/finance/payouts',
    '/safety-ops', '/support', '/drivers?approved=false'],
  city_ops_manager: ['/trips', '/trips?status=completed', '/trips?status=cancelled', '/drivers?status=online',
    '/safety-ops', '/support', '/drivers?approved=false'],
  support_agent: ['/trips', '/trips?status=completed', '/trips?status=cancelled', '/drivers?status=online',
    '/support', '/drivers?approved=false'],
  support_lead: ['/trips', '/trips?status=completed', '/trips?status=cancelled', '/drivers?status=online',
    '/support', '/drivers?approved=false'],
  safety_officer: ['/trips', '/trips?status=completed', '/trips?status=cancelled', '/drivers?status=online',
    '/safety-ops', '/support', '/drivers?approved=false'],
  kyc_verifier: ['/drivers?status=online', '/drivers?approved=false'],
  finance: ['/trips', '/trips?status=completed', '/trips?status=cancelled', '/drivers?status=online', '/finance/payouts',
    '/support', '/drivers?approved=false'],
  marketing: [],
  analyst: ['/trips', '/trips?status=completed', '/trips?status=cancelled', '/drivers?status=online',
    '/drivers?approved=false'],
} as const;

const strip = (href: string) => href.replace(/[?&]scope=[^&]*/, '').replace(/\?$/, '');
const hrefs = (root: ParentNode, selector = 'a[href]') =>
  [...root.querySelectorAll<HTMLAnchorElement>(selector)].map((a) => strip(a.getAttribute('href') ?? ''));

describe('the link rule, by role template', () => {
  it('covers every role template', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(Object.keys(NAV).sort());
    expect(Object.keys(TEMPLATES).sort()).toEqual(Object.keys(BOARD).sort());
  });

  describe.each(Object.keys(TEMPLATES))('%s', (role) => {
    it('draws exactly its nav items', () => {
      const access = accessFor(role);
      const groups = visibleGroups(access, NAV_GROUPS);
      const { container } = render(
        <Sidebar groups={groups} counts={{ sos: 2, drivers: 3, support: 4, withdrawals: 5 }}
          collapsed={false} onToggle={() => undefined} isCurrent={() => false} home={homeFor(groups)} />,
      );
      const nav = hrefs(container.querySelector('nav') as HTMLElement);
      expect(nav).toEqual([...NAV[role as keyof typeof NAV]]);
      // The brand mark goes to a page they can open.
      expect(NAV[role as keyof typeof NAV]).toContain(hrefs(container, 'a.ops__brand')[0]);
    });

    it('draws exactly its board links, and no count whose page is closed to it', () => {
      current = accessFor(role);
      const { container } = render(<CityBoard row={ROW} access={current} single />);
      // A destination may be linked by more than one tile (Completed and Collected).
      const found = [...new Set(hrefs(container))].sort();
      expect(found).toEqual([...BOARD[role as keyof typeof BOARD]].sort());
      // A queue that is not drawn is not counted either.
      const text = container.textContent ?? '';
      const t = TEMPLATES[role].permissions;
      expect(text.includes('SOS open')).toBe(t.includes('safety.read') || t.includes('safety.respond'));
      expect(text.includes('Withdrawals pending')).toBe(t.includes('finance.read'));
      expect(text.includes('Tickets open')).toBe(t.includes('support.read'));
      expect(text.includes('KYC awaiting review')).toBe(t.includes('driver.read'));
    });

    it('draws the header badges only for pages it can open', () => {
      current = accessFor(role);
      const { container } = render(
        <TopBar access={current} operator={null} sosOpen={2} inboxUnread={1} theme="light"
          onTheme={() => undefined} onSignOut={() => undefined} />,
      );
      const t = TEMPLATES[role].permissions;
      const found = hrefs(container).sort();
      const want = [
        ...(t.includes('support.read') ? ['/support/inbox'] : []),
        ...(t.includes('safety.read') || t.includes('safety.respond') ? ['/safety-ops'] : []),
      ].sort();
      expect(found).toEqual(want);
    });
  });

  it('a role held at another city draws no link on this city board', () => {
    const access = accessFor('safety_officer');
    access.roles = [{ ...access.roles[0], scope: 'US-TX-AUS', scope_path: '/US/US-TX/US-TX-AUS/' }];
    const { container } = render(<CityBoard row={ROW} access={access} single />);
    expect(hrefs(container)).toEqual([]);
    expect(container.textContent).not.toContain('SOS open');
  });

  it('unknown access draws no link at all', () => {
    const { container } = render(<CityBoard row={ROW} access={null} single />);
    expect(hrefs(container)).toEqual([]);
    expect(visibleGroups(null, NAV_GROUPS).flatMap((g) => g.items.map((i) => i.href)))
      .toEqual(['/settings/security']);
  });
});
