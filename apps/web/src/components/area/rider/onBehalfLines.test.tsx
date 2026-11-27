/**
 * Trip charges step 2 (27 Nov): tolls and airport fees sit under "Collected on behalf of others", each
 * saying whom it is collected for; waiting is a fare line, and the quote says it goes to the driver.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LegalProvider } from '@/components/sg/LegalProvider';
import { FareLinesList } from './FareLinesList';
import { FareWorkings } from './FareWorkings';

afterEach(() => cleanup());

const LINES = {
  lines: [{ code: 'base', label: 'Base fare', amount: '60' }, { code: 'distance_time', label: 'Distance and time', amount: '540' },
    { code: 'waiting', label: 'Waiting (6 min after 3 free)', amount: '12' }],
  taxable: null, tax: { label: 'GST', percent: '0', amount: '0', included: true }, tax_shown: false,
  extras: [{ code: 'trip_extra', label: 'Toll (estimated): Outer Ring Road', amount: '48', on_behalf: true,
    note: 'Collected on behalf of the toll operator. Your driver pays it at the plaza.' },
  { code: 'trip_extra', label: 'Airport pickup fee (RGIA)', amount: '150', on_behalf: true,
    note: 'Collected on behalf of the airport. Your driver pays it at the gate.' }],
  on_behalf_title: 'Collected on behalf of others', total: '810', currency: 'INR',
};
const wrap = (el: React.ReactNode) => render(<LocaleProvider initialLanguage="en"><LegalProvider initialMarket="IN" decided>{el}</LegalProvider></LocaleProvider>);

describe('trip extras on the rider breakdown', () => {
  it('groups the pass-through lines with whom each is collected for', () => {
    wrap(<FareLinesList lines={LINES} />);
    expect(document.body.textContent).toContain('Collected on behalf of others');
    const rows = screen.getAllByTestId('fare-lines-on-behalf').map((r) => r.textContent);
    expect(rows[0]).toContain('Toll (estimated): Outer Ring Road');
    expect(rows[0]).toContain('Your driver pays it at the plaza.');
    expect(rows[1]).toContain('at the gate');
    expect(document.body.textContent).toContain('Waiting (6 min after 3 free)');
  });

  it('says on the quote what is inside the locked fare and that waiting goes to the driver', () => {
    wrap(<FareWorkings quote={{ estimated_fare: '798', currency: 'INR', fare_lines: LINES,
      waiting_terms: { free_minutes: 3, per_minute_minor: 200, words: '' } }} />);
    expect(screen.getByTestId('fare-on-behalf').textContent).toContain('198');
    expect(screen.getByTestId('fare-waiting').textContent).toContain('first 3 min are free');
    expect(screen.getByTestId('fare-waiting').textContent).toContain('goes to your driver');
  });
});
