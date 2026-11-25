import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

const state = vi.hoisted(() => ({ permissions: ['platform.read', 'platform.settings'] }));
vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/ops/settings',
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
    permissions: state.permissions, roles: [], scopes: [], access_model: 'scoped',
  });
  return { ...actual, useAdminAccess: access, getCachedAccess: access };
});

const city = (code: string, name: string, status: string) => ({
  code, name, status, country: 'IN', state: { code: 'IN-AP', name: 'Andhra Pradesh' }, blocking_count: 0, warning_count: 0,
  ready: true, readiness: [], pending_request: null, may_launch: status !== 'live', may_pause: status === 'live',
});
const MARKETS = { pending: [], countries: [{
  code: 'IN', name: 'India', currency: 'INR', status: 'live', in_registry: true, may_add_city: true,
  cities: [city('IN-AP-VTZ', 'Visakhapatnam', 'draft'), city('IN-TG-HYD', 'Hyderabad', 'live')],
}] };

function stub() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      return { ok: true, status: 202, json: async () => ({ status: 'success', data: { state: 'pending_approval', approval_request: { id: 31 } } }) };
    }
    const m = u.match(/markets\/([A-Z-]+)\/readiness/);
    if (m) return { ok: true, status: 200, json: async () => ({ status: 'success', data: MARKETS.countries[0].cities.find((c) => c.code === m[1]) }) };
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: MARKETS }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('countries and cities: archive', () => {
  it('asks a second admin to archive a city that is not live', async () => {
    const fetchMock = stub();
    render(<Page />);
    fireEvent.click(await screen.findByText('Visakhapatnam'));
    fireEvent.change(await screen.findByLabelText('Reason'), { target: { value: 'Not a planned market' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request archive' }));
    expect(await screen.findByText(/Sent for approval/)).toBeTruthy();
    const post = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
    expect(String(post?.[0])).toContain('/platform/admin/markets/IN-AP-VTZ/status/');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ status: 'archived', reason: 'Not a planned market' });
  });

  it('never offers to archive a live city', async () => {
    stub();
    render(<Page />);
    fireEvent.click(await screen.findByText('Hyderabad'));
    await screen.findByRole('button', { name: 'Request pause' });
    expect(screen.queryByRole('button', { name: 'Request archive' })).toBeNull();
  });

  it('is not offered without platform.settings', async () => {
    state.permissions = ['platform.read'];
    stub();
    render(<Page />);
    fireEvent.click(await screen.findByText('Visakhapatnam'));
    await waitFor(() => expect(screen.getAllByText('Visakhapatnam').length).toBeGreaterThan(1));
    expect(screen.queryByRole('button', { name: 'Request archive' })).toBeNull();
  });
});

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = 'sg-staff-in=1; path=/';
  state.permissions = ['platform.read', 'platform.settings'];
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
