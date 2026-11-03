/**
 * Approvals on the list + record pattern (board B).
 *
 * A deep link (`?id=`) opens that request beside the list; the decision
 * buttons are drawn from the server's per-request answer (`can_decide`,
 * `cannot_decide_reason`, `blockers`); rejecting needs a reason; approving
 * posts to the request's own endpoint.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import ApprovalsPage from './page';

let query = '';
let params = new URLSearchParams('');
const router = { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => (params.toString() === query ? params : (params = new URLSearchParams(query))),
  usePathname: () => '/approvals',
}));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

const REQUEST = {
  id: 7, ref: 'APR-7', title: 'Release a driver payout', action_key: 'finance.payout', country: 'IN',
  scope: 'IN-TG-HYD', amount: 125050, currency: 'INR', target_type: 'withdrawal', target_id: '31',
  request_reason: 'Weekly payout', maker: { id: 2, email: 'maker@example.test', label: 'Maker', role: 'finance' },
  checker: null, status: 'requested', requested_at: '2026-11-03T04:00:00Z', expires_at: null, decided_at: null,
  decision_reason: '', error: '',
  subjects: [{ ref: 'PO-31', withdrawal_id: 31, driver_id: 18, driver_ref: 'D-18', driver_name: 'Ravi Kumar', amount_minor: 125050, currency: 'INR', status: 'pending' }],
  blockers: [], can_decide: true, cannot_decide_reason: null, can_cancel: false,
};

function routeFetch(detail: Record<string, unknown> = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, 'http://x');
    let data: unknown;
    if (init?.method === 'POST') data = { ...REQUEST, ...detail, status: 'executed' };
    else if (u.pathname.endsWith('/approvals/admin/requests/7/')) data = { ...REQUEST, ...detail };
    else data = { count: 1, results: [{ ...REQUEST, ...detail }] };
    return { ok: true, status: 200, json: async () => ({ status: 'success', data }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  query = 'id=7';
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
});
afterEach(() => cleanup());

describe('approvals', () => {
  it('opens the deep-linked request with exact amounts and what it releases', async () => {
    routeFetch();
    render(<ApprovalsPage />);
    await screen.findByRole('button', { name: 'Approve' });
    const record = screen.getByRole('complementary', { name: 'Approval request' });
    expect(within(record).getAllByText('APR-7').length).toBeGreaterThan(0);
    expect(within(record).getByText('₹1,250.50')).toBeTruthy();
    fireEvent.click(within(record).getByRole('tab', { name: 'What this releases' }));
    expect(within(record).getByText('PO-31')).toBeTruthy();
  });

  it('asks for a reason before rejecting, and approves through the request endpoint', async () => {
    const fetchMock = routeFetch();
    render(<ApprovalsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(await screen.findByText(/Say why you are rejecting it/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/approvals/admin/requests/7/approve/'))).toBe(true));
    expect(await screen.findByText('APR-7 approved.')).toBeTruthy();
  });

  it('draws no decision for someone the server says may not decide, and says why', async () => {
    routeFetch({ can_decide: false, cannot_decide_reason: 'You raised this request.' });
    render(<ApprovalsPage />);
    expect(await screen.findByText('You raised this request.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('cannot approve a blocked request', async () => {
    routeFetch({ blockers: ['No payout details on file for D-18'] });
    render(<ApprovalsPage />);
    const approve = await screen.findByRole('button', { name: 'Approve' });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
  });
});
