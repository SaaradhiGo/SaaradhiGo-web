import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '77' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/trips/77',
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
  id: 77, status: 'completed', pickup: { address: 'A', lat: null, lng: null }, destination: { address: 'B', lat: null, lng: null },
  timeline: { requested_at: '2026-01-01T10:00:00Z' }, rider: null, driver: null, vehicle: null,
  fare: { estimated_fare: '100', final_fare: '100', estimated_distance_km: null, actual_distance_km: null, surge_multiplier: '1.00', payment_method: 'cash', payment_status: 'paid', breakdown: null },
  payments: [], ratings: [], receipts: [], chat: { total: 1, messages: [{ id: 1, sender_role: 'rider', body: 'Where are you', is_system: false, created_at: null }] },
  driver_cancellations: [], promo: null, zone: null,
  sos_events: [{ id: 5, status: 'open', created_at: '2026-01-01T10:05:00Z', acknowledged_at: null, resolved_at: null }],
  audit_trail: [{ id: 1, action: 'trip_note_added', created_at: '2026-01-01T11:00:00Z', reason: 'checked', created_by: { label: 'Asha', role: 'ops' } }],
};

describe('trip record page', () => {
  it('shows the ref, keeps the SOS above the tabs, and switches tabs', async () => {
    render(<Page />);
    expect(await screen.findByText('T-77')).toBeTruthy();
    expect(screen.getByText('SOS on this trip')).toBeTruthy();
    expect(screen.queryByText('Where are you')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    await waitFor(() => expect(screen.getByText('Where are you')).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText(/checked/)).toBeTruthy();
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: DETAIL }) })));
});
afterEach(() => cleanup());
