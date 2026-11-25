import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

const downloads = vi.hoisted(() => ({ files: [] as string[], search: new URLSearchParams('plate=TS 09 AB 1234') }));
vi.mock('@/lib/listViews', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/listViews')>();
  return { ...actual, downloadCsv: (name: string) => { downloads.files.push(name); } };
});
vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => downloads.search,
  usePathname: () => '/ops/trips',
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
    permissions: ['trip.read'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const ROW = {
  id: 9, ref: 'HYD-261116-K7Q4', status: 'completed', user: 'Asha', driver: null, vehicle: null,
  pickup_locality: 'Ameerpet', drop_locality: 'Kondapur', requested_at: '2026-11-20T10:00:00Z',
  city: { code: 'IN-TG-HYD', name: 'Hyderabad', timezone: 'Asia/Kolkata' }, currency: 'INR',
};
const PAGE = { count: 1, page: 1, total_pages: 1, results: [ROW] };

describe('trips list', () => {
  it('filters by plate and logs a CSV export after the file is saved', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).includes('export-log')) {
        return { ok: true, status: 201, json: async () => ({ status: 'success', data: { recorded: true } }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: 'success', data: PAGE }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Page />);
    expect(await screen.findByText('Plate: TS 09 AB 1234')).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('plate=TS+09+AB+1234'))).toBe(true));
    await screen.findAllByText('HYD-261116-K7Q4');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('export-log'))).toBe(true));
    expect(downloads.files.length).toBe(1);
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('export-log'))!;
    const body = JSON.parse(String(init?.body));
    expect(body.rows).toBe(1);
    expect(body.filters.plate).toBe('TS 09 AB 1234');
  });
});

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = 'sg-staff-in=1; path=/';
  downloads.files = [];
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
