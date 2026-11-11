import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '9' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/finance/drivers/9/ledger',
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
    permissions: ['finance.read', 'driver.read'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const LEDGER = {
  driver: { id: 9, driver_name: 'Suresh R.', home_city: { code: 'IN-TG-HYD', name: 'Hyderabad' } },
  range: { from: '2026-01-01', to: '2026-01-07', timezone: 'Asia/Kolkata' }, has_wallet: true, currency: 'INR',
  opening_minor: 0, credits_minor: 50000, debits_minor: 0, closing_minor: 50000, balance_minor: 50000, unexplained_minor: 0,
  entries: { count: 1, page: 1, page_size: 50, results: [{
    id: 1, at: '2026-01-02T10:00:00Z', kind: 'credit', purpose: 'trip_earning', label: 'Trip earning', direction: 'credit',
    amount_minor: 50000, currency: 'INR', running_balance_minor: 50000, status: 'completed', trip_id: null, withdrawal_id: null }] },
  memo: [{ id: 'm1', at: '2026-01-03T10:00:00Z', kind: 'payout_pending', amount_minor: 1000, currency: 'INR', note: 'weekly run' }],
};
const respond = (_url: string) => LEDGER;

describe('driver ledger page', () => {
  it('shows the driver and D-ref in the header and the statement in the main tab', async () => {
    render(<Page />);
    expect(await screen.findByText('D-9')).toBeTruthy();
    expect(screen.getAllByText('Suresh R.').length).toBeGreaterThan(0);
    expect(await screen.findByText('Trip earning')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Memo/ }));
    expect(screen.getByText('weekly run')).toBeTruthy();
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: respond(String(url)) }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
