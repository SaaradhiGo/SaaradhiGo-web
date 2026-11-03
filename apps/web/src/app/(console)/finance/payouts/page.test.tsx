/**
 * Releasing a payout as the sole Super Admin (owner, 2026-11-03).
 *
 * After "Ask to release", when the server says the new request can be
 * self-approved, the same drawer offers "Approve now" with a required reason,
 * so a release takes three clicks. When it cannot, the drawer closes on the
 * usual "sent for approval" notice.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import { TOKEN_KEY } from '@/lib/api';
import PayoutsPage from './page';

const router = { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() };
const params = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => params,
  usePathname: () => '/finance/payouts',
}));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));
const ACCESS = { permissions: ['finance.read', 'finance.payout', 'report.read'], roles: [], scopes: [], access_model: 'assignments' } as unknown as AdminAccess;
vi.mock('@/lib/adminScope', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/adminScope')>();
  return { ...original, useAdminAccess: () => ACCESS, withScope: (p: string) => p };
});

const ROW = {
  id: 31, driver_id: 18, driver_name: 'Ravi Kumar', city: { code: 'IN-TG-HYD', name: 'Hyderabad' },
  amount_minor: 125050, currency: 'INR', status: 'pending', status_label: 'Waiting', payout_method: 'upi',
  upi_id: 'r***@upi', bank_account: null, payout_reference: null, failure_count: 0, failure_reason: null,
  requested_at: '2026-11-03T04:00:00Z', processed_at: null, age_seconds: 600,
};

function routeFetch(request: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://x').pathname;
    let data: unknown = { count: 0, results: [] };
    if (init?.method === 'POST' && path.endsWith('/payouts/31/approve/')) {
      data = { approval_request: { id: 9, status: 'requested' } };
    } else if (init?.method === 'POST' && path.endsWith('/approvals/admin/requests/9/approve/')) {
      data = { ...request, status: 'executed' };
    } else if (path.endsWith('/approvals/admin/requests/9/')) {
      data = request;
    } else if (path.endsWith('/payments/admin/payouts/31/')) {
      data = { ...ROW, transactions: [], history: [], driver_phone: '' };
    } else if (path.endsWith('/payments/admin/payouts/')) {
      data = { count: 1, results: [ROW], tabs: [] };
    }
    return { ok: true, status: 200, json: async () => ({ status: 'success', data }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function askToRelease() {
  render(<PayoutsPage />);
  fireEvent.click(await screen.findByText('PO-31'));
  const record = await screen.findByRole('complementary', { name: 'Payout' });
  fireEvent.click(within(record).getByRole('button', { name: 'Ask to release…' }));
  fireEvent.click(within(record).getByRole('button', { name: /^Ask to release ₹/ }));
  return record;
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('payout release by the sole Super Admin', () => {
  it('offers Approve now, needs a reason, and releases through the request', async () => {
    const fetchMock = routeFetch({ id: 9, status: 'requested', can_decide: true, self_approval: true, blockers: [] });
    const record = await askToRelease();
    const approveNow = await within(record).findByRole('button', { name: 'Approve now' });
    expect(within(record).getByText(/recorded as self-approved/)).toBeTruthy();
    expect((approveNow as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(record).getByLabelText('Reason (required)'), { target: { value: 'Weekly payout, checked.' } });
    expect((approveNow as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(approveNow);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/approvals/admin/requests/9/approve/'));
      expect(call).toBeTruthy();
      expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({ reason: 'Weekly payout, checked.' });
    });
    expect(await screen.findByText(/Recorded as self-approved \(APR-9\)/)).toBeTruthy();
  });

  it('closes on "sent for approval" when the request cannot be self-approved', async () => {
    routeFetch({ id: 9, status: 'requested', can_decide: false, self_approval: false, blockers: [] });
    await askToRelease();
    expect(await screen.findByText(/Nothing is released until a second finance admin decides it/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve now' })).toBeNull();
  });

  it('does not offer Approve now for a blocked request', async () => {
    routeFetch({ id: 9, status: 'requested', can_decide: true, self_approval: true, blockers: ['No payout details on file for D-18'] });
    await askToRelease();
    expect(await screen.findByText(/Nothing is released until a second finance admin decides it/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve now' })).toBeNull();
  });
});
