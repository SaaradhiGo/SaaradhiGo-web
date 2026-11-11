/**
 * Only the classes pricing returns (owner, 2026-11-05): unnamed placeholders
 * while the list loads, then the real classes in their class colours, and no
 * class at all when the list cannot be fetched.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let resolve: ((v: unknown) => void) | null = null;
let reject: ((e: unknown) => void) | null = null;
vi.mock('@/lib/serviceAreas', () => ({
  fetchServiceAreas: async () => [],
  primaryArea: () => ({ centre: { lat: 17.385, lng: 78.4867 } }),
}));
vi.mock('@/lib/booking', () => ({
  serviceabilityAt: () => new Promise((r, j) => { resolve = r; reject = j; }),
}));

import { LocaleProvider } from '@/i18n/LocaleProvider';
import { RideCategories } from './RideCategories';

describe('RideCategories', () => {
  it('names no class before the API answers, then shows only what it returns', async () => {
    const { container } = render(<LocaleProvider><RideCategories /></LocaleProvider>);
    expect(container.querySelectorAll('.hp-ride--placeholder').length).toBe(4);
    expect(screen.queryByText('Auto')).toBeNull();
    expect(container.querySelector('.hp-ride__from')).toBeNull();

    await waitFor(() => expect(resolve).not.toBeNull());
    resolve!({
      serviceable: true,
      zone: { code: 'hyd', name: 'Hyderabad', country: 'IN', currency: 'INR', distance_unit: 'km' },
      vehicle_types: [{ type: 'auto', description: '', min_fare: '35' }, { type: 'sedan', description: '' }],
    });
    await waitFor(() => expect(container.querySelector('.hp-ride--placeholder')).toBeNull());
    expect(screen.getByText('Auto')).toBeTruthy();
    expect(screen.getByText('Sedan')).toBeTruthy();
    expect(screen.queryByText('Mini')).toBeNull();
    expect(container.querySelectorAll('.hp-ride__from').length).toBe(1);
    expect(screen.getByText(/₹35/)).toBeTruthy();
    expect(container.querySelector('[data-class="auto"]')).not.toBeNull();
    expect(container.querySelector('[data-class="comfort"]')).not.toBeNull();
  });

  it('shows no class when the list cannot be fetched', async () => {
    const { container } = render(<LocaleProvider><RideCategories /></LocaleProvider>);
    await waitFor(() => expect(reject).not.toBeNull());
    reject!(new Error('offline'));
    await waitFor(() => expect(container.querySelector('.hp-ride--placeholder')).toBeNull());
    expect(container.querySelectorAll('.hp-ride').length).toBe(0);
  });
});
