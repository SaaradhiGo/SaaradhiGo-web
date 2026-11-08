/**
 * Gate: the lines on the earnings screen add up to its totals (owner,
 * 2026-11-08): fares - commission = you earned; you earned - cash collected =
 * the last line. Rendered from ledger-shaped responses, read back from the DOM.
 */
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { earningsLines, type PeriodTotals } from '@/lib/area/driver';
import { DriverEarnings } from './DriverEarnings';

vi.mock('next/navigation', () => ({
  usePathname: () => '/driver/earnings',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

const TODAY: PeriodTotals = {
  period: 'today', start: '2026-11-08', end: '2026-11-08', timezone: 'Asia/Kolkata', currency: 'INR',
  trips: 12, gross: '1420.00', commission: '213.00', net: '1207.00', cash_collected: '860.00', unresolved_trips: 0,
};

vi.mock('@/lib/area/api', () => ({
  areaToken: async () => 't',
  areaPost: async () => ({}),
  areaGet: async (path: string) => {
    if (path.startsWith('/driver/earnings/period/')) return TODAY;
    if (path.startsWith('/driver/earnings/daily/')) return { days: [] };
    if (path.startsWith('/driver/withdrawals/balance/')) return { available_balance: '347.00', currency: 'INR' };
    if (path.startsWith('/driver/driver/profile/')) return { status: 'off' };
    return {};
  },
}));

const amount = (s: string) => Number(s.replace(/[^\d.]/g, ''));

describe('earnings lines', () => {
  it('fares minus commission is what the ledger says was earned', () => {
    const l = earningsLines(TODAY);
    expect(l.addsUp).toBe(true);
    expect(l.fares - l.commission).toBeCloseTo(l.earned, 2);
    expect(l.afterCash).toBeCloseTo(l.earned - l.cash, 2);
    expect(earningsLines({ ...TODAY, net: '1300.00' }).addsUp).toBe(false);
  });

  it('the lines on screen add up to the totals on screen', async () => {
    const { container } = render(<LocaleProvider><DriverEarnings /></LocaleProvider>);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const values = [...container.querySelectorAll('[data-testid="earnings-lines"] [data-line]')].map((e) => amount(e.textContent ?? ''));
    expect(values).toHaveLength(5);
    const [fares, commission, earned, cash, after] = values;
    expect(fares - commission).toBeCloseTo(earned, 2);
    expect(earned - cash).toBeCloseTo(after, 2);
    expect(container.textContent).toContain('₹1,420');
    expect(container.textContent).not.toMatch(/tip/i);
  });
});
