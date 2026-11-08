/**
 * Gate (8 Nov): no signed-in card waits forever. A brand-new driver sees
 * zeros and empty messages, a failing API shows the error with Try again (and
 * Try again works), a request that never answers becomes an error after ten
 * seconds, and nothing on the page is a "…" or "•••" placeholder.
 */
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { DriverDashboard } from './DriverDashboard';
import { DriverEarnings } from './DriverEarnings';
import { DriverPayouts } from './DriverPayouts';
import { DriverTrips } from './DriverTrips';

vi.mock('next/navigation', () => ({
  usePathname: () => '/driver',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

const ZERO = (period: string) => ({
  period, start: '2026-11-09', end: '2026-11-15', timezone: 'Asia/Kolkata', currency: 'INR',
  trips: 0, gross: '0.00', commission: '0.00', net: '0.00', cash_collected: '0.00', unresolved_trips: 0,
});
const DAYS = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']
  .map((date) => ({ date, trips: 0, gross: '0.00', commission: '0.00', net: '0.00' }));

// What QA's API answers for a driver with no trips, ledger rows or payouts.
function newDriver(path: string): unknown {
  if (path.startsWith('/driver/earnings/period/')) return ZERO(new URLSearchParams(path.split('?')[1]).get('period') ?? 'week');
  if (path.startsWith('/driver/earnings/daily/')) return { days: DAYS, currency: 'INR', timezone: 'Asia/Kolkata' };
  if (path.startsWith('/driver/withdrawals/balance/')) return { available_balance: 0.0, currency: 'INR', withdrawals_available: false };
  if (path.startsWith('/driver/withdrawals/history/')) return { count: 0, results: [] };
  if (path.startsWith('/driver/earnings/')) return { count: 0, results: [] };
  if (path.startsWith('/ride/driver-history/')) return { count: 0, results: [] };
  if (path.startsWith('/driver/driver/onboarding/')) return { driver_documents: [], vehicle_documents: [] };
  if (path.startsWith('/driver/vehicles/')) return [];
  if (path.startsWith('/driver/driver/profile/')) return { status: 'off' };
  return {};
}

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/area/api', () => ({
  areaToken: async () => 't',
  areaPost: async () => ({}),
  areaGet: (path: string) => api.get(path),
}));

const page = (ui: React.ReactNode) => render(<LocaleProvider>{ui}</LocaleProvider>);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const PLACEHOLDER = /…|•••/;

beforeEach(() => { api.get.mockReset(); api.get.mockImplementation(async (p: string) => newDriver(p)); });
afterEach(() => { vi.useRealTimers(); });

describe('a brand-new driver sees zeros, not dots', () => {
  it('dashboard: ₹0.00 today, this week and ready to withdraw; seven ₹0.00 bars', async () => {
    const { container } = page(<DriverDashboard />);
    await settle();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(PLACEHOLDER);
    expect(text.match(/₹0\.00/g)?.length).toBeGreaterThanOrEqual(3 + 7);
    expect(container.querySelectorAll('.dr-chart > div')).toHaveLength(7);
    expect(container.querySelector('.askel')).toBeNull();
  });

  it('earnings: every line ₹0.00, nothing left loading', async () => {
    const { container } = page(<DriverEarnings />);
    await settle();
    expect(container.textContent).not.toMatch(PLACEHOLDER);
    const lines = [...container.querySelectorAll('[data-line]')].map((e) => e.textContent);
    expect(lines).toHaveLength(5);
    lines.forEach((l) => expect(l).toMatch(/₹0\.00/));
    expect(container.querySelector('.askel')).toBeNull();
  });

  it('trips: "No trips yet" with how to get the first one', async () => {
    const { container } = page(<DriverTrips />);
    await settle();
    expect(container.textContent).toContain('No trips yet');
    expect(container.textContent).toContain('Go online in the driver app to get your first ride request.');
    expect(container.textContent).not.toMatch(PLACEHOLDER);
  });

  it('payouts: ₹0.00 ready and "No payouts yet"', async () => {
    const { container } = page(<DriverPayouts />);
    await settle();
    expect(container.textContent).toContain('₹0.00');
    expect(container.textContent).toContain('No payouts yet');
    expect(container.textContent).not.toMatch(PLACEHOLDER);
  });
});

describe('a failing API shows the error, and Try again works', () => {
  it('earnings fail: the error and Try again; the other cards still show', async () => {
    let fail = true;
    api.get.mockImplementation(async (p: string) => {
      if (fail && p.startsWith('/driver/earnings/period/')) throw new Error('HTTP 500');
      return newDriver(p);
    });
    const { container, getAllByText } = page(<DriverEarnings />);
    await settle();
    expect(container.textContent).toContain("We couldn't load your earnings.");
    expect(container.textContent).toContain('₹0.00'); // ready to withdraw and the chart still load
    fail = false;
    await act(async () => { fireEvent.click(getAllByText('Try again')[0]); });
    await settle();
    expect(container.textContent).not.toContain("We couldn't load your earnings.");
    expect(container.querySelectorAll('[data-line]')).toHaveLength(5);
  });

  it('a request that never answers is an error after ten seconds, not endless loading', async () => {
    vi.useFakeTimers();
    api.get.mockImplementation((p: string) => (p.startsWith('/driver/earnings/period/') ? new Promise(() => {}) : Promise.resolve(newDriver(p))));
    const { container } = page(<DriverDashboard />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(container.querySelector('.askel')).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(container.textContent).toContain("We couldn't load your earnings.");
    expect(container.textContent).not.toMatch(PLACEHOLDER);
  });
});
