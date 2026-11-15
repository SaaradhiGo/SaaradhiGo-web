/**
 * USA cleanup, 14 Nov: the US receipt reads Fare, Booking fee, Tip, Total charged (no Taxable
 * value); a paused driver's dashboard says so, why, and how to reach support; "Today you earned"
 * includes tips.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LegalProvider } from '@/components/sg/LegalProvider';
import { FareLinesList } from './rider/FareLinesList';

vi.mock('next/navigation', () => ({
  usePathname: () => '/driver',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => cleanup());

describe('a US receipt', () => {
  it('lists Fare, Booking fee, Tip and Total charged, with no taxable value', () => {
    render(
      <LocaleProvider initialLanguage="en"><LegalProvider initialMarket="US" decided>
        <FareLinesList lines={{
          lines: [{ code: 'fare', label: 'Fare', amount: '28.08' }], taxable: null,
          tax: { label: 'Sales tax', percent: '0', amount: '0.00', included: false }, tax_shown: false,
          extras: [{ code: 'per_trip_fee', label: 'Booking fee', amount: '1.50' }],
          total: '29.58', currency: 'USD', tip: '5.32', total_charged: '34.90',
        }} />
      </LegalProvider></LocaleProvider>,
    );
    const text = screen.getByTestId('fare-lines').textContent ?? '';
    expect(text).toMatch(/Fare\$28\.08Booking fee\$1\.50Tip \(100% to your driver\)\$5\.32Total charged\$34\.90/);
    expect(text).not.toMatch(/Taxable value|Minimum fare adjustment/);
  });
});

const REQ = {
  config: { country: 'US', state: 'ID', items: {}, min_driver_age: 21, max_vehicle_age_years: null, languages: ['en'] },
  checklist: { approved: false, steps: [{ key: 'personal' }], blocking: [] },
  paused: { reason_code: 'zero_tolerance', permanent: false, since: '2026-11-15T00:58:00Z',
    reason: 'A rider reported a zero tolerance concern (drugs or alcohol) on a trip. Your account is paused while our safety team investigates.' },
};
vi.mock('@/components/area/driver/profile/shared', async (orig) => ({
  ...(await orig<object>()),
  useRequirementsLoad: () => ({ state: 'ready', data: REQ, retry: vi.fn() }),
}));
vi.mock('@/lib/area/driver', async (orig) => ({
  ...(await orig<object>()),
  period: async (p: string) => ({ period: p, start: '2026-11-14', end: '2026-11-14', timezone: 'America/Boise', currency: 'USD',
    trips: 2, gross: '56.16', commission: '0.00', net: '56.16', tips: '10.64', earned: '66.80', cash_collected: '0.00',
    unresolved_trips: 0, cash_allowed: false }),
  balance: async () => ({ currency: 'USD', available: '66.80' }),
  daily: async () => ({ days: [], currency: 'USD', timezone: 'America/Boise' }),
  vehicles: async () => [],
}));

describe('a paused driver\'s dashboard', () => {
  it('says the account is paused, why, and offers support; today includes tips', async () => {
    const { DriverDashboard } = await import('./driver/DriverDashboard');
    render(<LocaleProvider initialLanguage="en"><LegalProvider initialMarket="US" decided><DriverDashboard /></LegalProvider></LocaleProvider>);
    for (let i = 0; i < 8; i += 1) await act(async () => {});
    const card = screen.getByTestId('paused-card');
    expect(card.textContent).toContain('Your account is paused');
    expect(card.textContent).toContain('zero tolerance');
    expect(screen.getByTestId('paused-support').getAttribute('href')).toBe('/driver/support');
    expect(screen.queryByText('Finish setting up to start driving')).toBeNull();
    expect(document.body.textContent).toContain('$66.80');
  });
});
