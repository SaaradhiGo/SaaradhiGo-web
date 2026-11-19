/**
 * USA follow-ups (owner, 14 Nov):
 *   1.3 search says "Searching…" while it waits and "Can't search right now. Try again" on failure;
 *   1.4 "See fares" with text typed but not chosen stays and says "Choose a place from the list";
 *   1.5 public content follows the market: USA Standard and XL, a Treasure Valley example in USD.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
let search: () => Promise<unknown>;
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => '/' }));
vi.mock('@/lib/serviceAreas', () => ({
  fetchServiceAreas: async () => [
    { zone: { code: 'US-ID-TV', name: 'Treasure Valley', country: 'US' }, centre: { lat: 43.6, lng: -116.3 } },
  ],
  primaryArea: (areas: { centre: unknown }[]) => areas[0] ?? null,
}));
vi.mock('@/lib/booking', () => ({
  serviceabilityAt: async () => ({ serviceable: true, zone: null, vehicle_types: [] }),
  searchPlaces: () => search(),
  placeToPoint: async () => ({ lat: 43.6, lng: -116.2 }),
}));

import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LegalProvider } from '@/components/sg/LegalProvider';
import { HeroBooking } from './HeroBooking';
import { ExampleLines, ExampleTag } from '@/components/sg/ExampleRequest';
import { RideContent } from '@/components/pages/RideContent';
import { HomeContent } from './HomeContent';

function at(market: 'IN' | 'US', ui: React.ReactNode) {
  return render(
    <LocaleProvider initialLanguage="en">
      <LegalProvider initialMarket={market} decided>{ui}</LegalProvider>
    </LocaleProvider>,
  );
}

async function type(id: string, text: string, waitMs = 400) {
  const input = document.getElementById(id) as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  await act(async () => { vi.advanceTimersByTime(waitMs); await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => { push.mockReset(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('1.3 the search is never silent', () => {
  it('says "Searching…" while it waits', async () => {
    search = () => new Promise(() => {});
    at('US', <HeroBooking />);
    await type('hp-pickup', 'Boise State');
    expect(screen.getByTestId('search-status').textContent).toBe('Searching…');
  });

  it('says it cannot search, with Try again, when the lookup fails or hangs', async () => {
    search = () => Promise.reject(Object.assign(new Error('x'), { status: 502 }));
    at('US', <HeroBooking />);
    await type('hp-pickup', 'Boise State');
    expect(screen.getByTestId('search-status').textContent).toContain("Can't search right now.");
    let n = 0;
    search = async () => { n += 1; return [{ description: 'Boise State University, Boise, ID, USA', place_id: 'b' }]; };
    await act(async () => { fireEvent.click(screen.getByTestId('search-retry')); vi.advanceTimersByTime(400); await Promise.resolve(); await Promise.resolve(); });
    expect(n).toBe(1);
  });

  it('a hang ends after 8 s with the same message', async () => {
    search = () => new Promise(() => {});
    at('US', <HeroBooking />);
    await type('hp-pickup', 'Boise State');
    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
    expect(screen.getByTestId('search-status').textContent).toContain("Can't search right now.");
  });
});

describe('1.4 typed but not chosen', () => {
  it('stays on the page and says "Choose a place from the list" under each field', async () => {
    search = async () => [];
    at('US', <HeroBooking />);
    await type('hp-pickup', 'Boise State');
    await type('hp-dest', 'Meridian');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'See fares' })); await Promise.resolve(); });
    expect(push).not.toHaveBeenCalled();
    expect(screen.getAllByText('Choose a place from the list')).toHaveLength(2);
  });
});

describe('1.5 public content follows the market', () => {
  it('USA: the example is Treasure Valley in USD, a Standard', () => {
    at('US', <><ExampleTag /><ExampleLines fare="Trip fare" commission="Commission" earn="You earn" /></>);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Standard, Treasure Valley');
    expect(text).toContain('$26.14');
    // 19 Nov (owner): Treasure Valley shows no platform fee; the driver keeps the fare.
    expect(text).toContain('None');
    expect(text).not.toContain('15%');
    expect(text).not.toMatch(/₹|Hyderabad|Auto/);
  });

  it('India keeps the Hyderabad example in rupees', () => {
    at('IN', <><ExampleTag /><ExampleLines fare="Trip fare" commission="Commission" earn="You earn" /></>);
    const text = document.body.textContent ?? '';
    expect(text).toContain('₹183');
    // 19 Nov (owner): the Hyderabad plan, Rs 10 a trip, at most Rs 149 a day; no commission.
    expect(text).toContain('−₹10');
    expect(text).toContain('₹173');
    expect(text).toContain('₹10 a trip, at most ₹149 a day');
    // 19 Nov (owner): whole rupees in marketing, never '₹10.00'.
    expect(text).not.toMatch(/₹[0-9,]+\.00/);
    expect(text).not.toContain('15%');
  });

  it('the Ride page ticket shows the USA example in dollars', () => {
    at('US', <RideContent />);
    expect(screen.getByTestId('example-fare').textContent).toContain('$26.14');
    expect(document.body.textContent).not.toMatch(/₹|Hyderabad/);
  });

  it('the home map shows a Boise trip in the USA, never an Auto', async () => {
    at('US', <HomeContent />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    const text = document.body.textContent ?? '';
    expect(text).toContain('The Village at Meridian');
    expect(text).not.toMatch(/Auto|Charminar/);
  });
});
