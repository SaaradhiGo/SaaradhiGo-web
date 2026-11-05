/** Ride cards draw at once; only the price waits for the API (owner, 2026-11-05). */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let resolve: ((v: unknown) => void) | null = null;
vi.mock('@/lib/serviceAreas', () => ({
  fetchServiceAreas: async () => [],
  primaryArea: () => ({ centre: { lat: 17.385, lng: 78.4867 } }),
}));
vi.mock('@/lib/booking', () => ({
  serviceabilityAt: () => new Promise((r) => { resolve = r; }),
}));

import { LocaleProvider } from '@/i18n/LocaleProvider';
import { RideCategories } from './RideCategories';

describe('RideCategories', () => {
  it('shows names before the API answers, then the prices', async () => {
    const { container } = render(<LocaleProvider><RideCategories /></LocaleProvider>);
    expect(screen.getByText('Auto')).toBeTruthy();
    expect(screen.getByText('Sedan')).toBeTruthy();
    expect(container.querySelectorAll('.hp-ride__from-skel').length).toBe(4);
    expect(container.querySelector('.hp-ride__from')).toBeNull();

    await waitFor(() => expect(resolve).not.toBeNull());
    resolve!({
      serviceable: true,
      zone: { code: 'hyd', name: 'Hyderabad', country: 'IN', currency: 'INR', distance_unit: 'km' },
      vehicle_types: [{ type: 'auto', description: '', min_fare: '35' }, { type: 'sedan', description: '' }],
    });
    await waitFor(() => expect(container.querySelector('.hp-ride__from-skel')).toBeNull());
    expect(container.querySelectorAll('.hp-ride__from').length).toBe(1);
    expect(screen.getByText(/₹35/)).toBeTruthy();
  });
});
