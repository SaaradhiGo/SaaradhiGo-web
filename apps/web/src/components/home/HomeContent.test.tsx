/** Homepage render (design of 2026-11-07): the design copy, no numbers or city outside the marked example (13 Nov), no "Coming soon", no app band without store links, no Schedule switch. */
import { render, screen } from '@testing-library/react';
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
  it('renders the design copy with no numbers, no city and no app band', () => {
    render(
      <LocaleProvider>
        <HomeContent />
      </LocaleProvider>,
    );
    expect(screen.getByText('Fair for riders.')).toBeTruthy();
    expect(screen.getByText('Fair for drivers.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'See fares' })).toBeTruthy();
    expect(screen.getByText('Honest for the rider. Honest for the driver.')).toBeTruthy();
    expect(screen.getAllByText('Trip fare').length).toBeGreaterThan(0);
    // 13 Nov (owner): the request mock shows example numbers that add up, marked Example, and
    // they are the only numbers (and the only city) on the page.
    const example = screen.getByTestId('example-request');
    expect(example.textContent).toContain('₹183.00');
    expect(example.textContent).toContain('₹27.45');
    expect(example.textContent).toContain('₹155.55');
    expect(screen.getAllByText('Example · Sedan, Hyderabad').length).toBe(1);
    const text = (document.body.textContent || '').replace(example.textContent || '', '').replace('Example · Sedan, Hyderabad', '');
    expect(/[₹$€£]\s?\d|\d{4,6}/.test(text)).toBe(false);
    expect(/Hyderabad|UPI|Aadhaar/.test(text)).toBe(false);
    expect(/surge|coming soon/i.test(text)).toBe(false);
    expect(screen.queryByText('Get the SaaradhiGo app')).toBeNull();
    // Scheduled rides do not exist yet: no Ride now / Schedule switch.
    expect(screen.queryByText('Schedule')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Trip type' })).toBeNull();
  });
});
