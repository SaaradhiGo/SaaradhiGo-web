/**
 * QA, 14 Nov (US journey, trip 217): the receipt left out the 18% tip and gave the distance in km.
 * A US receipt lists the tip (100% to the driver), the total the card paid, and miles.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LegalProvider } from '@/components/sg/LegalProvider';

vi.mock('next/navigation', () => ({
  usePathname: () => '/trips/217',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const TRIP = {
  id: 217, status: 'completed', currency: 'USD', estimated_fare: '29.58', payment_method: 'card',
  requested_at: '2026-11-15T00:20:00Z', completed_at: '2026-11-15T00:30:00Z', actual_distance_km: '18.7',
  pickup_address: 'Boise State University, Boise, ID, USA', destination_address: 'The Village at Meridian, Meridian, ID, USA',
  tip: { amount: '5.32', currency: 'USD' },
};
vi.mock('@/lib/area/api', () => ({
  areaToken: async () => 'sg:rider-session',
  areaGet: async (path: string) => (path.includes('/details/') ? {} : TRIP),
  areaPost: async () => ({}),
  endAreaSession: async () => {},
}));

afterEach(() => cleanup());

describe('a US receipt', () => {
  it('lists the tip, the total charged and miles', async () => {
    const { RiderReceipt } = await import('./RiderReceipt');
    render(<LocaleProvider initialLanguage="en"><LegalProvider initialMarket="US" decided><RiderReceipt id="217" /></LegalProvider></LocaleProvider>);
    for (let i = 0; i < 6; i += 1) await act(async () => {});
    expect(screen.getByTestId('receipt-tip').textContent).toContain('$5.32');
    expect(screen.getByTestId('receipt-total-charged').textContent).toContain('$34.90');
    expect(document.body.textContent).toContain('11.6 mi');
    expect(document.body.textContent).not.toMatch(/\d km\b/);
  });
});
