import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '77' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/ops/trips/77',
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
  id: 77, ref: 'HYD-261116-K7Q4', status: 'completed', pickup: { address: 'A', lat: null, lng: null }, destination: { address: 'B', lat: null, lng: null },
  timeline: { requested_at: '2026-01-01T10:00:00Z' }, rider: null, driver: null, vehicle: null,
  fare: { estimated_fare: '100', final_fare: '100', estimated_distance_km: null, actual_distance_km: null, surge_multiplier: '1.00', payment_method: 'cash', payment_status: 'paid', breakdown: null },
  payments: [], ratings: [], receipts: [], chat: { total: 1, messages: [{ id: 1, sender_role: 'rider', body: 'Where are you', is_system: false, created_at: null }] },
  driver_cancellations: [], promo: null, zone: null,
  sos_events: [{ id: 5, status: 'open', created_at: '2026-01-01T10:05:00Z', acknowledged_at: null, resolved_at: null }],
  calls: [
    { id: 1, from_role: 'rider', started_at: '2026-01-01T10:02:00Z', ended_at: '2026-01-01T10:04:05Z', duration_seconds: 125 },
    { id: 2, from_role: 'driver', started_at: '2026-01-01T10:06:00Z', ended_at: null, duration_seconds: 0 },
  ],
  audit_trail: [{ id: 1, action: 'trip_note_added', created_at: '2026-01-01T11:00:00Z', reason: 'checked', created_by: { label: 'Asha', role: 'ops' } }],
};

describe('trip record page', () => {
  it('shows the ref, keeps the SOS above the tabs, and switches tabs', async () => {
    render(<Page />);
    expect(await screen.findByText('HYD-261116-K7Q4')).toBeTruthy();
    expect(screen.getByText('SOS on this trip')).toBeTruthy();
    expect(screen.queryByText('Where are you')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    await waitFor(() => expect(screen.getByText('Where are you')).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText(/checked/)).toBeTruthy();
  });

  it('lists the calls: who called whom and for how long', async () => {
    render(<Page />);
    await screen.findByText('HYD-261116-K7Q4');
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    expect(screen.getByText(/Rider called the driver · 2 min 5 s/)).toBeTruthy();
    expect(screen.getByText(/Driver called the rider · not answered/)).toBeTruthy();
  });

  it('says so when nobody called', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: { ...DETAIL, calls: [] } }) })));
    render(<Page />);
    await screen.findByText('HYD-261116-K7Q4');
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    expect(screen.getByText('No calls on this trip.')).toBeTruthy();
  });

  it('opens a support ticket from the trip and links to it', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/ticket/') && init?.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ status: 'success', data: { ticket_id: 501, ticket_ref: 'SUP-HYD-9QX2' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: 'success', data: DETAIL }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open support ticket…' }));
    // No driver on this trip: the ticket can only be for the rider.
    expect(screen.queryByLabelText('Driver')).toBeNull();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'lost_item' } });
    const open = screen.getByRole('button', { name: 'Open ticket' }) as HTMLButtonElement;
    expect(open.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/What it is about/), { target: { value: 'Left a bag in the car' } });
    fireEvent.click(open);
    const link = await screen.findByRole('link', { name: 'SUP-HYD-9QX2' });
    expect(link.getAttribute('href')).toBe('/ops/support/501');
    const post = fetchMock.mock.calls.find(([u, i]) => String(u).includes('/ticket/') && i?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ for: 'rider', issue_type: 'lost_item', priority: 'normal', description: 'Left a bag in the car' });
  });
});

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = 'sg-staff-in=1; path=/';
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: DETAIL }) })));
});
afterEach(() => cleanup());
