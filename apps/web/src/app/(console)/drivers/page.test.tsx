/**
 * Drivers on the list + record pattern (board B).
 *
 * `fetch` is routed by URL, so what is asserted is what leaves the browser
 * (each view's count is the list endpoint with that view's filters and
 * page_size=1; a column header asks the SERVER to sort) and what the operator
 * sees: the counts beside the views, the driver opening beside the list on
 * Enter, its tabs, its quick actions from the server's answer, and Escape
 * closing it.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import DriversPage from './page';

const push = vi.fn();
let query = '';
// Next hands back the same object until the URL changes; so does this stub.
let params = new URLSearchParams('');
const router = { replace: vi.fn(), push, prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => (params.toString() === query ? params : (params = new URLSearchParams(query))),
  usePathname: () => '/drivers',
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
    permissions: ['driver.read', 'driver.write'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const ROW = {
  id: 2231, user_details: { full_name: 'Ravi Kumar', phone_number: '+91••••••3210' }, status: 'online',
  online: true, kyc_state: 'approved', ratings: '4.42', total_trips: 812,
  home_city: { code: 'IN-TG-HYD', name: 'Hyderabad', timezone: 'Asia/Kolkata' }, joined_at: '2026-01-04T10:00:00Z',
};
const DETAIL = {
  id: 2231, status: 'online', approved: true, ratings: '4.42', total_trips: 812, license_expiry: '2027-01-01',
  upi_id: null, user: { id: 9, phone_number: '+91••••••3210', full_name: 'Ravi Kumar', email: null, is_active: true },
  vehicles: [], cancellations: { last_24h: 0, last_7d: 2, last_30d: 5 }, recent_trips: [],
  earnings: { lifetime: '1,000.00', today: '0.00', this_month: '200.00', wallet_balance: '50.00', currency: 'INR' },
  home_city: ROW.home_city, kyc_state: 'approved', documents: [],
  status_history: [{ id: 1, action: 'driver_approved', created_at: '2026-01-05T10:00:00Z', reason: 'Documents fine', created_by: { label: 'Asha' } }],
  audit_trail: [],
  actions: { review_documents: false, approve: false, approve_blocked: false, suspend: true, reinstate: false, note: true, vehicles: false, deactivate: false, reveal: false },
};

function routeFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    const u = new URL(url, "http://x");
    let data: unknown;
    if (u.pathname.endsWith('/driver/admin/2231/full/')) data = DETAIL;
    else if (u.searchParams.get('page_size') === '1') {
      data = { count: u.searchParams.get('online') ? 7 : u.searchParams.get('suspended') ? 3 : 40, page: 1, total_pages: 1, results: [] };
    } else data = { count: 1, page: 1, total_pages: 1, results: [ROW] };
    return { ok: true, status: 200, json: async () => ({ status: 'success', data }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  query = '';
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
});
afterEach(() => cleanup());

describe('drivers list', () => {
  it('shows each view with the server count from a page_size=1 call', async () => {
    const fetchMock = routeFetch();
    render(<DriversPage />);
    const tabs = await screen.findByRole('tablist', { name: 'Saved views' });
    await waitFor(() => expect(within(tabs).getByRole('tab', { name: /Online now 7/ })).toBeTruthy());
    expect(within(tabs).getByRole('tab', { name: /Suspended 3/ })).toBeTruthy();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/driver/admin/?') && u.includes('online=true') && u.includes('page_size=1'))).toBe(true);
    expect(urls.some((u) => u.includes('/driver/admin/kyc-queue/') && u.includes('page_size=1'))).toBe(true);
    expect(await screen.findByText('D-2231')).toBeTruthy();
  });

  it('sorts on the server from a column header', async () => {
    routeFetch();
    render(<DriversPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rating' }));
    expect(push).toHaveBeenCalledWith('/drivers?ordering=rating');
  });

  it('switching view puts the view filter in the URL', async () => {
    routeFetch();
    render(<DriversPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /Low rating/ }));
    expect(push).toHaveBeenCalledWith('/drivers?low_rating=true');
  });
});

describe('driver record', () => {
  it('opens beside the list on Enter with the server’s actions, and Escape closes it', async () => {
    routeFetch();
    render(<DriversPage />);
    const cell = await screen.findByText('D-2231', {}, { timeout: 5000 });
    const row = cell.closest('tr') as HTMLElement;
    fireEvent.keyDown(row, { key: 'Enter' });
    await screen.findByRole('button', { name: 'Suspend…' }, { timeout: 5000 });
    const record = screen.getByRole('complementary', { name: 'Driver' });
    expect(within(record).getByRole('button', { name: 'Add note…' })).toBeTruthy();
    expect(within(record).queryByRole('button', { name: 'Reinstate…' })).toBeNull();
    ['Overview', 'Trips', 'Money', 'Documents', 'Support', 'History'].forEach((t) => {
      expect(within(record).getByRole('tab', { name: t })).toBeTruthy();
    });
    fireEvent.click(within(record).getByRole('tab', { name: 'History' }));
    expect(within(record).getByText(/driver approved/)).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Driver' })).toBeNull(), { timeout: 5000 });
  });
});
