import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '9' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/safety-ops/incidents/9',
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
    permissions: ['trip.read', 'driver.read', 'support.read', 'safety.read'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const DETAIL = {
  id: 9, ref: 'SOS-9', trip_ref: null, title: 'Rider pressed SOS', category: 'sos', severity: 'critical', status: 'open',
  source: 'sos', country: null, anchor: { source: 'trip', node: null, node_name: 'Hyderabad' }, trip_id: null,
  assigned_to: null, assignee: null, opened_at: '2026-01-01T10:00:00Z', closed_at: null, outcome: null,
  police_referred_at: null, escalated: false, closing_summary: null, police_reference: null,
  sos: { active: 1, unacknowledged: 1, oldest_unacknowledged_at: null, oldest_active_at: '2026-01-01T10:00:00Z' },
  timeline: [{ id: 1, kind: 'note', actor_id: 1, actor_label: 'Asha', from_status: null, to_status: null, note: 'called the driver', data: {}, created_at: '2026-01-01T10:05:00Z' }],
  people: { drivers: [], riders: [], trips: [], tickets: [] },
  sos_events: [], signals: [], emergency: { country: null, configured: false, numbers: [] },
  actions: { assign: false, note: false, status: false, link: false, unlink: false, refer_police: false, close: false, close_blockers: [], suspend_driver: false, block_rider: false, reveal_sos: false, edit_config: false },
  read_only: true, vocabulary: { categories: [], severities: [], statuses: [], outcomes: [] },
};

describe('incident record page', () => {
  it('shows the ref, the SOS panel up front, and the timeline under History', async () => {
    render(<Page />);
    expect((await screen.findAllByText('SOS-9')).length).toBeGreaterThan(0);
    expect(screen.getByText('SOS (0)')).toBeTruthy();
    expect(screen.queryByText(/called the driver/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText(/called the driver/)).toBeTruthy();
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: DETAIL }) })));
});
afterEach(() => cleanup());
