/**
 * 19 Nov (owner): India's amounts read in whole rupees, on the trip page as on Choose a ride
 * (the Safety frames on the public site are this screen).
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LegalProvider } from '@/components/sg/LegalProvider';

vi.mock('next/navigation', () => ({
  usePathname: () => '/ride/trip/201',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/MapSurface', () => ({ default: () => null }));
const trip = () => ({
  id: 201, status: 'completed', currency: 'INR', estimated_fare: '118.00', final_fare: '118.00', payment_method: 'cash',
  payment_status: 'completed', driver_name: 'Ravi K.', pickup_address: 'Cyber Towers, HITEC City', destination_address: 'Charminar',
  market_rules: { cash_allowed: true, tips_enabled: false, tip_presets: [], zero_tolerance: true },
  tip: null,
});
vi.mock('@/lib/area/api', () => ({
  areaToken: async () => 'sg:rider-session',
  areaGet: async () => trip(),
  areaPost: async () => ({}),
  endAreaSession: async () => {},
}));
vi.mock('@/lib/booking', async (orig) => ({
  ...(await orig<object>()),
  RideSocket: class { open() {} close() {} },
}));

afterEach(() => cleanup());

async function show() {
  const { RideTrip } = await import('./RideTrip');
  render(<LocaleProvider initialLanguage="en"><LegalProvider initialMarket="IN" decided><RideTrip id="201" /></LegalProvider></LocaleProvider>);
  for (let i = 0; i < 8; i += 1) await act(async () => {});
}

describe('an India trip', () => {
  it('shows its fare in whole rupees, never "₹118.00"', async () => {
    await show();
    const text = document.body.textContent ?? '';
    expect(text).toContain('₹118');
    expect(text).not.toContain('₹118.00');
  });
});
