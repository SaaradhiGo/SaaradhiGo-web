import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

const nav = vi.hoisted(() => ({ search: new URLSearchParams(''), permissions: ['finance.read', 'finance.adjust'] }));
vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => nav.search,
  usePathname: () => '/ops/finance/reconciliation',
}));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));
vi.mock('@/lib/adminScope', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/adminScope')>();
  const access = () => ({
    id: 1, email: 'ops@example.test', full_name: 'Ops', is_superuser: false, is_break_glass: false,
    permissions: nav.permissions, roles: [], scopes: [], access_model: 'scoped',
  });
  return { ...actual, useAdminAccess: access, getCachedAccess: access };
});

const OVERVIEW = {
  count: 0, page: 1, total_pages: 1, results: [], statement_import: { connected: true, message: null },
  kinds: [], open_by_kind: {}, open_total: 0, stuck_payout_check: [],
};
const ITEMS = { count: 0, page: 1, total_pages: 1, results: [] };

function stub() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ status: 'success', data: {
        country: 'IN', date: '2026-11-20', runs: [{ gateway: 'razorpay', status: 'issues', counts: { payment_missing_webhook: 2 } }],
      } }) };
    }
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: String(url).includes('/items/') ? ITEMS : OVERVIEW }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('reconciliation', () => {
  it('runs a finished day again and reloads the findings', async () => {
    const fetchMock = stub();
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Run a day again…' }));
    fireEvent.change(screen.getByLabelText(/^Day/), { target: { value: '20 Nov 2026' } });
    const run = screen.getByRole('button', { name: 'Run it again' }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'Late webhook from Razorpay' } });
    const gets = fetchMock.mock.calls.length;
    fireEvent.click(run);
    expect(await screen.findByText(/was run again/)).toBeTruthy();
    expect(screen.getByText(/2 findings/)).toBeTruthy();
    const post = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
    expect(String(post?.[0])).toContain('/payments/admin/reconciliation/rerun/');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ country: 'IN', date: '2026-11-20', reason: 'Late webhook from Razorpay' });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(gets + 1));
  });

  it('is not offered without finance.adjust', async () => {
    nav.permissions = ['finance.read'];
    stub();
    render(<Page />);
    await screen.findByText('Recent runs');
    expect(screen.queryByRole('button', { name: 'Run a day again…' })).toBeNull();
  });
});

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = 'sg-staff-in=1; path=/';
  nav.permissions = ['finance.read', 'finance.adjust'];
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
