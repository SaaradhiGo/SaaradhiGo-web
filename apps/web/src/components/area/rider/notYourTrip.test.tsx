/**
 * Someone else's trip (13 Nov): the server answers 404, and the page says "This trip isn't on your
 * account" with a link to Your trips -- never another trip's live state, never Try again.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';

vi.mock('next/navigation', () => ({
  usePathname: () => '/ride/trip/207',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const notFound = Object.assign(new Error('Trip not found.'), { status: 404 });
vi.mock('@/lib/area/api', () => ({
  areaToken: async () => 'token',
  areaGet: async () => { throw notFound; },
  areaPost: async () => { throw notFound; },
  endAreaSession: async () => {},
}));
vi.mock('@/lib/booking', async (orig) => ({
  ...(await orig<object>()),
  RideSocket: class { open() {} close() {} },
}));

afterEach(() => cleanup());

async function settle() {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
}

describe("a trip that isn't yours", () => {
  it('the live trip page says so, with Your trips and nothing about the trip', async () => {
    const { RideTrip } = await import('./RideTrip');
    render(<LocaleProvider><RideTrip id="207" /></LocaleProvider>);
    await settle();
    expect(screen.getByText("This trip isn't on your account")).toBeTruthy();
    expect(screen.getByText('Your trips').getAttribute('href')).toBe('/trips');
    expect(screen.queryByText(/Finding your driver/)).toBeNull();
    expect(screen.queryByText(/cancel for free/i)).toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('the receipt page says so, without Try again', async () => {
    const { RiderReceipt } = await import('./RiderReceipt');
    render(<LocaleProvider><RiderReceipt id="207" /></LocaleProvider>);
    await settle();
    expect(screen.getByText("This trip isn't on your account")).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen.queryByText(/couldn.t load this receipt/i)).toBeNull();
  });
});
