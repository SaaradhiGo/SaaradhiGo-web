import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '2231' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/ops/drivers/2231',
}));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));
vi.mock('@/lib/adminScope', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/adminScope')>();
  const access = {
    id: 1, email: 'ops@example.test', full_name: 'Ops', is_superuser: false, is_break_glass: false,
    permissions: ['trip.read', 'driver.read', 'support.read', 'safety.read'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const DETAIL = {
  id: 2231, status: 'online', approved: true, ratings: '4.42', total_trips: 812, license_expiry: '2027-01-01',
  upi_id: null, user: { id: 9, phone_number: '+91 3210', full_name: 'Ravi Kumar', email: null, is_active: true },
  vehicles: [], cancellations: { last_24h: 0, last_7d: 2, last_30d: 5 }, recent_trips: [],
  earnings: { lifetime: '1,000.00', today: '0.00', this_month: '200.00', wallet_balance: '50.00', currency: 'INR' },
  kyc_state: 'approved', documents: [], status_history: [],
  audit_trail: [{ id: 1, action: 'driver_approved', created_at: '2026-01-05T10:00:00Z', reason: 'Documents fine', created_by: { label: 'Asha' } }],
};

describe('driver record page', () => {
  it('shows the ref and moves between tabs', async () => {
    render(<Page />);
    expect(await screen.findByText('D-2231')).toBeTruthy();
    expect(screen.queryByText('Wallet')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Money' }));
    expect(screen.getByText('Wallet')).toBeTruthy();
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: DETAIL }) })));
});
afterEach(() => cleanup());
