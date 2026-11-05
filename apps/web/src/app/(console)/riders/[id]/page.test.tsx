import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '77' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/riders/77',
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
    permissions: ['rider.read', 'trip.read', 'support.read'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const DETAIL = {
  id: 77, user_details: { id: 3, full_name: 'Asha Rao', phone_number: '+91 9999', email: null, is_active: true },
  city: { code: 'IN-TG-HYD', name: 'Hyderabad', timezone: 'Asia/Kolkata' }, joined_at: '2026-01-01T00:00:00Z', last_trip_at: null,
  blocked: false, flagged: false, block: { active: false }, flags: [],
  wallet: { balances: [{ currency: 'INR', balance_minor: 25000 }], transactions: {}, rows_per_currency: 20 },
  trips: { total: 0, by_status: {}, recent: [] }, tickets: { total: 0, open: 0, recent: [] }, sos: { total: 0, open: 0, recent: [] },
  ratings_summary: { rating: '4.50', rating_count: 2, low_rating: false, soft_blocked: false,
    given: { count: 0, average: null }, received: { count: 0, average: null, distribution: {} } },
  saved_places_count: 1, sessions: { active_sessions: 1, push_device: false },
  status_history: [], notes: [], approval_requests: [],
  audit_trail: [{ id: 1, action: 'rider_flagged', created_at: '2026-01-05T10:00:00Z', reason: 'Chargebacks', created_by: { label: 'Asha' } }],
};
const respond = (_url: string) => DETAIL;

describe('rider record page', () => {
  it('shows the ref and moves between tabs', async () => {
    render(<Page />);
    expect(await screen.findByText('R-77')).toBeTruthy();
    expect(screen.queryByText(/Balance \(INR\)/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Money' }));
    expect(screen.getByText(/Balance \(INR\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getAllByText('Chargebacks').length).toBeGreaterThan(0);
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: respond(String(url)) }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
