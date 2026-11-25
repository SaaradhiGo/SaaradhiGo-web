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
    permissions: ['trip.read', 'driver.read', 'support.read', 'support.reply', 'safety.read'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const DETAIL = {
  id: 41, ref: 'SUP-HYD-4KQ7', status: 'OPEN', priority: 'NORMAL', issue_type: 'payment', description: 'Charged twice', trip_id: null,
  assigned_to: null, assignee: null,
  requester: { id: 3, role: 'rider', full_name: 'Meera', phone_number: '+91 1111', email: null, page: null },
  city: null, country: null, created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:00:00Z', resolved_at: null,
  first_responded_at: null, sla: { state: 'ok', next: 'first_response', minutes_remaining: 30, breached: false, first_response: { due_at: null }, resolution: { due_at: null } },
  messages: [], trip: null, refund: null,
  audit_trail: [{ id: 1, action: 'support_ticket_assigned', created_at: '2026-01-01T11:00:00Z', reason: 'picked up', created_by: { label: 'Asha' } }],
  allowed_actions: { reply: false, note: false, status: false, priority: false, category: false, assign: false, macros: false, reveal: false, refund: false },
};

describe('support ticket record page', () => {
  it('shows the ref and moves between tabs', async () => {
    render(<Page />);
    expect(await screen.findByText('SUP-HYD-4KQ7')).toBeTruthy();
    expect(screen.getByText('Charged twice')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Trip & money' }));
    expect(screen.getByText('No trip attached to this ticket.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText(/picked up/)).toBeTruthy();
  });

  it('links a trip and shows the server refusal word for word', async () => {
    let refuse = true;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/trip/') && init?.method === 'POST') {
        if (refuse) {
          refuse = false;
          return { ok: false, status: 400, json: async () => ({ status: 'error', error: { code: 'NOT_THEIR_TRIP', message: 'That trip is not one this person rode or drove.' } }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: 'success', data: { changed: true } }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: 'success', data: REPLY }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Page />);
    await screen.findByText('SUP-HYD-4KQ7');
    fireEvent.click(screen.getByRole('tab', { name: 'Trip & money' }));
    fireEvent.change(screen.getByLabelText('Trip reference'), { target: { value: 'HYD-261116-K7Q4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link trip' }));
    expect(await screen.findByText('That trip is not one this person rode or drove.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Trip reference'), { target: { value: 'HYD-261116-K7Q5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link trip' }));
    expect(await screen.findByText('Trip linked to this ticket.')).toBeTruthy();
    const posts = fetchMock.mock.calls.filter(([u, i]) => String(u).includes('/trip/') && i?.method === 'POST');
    expect(JSON.parse(String(posts[1][1]?.body))).toEqual({ trip: 'HYD-261116-K7Q5' });
  });

  it('offers escalation only on a safety ticket (25 Nov)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: REPLY }) })));
    render(<Page />);
    await screen.findByText('SUP-HYD-4KQ7');
    expect(screen.queryByRole('button', { name: 'Escalate to safety…' })).toBeNull();
  });

  it('escalates to safety and links the incident by its reference', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/escalate/')) {
        return { ok: true, status: 201, json: async () => ({ status: 'success', data: { ticket_id: 41, incident_id: 7, created: true, can_open: true } }) };
      }
      if (String(url).includes('/safety/admin/incidents/7/')) {
        return { ok: true, status: 200, json: async () => ({ status: 'success', data: { id: 7, ref: 'INC-HYD-3KQ9' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: 'success', data: { ...REPLY, issue_type: 'safety' } }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Page />);
    await screen.findByText('SUP-HYD-4KQ7');
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Escalate to safety…' }));
    fireEvent.change(screen.getByLabelText('Why this needs the safety team'), { target: { value: 'Rider reports harassment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Escalate' }));
    const link = await screen.findByRole('link', { name: 'INC-HYD-3KQ9' });
    expect(link.getAttribute('href')).toBe('/ops/safety-ops/incidents/7');
  });

  it('offers neither to an operator who cannot reply', async () => {
    render(<Page />);
    await screen.findByText('SUP-HYD-4KQ7');
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.queryByRole('button', { name: 'Escalate to safety…' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Trip & money' }));
    expect(screen.queryByRole('button', { name: 'Link trip' })).toBeNull();
  });
});

const REPLY = { ...DETAIL, allowed_actions: { ...DETAIL.allowed_actions, reply: true } };

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = 'sg-staff-in=1; path=/';
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: DETAIL }) })));
});
afterEach(() => cleanup());
