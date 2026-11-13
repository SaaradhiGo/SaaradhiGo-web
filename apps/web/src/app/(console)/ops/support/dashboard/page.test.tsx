import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/ops/support/dashboard',
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
    permissions: ['support.read'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const stats = { opened: 12, first_response_met_pct: 90, resolution_met_pct: 80, median_first_response_minutes: 4, currently_breaching: 2, paused: 1 };
const DASH = {
  date_from: '2026-01-01', date_to: '2026-01-07', as_of: '2026-01-08T00:00:00Z', truncated: false, totals: stats,
  cities: [{ city: { code: 'IN-TG-HYD', name: 'Hyderabad', country: 'IN' }, ...stats }], rows: [], agents: [],
};
const respond = (_url: string) => DASH;

describe('support SLA dashboard page', () => {
  it('shows the figures as cards and the by-city table', async () => {
    render(<Page />);
    expect(await screen.findByRole('table', { name: 'Tickets by city' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'SLA dashboard' })).toBeTruthy();
    expect(screen.getByText('Breaching now', { selector: '.ops-metric__label' })).toBeTruthy();
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: respond(String(url)) }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
