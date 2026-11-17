/**
 * PROD round 1 (17 Nov): with no city live, Book says launching soon and links to the fares,
 * in both markets, never a Book button; once a city is live the Book button is back.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let zones: { code: string; country: string; city_status?: string }[] = [];
vi.mock('@/lib/markets', () => ({ fetchZones: async () => zones }));

import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LegalProvider } from '@/components/sg/LegalProvider';
import { RideContent } from './RideContent';

async function at(market: 'IN' | 'US') {
  render(
    <LocaleProvider initialLanguage="en">
      <LegalProvider initialMarket={market} decided><RideContent /></LegalProvider>
    </LocaleProvider>,
  );
  await act(async () => { await Promise.resolve(); });
}

afterEach(cleanup);

describe('Book before launch', () => {
  it.each(['IN', 'US'] as const)('%s: launching soon and the fares, no Book button', async (market) => {
    zones = [{ code: 'IN-TG-HYD', country: 'IN', city_status: 'soon' }];
    await at(market);
    expect(screen.getByTestId('launching-soon').textContent).toContain("We're launching soon");
    expect(screen.getByRole('link', { name: 'See the fares' }).getAttribute('href')).toBe('/fares');
    expect(screen.queryByRole('link', { name: 'Book a ride' })).toBeNull();
  });

  it('a live city brings the Book button back', async () => {
    zones = [{ code: 'IN-TG-HYD', country: 'IN', city_status: 'live' }];
    await at('IN');
    expect(screen.getByRole('link', { name: 'Book a ride' }).getAttribute('href')).toBe('/ride/choose');
    expect(screen.queryByTestId('launching-soon')).toBeNull();
  });
});
