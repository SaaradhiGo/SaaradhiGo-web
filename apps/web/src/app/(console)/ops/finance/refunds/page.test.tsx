import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import RefundsPage from './page';

let query = '';
let params = new URLSearchParams('');
const router = { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => (params.toString() === query ? params : (params = new URLSearchParams(query))),
  usePathname: () => '/ops/finance/refunds',
}));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));
vi.mock('@/components/console/PageLink', () => ({
  PageLink: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const ROW = {
  id: 5, source: 'ledger', trip_id: 42, amount_minor: 25000, currency: 'INR', method: 'wallet',
  method_label: 'To wallet', status: 'completed', reason: 'Driver late', city: { code: 'HYD', name: 'Hyderabad' },
  created_at: '2026-11-03T04:00:00Z', created_by: 'maker@example.test', approval_request_id: null,
};
const PAGE = {
  count: 1, page: 1, page_size: 25, total_pages: 1, view: 'all', counts: { waiting: 2, pending_gateway: 1 },
  totals: [{ currency: 'INR', count: 3, amount_minor: 75000 }, { currency: 'USD', count: 1, amount_minor: 1500 }],
  results: [ROW],
};

function stubFetch() {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: PAGE }) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  query = '';
  router.push.mockClear();
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
});
afterEach(() => cleanup());

describe('finance refunds', () => {
  it('renders a row with the trip link and the status chip', async () => {
    stubFetch();
    render(<RefundsPage />);
    const link = await screen.findByRole('link', { name: 'T-42' });
    expect(link.getAttribute('href')).toBe('/ops/trips/42');
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('To wallet')).toBeTruthy();
  });

  it('asks for view=waiting on the waiting view and routes the tab there', async () => {
    query = 'status=waiting';
    const fetchMock = stubFetch();
    render(<RefundsPage />);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String((c as unknown[])[0]).includes('view=waiting'))).toBe(true));
    fireEvent.click(await screen.findByRole('tab', { name: /Not yet sent to provider/ }));
    expect(router.push).toHaveBeenCalledWith('/ops/finance/refunds?status=pending_gateway');
  });

  it('shows each currency total on its own', async () => {
    stubFetch();
    render(<RefundsPage />);
    expect(await screen.findByText(/over 3 refunds/)).toBeTruthy();
    expect(screen.getByText(/over 1 refund$/)).toBeTruthy();
  });
});
