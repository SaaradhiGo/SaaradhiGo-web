/** Group 2 polish: lead tiles, the quiet Super Admin chip, approved-driver caveats. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import type { CityRow } from '@/lib/commandCentre';
import { approvedCaveats } from '@/lib/drivers';
import { CityBoard } from './CityBoard';
import { SuperAdminChip } from './SuperAdminBanner';

let path = '/trips';
vi.mock('next/navigation', () => ({ usePathname: () => path, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) => <a href={href} {...rest}>{children}</a>,
}));
afterEach(cleanup);

const perms = ['driver.read', 'finance.read', 'safety.respond', 'safety.read', 'approval.check', 'trip.read'];
const access = (shortfall = 0): AdminAccess => ({
  id: 1, email: 'a@b.test', full_name: 'A', is_superuser: false, is_break_glass: false, permissions: perms,
  roles: [{ role: 'x', role_name: 'x', scope: 'GLOBAL', scope_name: '', scope_kind: 'global', scope_path: '/GLOBAL/', permissions: perms }],
  scopes: [], unrestricted: true, access_model: 'assignments', super_admin_shortfall: shortfall,
}) as AdminAccess;

const pair = (now: number | null) => ({ now, last_week: null });
const ROW = {
  code: 'IN-TG-HYD', name: 'Hyderabad', status: 'active', country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata',
  window: { key: 'today', start: '2026-10-27T01:30:00Z', end: '2026-10-28T01:30:00Z', last_week_start: '', last_week_end: '' },
  trips: { requested: pair(1), accepted: pair(1), completed: pair(1), cancelled: pair(0), unfulfilled: pair(0) },
  rates: { unfulfilled_rate: pair(0), acceptance_rate: pair(90), avg_eta_minutes: pair(4) },
  money: null,
  drivers: { online_now: pair(1), online_source: 'db', active: pair(1) },
  riders: { active_24h: pair(1) },
  queues: { sos_open: pair(2), sos_oldest_open_minutes: 5, tickets_open: pair(0), tickets_raised: pair(0),
    withdrawals_pending: pair(3), withdrawals_oldest_pending_hours: 4, kyc_awaiting: pair(7), alerts_open: pair(0) },
} as unknown as CityRow;

describe('Command Centre lead tiles', () => {
  it('lead with the four action tiles, each linked to its filtered list', () => {
    const { container } = render(<CityBoard row={ROW} access={access()} single approvalsWaiting={5} />);
    const lead = container.querySelector('.ops-tiles--lead') as HTMLElement;
    const hrefs = [...lead.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/safety-ops?scope=IN-TG-HYD', '/approvals', '/finance/payouts?status=pending&scope=IN-TG-HYD', '/kyc?scope=IN-TG-HYD',
    ]);
    expect(container.querySelector('.ops-tiles--dense')).not.toBeNull();
  });
  it('draws no approvals tile without the permission', () => {
    const a = { ...access(), permissions: ['trip.read'], roles: [] } as AdminAccess;
    render(<CityBoard row={ROW} access={a} single approvalsWaiting={5} />);
    expect(screen.queryByText('Approvals waiting for you')).toBeNull();
  });
});

describe('Super Admin chip', () => {
  it('is quiet on other pages and absent on the dashboard', () => {
    path = '/trips';
    const { unmount } = render(<SuperAdminChip access={access(1)} />);
    expect(screen.getByText('1 more Super Admin needed')).toBeTruthy();
    unmount();
    path = '/dashboard';
    render(<SuperAdminChip access={access(1)} />);
    expect(screen.queryByText(/Super Admin/)).toBeNull();
  });
});

describe('approved driver caveats', () => {
  const ok = { kyc_state: 'approved', documents: [{ review_state: 'approved' }], vehicles: [{ is_active_vehicle: true }] };
  it('says nothing when all is in order, or when not approved', () => {
    expect(approvedCaveats(ok)).toEqual([]);
    expect(approvedCaveats({ ...ok, kyc_state: 'pending', vehicles: [] })).toEqual([]);
  });
  it('flags outstanding documents and a missing vehicle', () => {
    expect(approvedCaveats({ ...ok, documents: [{ review_state: 'not_reviewed' }] })).toEqual(['Documents outstanding']);
    expect(approvedCaveats({ ...ok, vehicles: [{ is_active_vehicle: false }] })).toEqual(['No vehicle']);
    expect(approvedCaveats({ kyc_state: 'approved', vehicle_number: null })).toEqual(['No vehicle']);
    expect(approvedCaveats({ ...ok, approval_blockers: [{}] })).toEqual(['Documents outstanding']);
  });
});
