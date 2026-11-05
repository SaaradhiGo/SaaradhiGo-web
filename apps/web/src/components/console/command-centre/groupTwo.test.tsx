/** Group 2 polish: Overview lead tiles, the quiet Super Admin chip, approved-driver caveats. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import { approvedCaveats } from '@/lib/drivers';
import { ActionTiles } from '@/components/console/kit/ActionTiles';
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

vi.mock('@/lib/consoleQueues', async (orig) => ({
  ...(await orig<typeof import('@/lib/consoleQueues')>()),
  fetchQueueCounts: async () => ({ driversAwaiting: 7, withdrawalsPending: 3, supportOpen: 0, sosOpen: 2, approvalsWaiting: 5 }),
}));

describe('Overview lead tiles', () => {
  it('lead with the four action tiles, each linked to its filtered list', async () => {
    const { container } = render(<ActionTiles access={access()} />);
    await screen.findByText('7');
    const lead = container.querySelector('.ops-tiles--lead') as HTMLElement;
    expect([...lead.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/safety-ops', '/approvals', '/finance/payouts?status=pending', '/kyc',
    ]);
  });
  it('draws nothing the operator cannot open', () => {
    const a = { ...access(), permissions: ['trip.read'], roles: [] } as AdminAccess;
    const { container } = render(<ActionTiles access={a} />);
    expect(container.querySelector('a')).toBeNull();
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
