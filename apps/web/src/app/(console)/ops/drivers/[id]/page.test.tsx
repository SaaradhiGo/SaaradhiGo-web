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
  id: 2231, ref: 'D-HYD-7K3Q', status: 'online', approved: true, ratings: '4.42', total_trips: 812, license_expiry: '2027-01-01',
  upi_id: null, user: { id: 9, phone_number: '+91 3210', full_name: 'Ravi Kumar', email: null, is_active: true },
  vehicles: [], cancellations: { last_24h: 0, last_7d: 2, last_30d: 5 }, recent_trips: [],
  earnings: { lifetime: '1,000.00', today: '0.00', this_month: '200.00', wallet_balance: '50.00', currency: 'INR' },
  kyc_state: 'approved', documents: [], status_history: [],
  ratings_summary: { average: '4.42', count: 12, low: 2, distribution: { 5: 8, 4: 2, 3: 0, 2: 1, 1: 1 } },
  withdrawals: [{ id: 3, ref: 'WD-HYD-4K2M', amount: '1500.00', status: 'processed', payout_method: 'upi', requested_at: '2026-11-20T10:00:00Z', processed_at: null, payout_status: null, failure_count: 0 }],
  audit_trail: [{ id: 1, action: 'driver_approved', created_at: '2026-01-05T10:00:00Z', reason: 'Documents fine', created_by: { label: 'Asha' } }],
};

describe('driver record page', () => {
  it('shows the ref and moves between tabs', async () => {
    render(<Page />);
    expect(await screen.findByText('D-HYD-7K3Q')).toBeTruthy();
    expect(screen.queryByText('Wallet')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Money' }));
    expect(screen.getByText('Wallet')).toBeTruthy();
  });

  it('shows recent payouts and the ratings', async () => {
    render(<Page />);
    await screen.findByText('D-HYD-7K3Q');
    expect(screen.getByText('4.42 from 12 ratings')).toBeTruthy();
    expect(screen.getByText(/2 trips rated 1 or 2 stars/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Money' }));
    expect(screen.getByText('WD-HYD-4K2M')).toBeTruthy();
    expect(screen.getByText('₹1500.00')).toBeTruthy();
    expect(screen.getByText('processed')).toBeTruthy();
  });

  it('hides add vehicle and payout details from a read-only operator', async () => {
    render(<Page />);
    await screen.findByText('D-HYD-7K3Q');
    expect(screen.queryByRole('button', { name: 'Add vehicle…' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Money' }));
    expect(screen.queryByRole('button', { name: 'Change payout details…' })).toBeNull();
  });

  it('adds a vehicle as inactive', async () => {
    const fetchMock = stub(WRITER, { vehicle_id: 88, status: 'inactive' });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add vehicle…' }));
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'sedan' } });
    fireEvent.change(screen.getByLabelText('Plate'), { target: { value: 'TS 09 AB 1234' } });
    fireEvent.change(screen.getByLabelText(/Why you are adding it/), { target: { value: 'Driver bought a new car' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }));
    expect((await screen.findAllByText(/Added TS 09 AB 1234 as inactive/)).length).toBeGreaterThan(0);
    const post = fetchMock.mock.calls.find(([u, i]) => String(u).includes('/vehicles/add/') && i?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ vehicle_type: 'sedan', vehicle_number: 'TS 09 AB 1234' });
  });

  it('sends new bank details for approval and does not keep the number on screen', async () => {
    stub(WRITER, { approval_request: { id: 5, ref: 'APR-IN-7Q2K', status: 'requested' } });
    render(<Page />);
    await screen.findByText('D-HYD-7K3Q');
    fireEvent.click(screen.getByRole('tab', { name: 'Money' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change payout details…' }));
    fireEvent.change(screen.getByLabelText('Account holder name'), { target: { value: 'Ravi Kumar' } });
    fireEvent.change(screen.getByLabelText('Account number'), { target: { value: '123456789012' } });
    fireEvent.change(screen.getByLabelText('Account number again'), { target: { value: '123456789019' } });
    expect(screen.getByText('The two account numbers differ.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Account number again'), { target: { value: '123456789012' } });
    fireEvent.change(screen.getByLabelText('IFSC'), { target: { value: 'hdfc0001234' } });
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'Driver called: card lost' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect((await screen.findAllByText(/Sent for approval as APR-IN-7Q2K/)).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('123456789012');
  });

  it('offers no payout change for a US driver', async () => {
    stub({ ...WRITER, home_city: { code: 'US-ID-TV', name: 'Treasure Valley', timezone: 'America/Boise' } }, {});
    render(<Page />);
    await screen.findByText('D-HYD-7K3Q');
    expect(screen.getByRole('button', { name: 'Add vehicle…' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Money' }));
    expect(screen.queryByRole('button', { name: 'Change payout details…' })).toBeNull();
  });
});

const WRITER = {
  ...DETAIL, home_city: { code: 'IN-TG-HYD', name: 'Hyderabad', timezone: 'Asia/Kolkata' },
  actions: { review_documents: false, approve: false, approve_blocked: false, suspend: false, reinstate: false, note: false, vehicles: true, deactivate: false, reveal: false },
};

function stub(detail: unknown, written: unknown) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === 'POST'
    ? { ok: true, status: 201, json: async () => ({ status: 'success', data: written }) }
    : { ok: true, status: 200, json: async () => ({ status: 'success', data: detail }) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = 'sg-staff-in=1; path=/';
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: DETAIL }) })));
});
afterEach(() => cleanup());
