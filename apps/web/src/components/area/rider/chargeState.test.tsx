/**
 * QA, 14 Nov (US journey, trip 219): the card hold was voided and the capture failed, yet the trip
 * said "Paid $29.58 online" and offered a tip on the same card. A card trip shows the charge's own
 * state: paid, still charging, or could not be charged (and then no tip is offered).
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LegalProvider } from '@/components/sg/LegalProvider';

vi.mock('next/navigation', () => ({
  usePathname: () => '/ride/trip/219',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/MapSurface', () => ({ default: () => null }));
let paymentStatus = 'failed';
const trip = () => ({
  id: 219, status: 'completed', currency: 'USD', estimated_fare: '29.58', payment_method: 'card',
  card_held: { status: paymentStatus === 'completed' ? 'captured' : paymentStatus }, payment_status: paymentStatus,
  driver_name: 'Jordan Driver', pickup_address: 'Boise State University', destination_address: 'The Village at Meridian',
  market_rules: { cash_allowed: false, tips_enabled: true, tip_presets: [15, 18, 20], zero_tolerance: true },
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
  render(<LocaleProvider initialLanguage="en"><LegalProvider initialMarket="US" decided><RideTrip id="219" /></LegalProvider></LocaleProvider>);
  for (let i = 0; i < 8; i += 1) await act(async () => {});
}

describe('a card trip at the end', () => {
  it('could not be charged: says so, never "Paid", and offers no tip', async () => {
    paymentStatus = 'failed';
    await show();
    expect(screen.getByTestId('charge-failed').textContent).toContain('We could not charge your card for this trip ($29.58).');
    expect(document.body.textContent).not.toMatch(/Paid \$29\.58/);
    expect(screen.queryByText('Add a tip')).toBeNull();
  });

  it('still charging: says so', async () => {
    paymentStatus = 'pending';
    await show();
    expect(document.body.textContent).toContain('Charging your card…');
    expect(document.body.textContent).not.toMatch(/Paid \$29\.58/);
  });

  it('charged: paid by card', async () => {
    paymentStatus = 'completed';
    await show();
    expect(document.body.textContent).toContain('Paid $29.58 by card');
  });
});
