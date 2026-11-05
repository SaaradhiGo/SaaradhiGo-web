import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '12' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/zones/12',
}));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));
vi.mock('@/components/console/zones/ZoneMap', () => ({ ZoneMap: () => <div data-testid="map" /> }));
vi.mock('@/components/console/zones/ZoneEditor', () => ({ ZoneEditor: () => <div>editor</div> }));
vi.mock('@/lib/adminScope', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/adminScope')>();
  const access = {
    id: 1, email: 'ops@example.test', full_name: 'Ops', is_superuser: false, is_break_glass: false,
    permissions: ['zone.read'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const ZONE = {
  id: 12, code: 'Z-12', name: 'Airport', country: 'IN', state_code: 'TS', city: 'Hyderabad', zone_type: 'service',
  parent: null, parent_code: null, polygon_geojson: null, priority: 1, currency: 'INR', timezone_name: 'Asia/Kolkata',
  distance_unit: 'km', tax_mode: 'included', per_trip_fee: '0', per_trip_fee_label: '', geo_node: null, is_active: true,
  metadata: {}, version: 3, area_km2: 4, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
};

describe('zone record page', () => {
  it('shows the name, ref and status, and moves between tabs', async () => {
    render(<Page />);
    expect(await screen.findByText('Airport')).toBeTruthy();
    expect(screen.getByText('Z-12')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByTestId('map')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText('No revisions yet')).toBeTruthy();
    expect(screen.queryByTestId('map')).toBeNull();
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const data = /history/.test(u) ? { zone: 'Z-12', version: 3, revisions: [], pending_requests: [] }
      : /zones\/12\/?(\?|$)/.test(u) ? ZONE : { results: [] };
    return { ok: true, status: 200, json: async () => ({ status: 'success', data }) };
  }));
});
afterEach(() => cleanup());
