/**
 * 14 Nov (seen on QA): a visitor picking up in Boise was offered "Cash · Pay the driver at the end"
 * under "Cash is not accepted here". A visitor's methods are the pickup's own (Idaho: card only),
 * and the footer names DeepTrics LLC whatever the header says.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LegalProvider, useLegal } from '@/components/sg/LegalProvider';

let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/ride/choose',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => search,
}));
vi.mock('@/components/MapSurface', () => ({ default: () => null }));
vi.mock('./useArea', () => ({
  useArea: () => ({ roles: [], both: false, signOut: vi.fn(), switchTo: vi.fn() }),
  areaPath: (p: string | null) => p ?? '/',
}));
vi.mock('@/lib/area/api', () => ({
  areaToken: async () => null, areaGet: async () => ({}), areaPost: async () => ({}), endAreaSession: async () => {},
}));
vi.mock('@/lib/booking', async (orig) => ({
  ...(await orig<typeof import('@/lib/booking')>()),
  serviceabilityAt: async () => ({
    serviceable: true,
    zone: { code: 'US-ID-TV', name: 'Treasure Valley', country: 'US', currency: 'USD', distance_unit: 'mi', payment_methods: ['card'] },
    vehicle_types: [{ type: 'standard' }],
  }),
  routeBetween: async () => ({ distanceMeters: 20600, durationSeconds: 1020, distanceText: '20.6 km', durationText: '17 min', points: null }),
  quoteFare: async () => ({ estimated_fare: '29.62', currency: 'USD', distance_unit: 'mi', drivers_nearby: true, pickup_eta_min: 2 }),
}));

import { saveDraft } from '@/lib/area/rider';
import { RideChoose } from './rider/RideChoose';

function Company() {
  return <span data-testid="company">{useLegal().entity.legal_name}</span>;
}

describe('a visitor booking from Boise with India in the header', () => {
  beforeEach(() => {
    const id = saveDraft({
      from: { lat: 43.6, lng: -116.2, label: 'Boise State University, Boise, ID, USA', short: 'Boise State University' },
      to: { lat: 43.61, lng: -116.39, label: 'Meridian City Hall, Meridian, ID, USA', short: 'Meridian City Hall' },
    });
    search = new URLSearchParams({ d: id });
  });
  afterEach(() => { cleanup(); sessionStorage.clear(); });

  it('gets USD, miles, the card only and DeepTrics LLC', async () => {
    render(
      <LocaleProvider initialLanguage="en">
        <LegalProvider initialMarket="IN" decided>
          <RideChoose guest />
          <Company />
        </LegalProvider>
      </LocaleProvider>,
    );
    await screen.findByTestId('class-standard');
    expect(screen.getByTestId('class-standard').textContent).toContain('$29.62');
    expect(screen.getByTestId('trip-line').textContent).toContain('12.8 mi');
    expect(screen.queryByTestId('pay-cash')).toBeNull();
    expect(screen.getByTestId('pay-card').textContent).toContain('Card, Apple Pay or Google Pay');
    expect(screen.getByTestId('company').textContent).toBe('DeepTrics LLC');
  });
});
