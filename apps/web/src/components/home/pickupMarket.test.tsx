/**
 * The pickup point decides the market (owner, 14 Nov): the home search is no longer held inside
 * one city's zone, it sends the header's country to rank results, and a pickup outside every
 * zone says "We're not in this area yet".
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const calls: unknown[][] = [];
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/serviceAreas', () => ({
  fetchServiceAreas: async () => [
    { zone: { code: 'IN-TG-HYD', name: 'Hyderabad', country: 'IN' }, centre: { lat: 17.385, lng: 78.4867 } },
    { zone: { code: 'US-ID-TV', name: 'Treasure Valley', country: 'US' }, centre: { lat: 43.6, lng: -116.3 } },
  ],
  primaryArea: (areas: { centre: unknown }[]) => areas[0] ?? null,
}));
vi.mock('@/lib/booking', () => ({
  serviceabilityAt: async () => ({ serviceable: false, zone: null, vehicle_types: [] }),
  searchPlaces: async (...args: unknown[]) => {
    calls.push(args);
    return [{ description: 'Boise State University, Boise, ID, USA', place_id: 'boise',
      structured_formatting: { main_text: 'Boise State University', secondary_text: 'Boise, ID, USA' } }];
  },
  placeToPoint: async () => ({ lat: 43.6, lng: -116.2 }),
}));

import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LegalProvider } from '@/components/sg/LegalProvider';
import { HeroBooking } from './HeroBooking';

async function typePickup(market: 'IN' | 'US') {
  calls.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  render(
    <LocaleProvider initialLanguage="en">
      <LegalProvider initialMarket={market} decided>
        <HeroBooking />
      </LegalProvider>
    </LocaleProvider>,
  );
  await act(async () => { await Promise.resolve(); });
  const input = document.getElementById('hp-pickup') as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Boise State University' } });
  await act(async () => { vi.advanceTimersByTime(400); await Promise.resolve(); });
  vi.useRealTimers();
}

afterEach(cleanup);

describe('home search across markets', () => {
  it('searches without a zone and ranks from the header country (India)', async () => {
    await typePickup('IN');
    const last = calls.at(-1)!;
    expect(last[0]).toBe('Boise State University');
    expect(last[3]).toBeNull();                      // no zone restriction
    expect(last[4]).toBe('IN');                      // the header's country
    expect(last[1]).toEqual({ lat: 17.385, lng: 78.4867 });
  });

  it('with the USA chosen, ranks from Treasure Valley', async () => {
    await typePickup('US');
    const last = calls.at(-1)!;
    expect(last[4]).toBe('US');
    expect(last[1]).toEqual({ lat: 43.6, lng: -116.3 });
  });

  it('a pickup outside every zone says "We\'re not in this area yet"', async () => {
    await typePickup('IN');
    const option = (await screen.findByText('Boise State University')).closest('button')!;
    await act(async () => { fireEvent.click(option); });
    expect(await screen.findByText("We're not in this area yet.")).toBeTruthy();
  });
});
