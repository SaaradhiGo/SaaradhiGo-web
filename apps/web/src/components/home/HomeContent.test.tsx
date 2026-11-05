/** Homepage render: hero lines present, no "surge", no "Coming soon". */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: unknown; href: string }) => <a href={href}>{children as never}</a> }));
vi.mock('@/lib/serviceAreas', () => ({
  fetchServiceAreas: async () => [],
  primaryArea: () => ({ centre: { lat: 17.385, lng: 78.4867 } }),
}));
vi.mock('@/lib/booking', () => ({
  serviceabilityAt: async () => ({
    serviceable: true,
    zone: { code: 'hyd', name: 'Hyderabad', country: 'IN', currency: 'INR', distance_unit: 'km' },
    vehicle_types: [
      { type: 'auto', description: '', min_fare: '49.40' },
      { type: 'hatchback', description: '' },
      { type: 'sedan', description: '', min_fare: 129 },
      { type: 'suv', description: '' },
    ],
  }),
  searchPlaces: async () => [],
  placeToPoint: async () => null,
}));

import { LocaleProvider } from '@/i18n/LocaleProvider';
import { HomeContent } from './HomeContent';

describe('HomeContent', () => {
  it('renders the design copy with real prices only', async () => {
    const { container } = render(
      <LocaleProvider>
        <HomeContent />
      </LocaleProvider>,
    );
    expect(screen.getByText('Know the fare')).toBeTruthy();
    expect(screen.getByText('before you get in.')).toBeTruthy();
    expect(screen.getByText('Now in Hyderabad')).toBeTruthy();
    expect(screen.getByRole('button', { name: /See fares/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Mini')).toBeTruthy());
    expect(screen.getByText('from ₹49')).toBeTruthy();
    expect(screen.getByText('from ₹129')).toBeTruthy();
    expect(screen.getAllByText(/^from /)).toHaveLength(2);
    const text = container.textContent ?? '';
    expect(/surge/i.test(text)).toBe(false);
    expect(/coming soon/i.test(text)).toBe(false);
  });
});
