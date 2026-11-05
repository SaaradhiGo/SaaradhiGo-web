import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

const SEARCH = new URLSearchParams('tab=sos');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => SEARCH,
  usePathname: () => '/safety-ops',
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
    permissions: ['safety.read', 'safety.respond'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const row = (id: number) => ({
  id, ref: `SOS-${id}`, trip_ref: null, title: `Rider pressed SOS ${id}`, category: 'sos', severity: 'critical', status: 'open',
  source: 'sos', country: null, anchor: { source: 'trip', node: null, node_name: 'Hyderabad' }, trip_id: null,
  assigned_to: null, assignee: null, opened_at: '2026-01-01T10:00:00Z', closed_at: null, outcome: null,
  police_referred_at: null, escalated: false,
  sos: { active: 1, unacknowledged: 1, oldest_unacknowledged_at: '2026-01-01T10:00:00Z', oldest_active_at: '2026-01-01T10:00:00Z' },
});
const PAGE = { count: 2, limit: 100, offset: 0, counts: { active_sos: 2 }, timers: {}, results: [row(1), row(2)] };

let fetchMock: ReturnType<typeof vi.fn>;

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: PAGE }) }));
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('safety queue', () => {
  it('a poll tick keeps the typed false-alarm reason, the focus and the row', async () => {
    render(<Page />);
    await screen.findByText('SOS-1');
    const rowBefore = screen.getByText('SOS-1').closest('tr');

    fireEvent.click(screen.getAllByRole('button', { name: 'False alarm…' })[0]);
    const box = await screen.findByLabelText(/Why is it a false alarm/);
    fireEvent.change(box, { target: { value: 'Rider tapped it by mistake' } });
    (box as HTMLTextAreaElement).focus();
    const calls = fetchMock.mock.calls.length;

    await act(async () => { vi.advanceTimersByTime(15_000); });
    await flush();

    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
    const after = screen.getByLabelText(/Why is it a false alarm/) as HTMLTextAreaElement;
    expect(after).toBe(box);
    expect(after.value).toBe('Rider tapped it by mistake');
    expect(document.activeElement).toBe(after);
    expect(screen.getByText('SOS-1').closest('tr')).toBe(rowBefore);
  });

  it('Acknowledge on a row posts to that incident', async () => {
    render(<Page />);
    await screen.findByText('SOS-2');
    fetchMock.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'Acknowledge' })[1]);
    await flush();
    const [url, init] = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'POST') as unknown as [string, RequestInit];
    expect(url).toMatch(/\/safety\/admin\/incidents\/2\/acknowledge\/$/);
    expect(init.method).toBe('POST');
  });

  it('selecting a row opens its panel beside the list', async () => {
    render(<Page />);
    await screen.findByText('SOS-1');
    fireEvent.click(screen.getByText('Rider pressed SOS 1'));
    expect(screen.getByRole('complementary', { name: 'Incident' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the full case' })).toBeTruthy();
  });
});
