/**
 * Gate: the earnings screen adds up (owner, 8 Nov; v2 on 10 Nov). Fares - platform fee + tips =
 * you earned, for the period shown, and each month row carries the ledger's own figure.
 * Rendered from ledger-shaped responses, read back from the DOM.
 */
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { earningsLines, type PeriodTotals } from '@/lib/area/driver';
import { DriverEarnings } from './DriverEarnings';

vi.mock('next/navigation', () => ({
  usePathname: () => '/driver/earnings',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const TODAY: PeriodTotals = {
  period: 'today', start: '2026-11-08', end: '2026-11-08', timezone: 'Asia/Kolkata', currency: 'INR',
  trips: 12, gross: '1420.00', commission: '213.00', net: '1207.00', cash_collected: '860.00', unresolved_trips: 0,
};
const OCTOBER = {
  period: 'month', start: '2026-10-01', end: '2026-10-31', timezone: 'Asia/Kolkata', currency: 'INR', today: '2026-11-10',
  joined: '2026-10-02', has_prev: false, has_next: true, prev: '2026-09-01', next: '2026-11-01',
  summary: { trips: 298, days_driven: 26, fares: '33995.50', avg_fare: '114.08', commission: '0.00', daily_fee: '2975.00',
    platform_fee: '2975.00', tips: '820.00', tip_riders: 41, earned: '31840.50', paid_to_bank: '18612.00', payouts: 6,
    cash_collected: '13228.50', unresolved_trips: 0, fee_note: 'Capped at ₹149.00 a day', tips_enabled: true },
  chart: { unit: 'day', bars: [{ key: '2026-10-01', earned: '1200.00', trips: 11 }, { key: '2026-10-02', earned: '0.00', trips: 0 }] },
};

vi.mock('@/lib/area/api', () => ({
  areaToken: async () => 't',
  areaPost: async () => ({}),
  areaGet: async (path: string) => {
    if (path.startsWith('/driver/earnings/history/')) return OCTOBER;
    if (path.startsWith('/driver/earnings/months/')) {
      return { currency: 'INR', joined: '2026-10', months: [
        { month: '2026-11', so_far: true, trips: 84, fares: '9412.00', platform_fee: '1043.00', tips: '210.00', earned: '8579.00' },
        { month: '2026-10', so_far: false, trips: 298, fares: '33995.50', platform_fee: '2975.00', tips: '820.00', earned: '31840.50' },
      ] };
    }
    if (path.startsWith('/driver/driver/profile/')) return { status: 'off' };
    if (path === '/auth/profile/') return { id: 1, full_name: 'Srinu', market_country: 'IN' };
    return {};
  },
}));

const amount = (s: string) => Number(s.replace(/[^\d.]/g, ''));

describe('earnings', () => {
  it('fares minus commission is what the ledger says was earned', () => {
    const l = earningsLines(TODAY);
    expect(l.addsUp).toBe(true);
    expect(l.fares - l.commission).toBeCloseTo(l.earned, 2);
    expect(earningsLines({ ...TODAY, net: '1300.00' }).addsUp).toBe(false);
  });

  it('the cards add up, the label is the month, the past stops at joining, and every month is listed', async () => {
    const { container } = render(<LocaleProvider><DriverEarnings /></LocaleProvider>);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    const stat = (label: string) => amount(container.querySelector(`[data-stat="${label}"]`)?.textContent ?? '');
    expect(stat('You earned')).toBeCloseTo(stat('Trip fares') - stat('Platform fee') + stat('Tips'), 2);
    expect(container.querySelector('[data-stat="You earned"]')?.textContent).toBe('₹31,840.50');
    expect(container.querySelector('[data-testid="period-label"]')?.textContent).toBe('October 2026');
    expect((container.querySelector('button[aria-label="Previous"]') as HTMLButtonElement).disabled).toBe(true);
    const rows = [...container.querySelectorAll('[data-month]')].map((r) => r.getAttribute('data-month'));
    expect(rows).toEqual(['2026-11', '2026-10']);
    expect(container.querySelector('[data-month="2026-11"]')?.textContent).toContain('(so far)');
    expect(container.querySelector('[data-month="2026-10"] [data-earned]')?.getAttribute('data-earned')).toBe('31840.50');
    expect(container.textContent).toContain('6 payouts · rest in cash');
  });
});
