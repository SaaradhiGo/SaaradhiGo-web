import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '41' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/ops/support/41',
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
  id: 41, status: 'OPEN', priority: 'NORMAL', issue_type: 'payment', description: 'Charged twice', trip_id: null,
  assigned_to: null, assignee: null,
  requester: { id: 3, role: 'rider', full_name: 'Meera', phone_number: '+91 1111', email: null, page: null },
  city: null, country: null, created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:00:00Z', resolved_at: null,
  first_responded_at: null, sla: { state: 'ok', next: 'first_response', minutes_remaining: 30, breached: false },
  messages: [], trip: null, refund: null,
  audit_trail: [{ id: 1, action: 'support_ticket_assigned', created_at: '2026-01-01T11:00:00Z', reason: 'picked up', created_by: { label: 'Asha' } }],
  allowed_actions: { reply: false, note: false, status: false, priority: false, category: false, assign: false, macros: false, reveal: false, refund: false },
};

describe('support ticket record page', () => {
  it('shows the ref and moves between tabs', async () => {
    render(<Page />);
    expect(await screen.findByText('TKT-41')).toBeTruthy();
    expect(screen.getByText('Charged twice')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Trip & money' }));
    expect(screen.getByText('No trip attached to this ticket.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText(/picked up/)).toBeTruthy();
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: DETAIL }) })));
});
afterEach(() => cleanup());
