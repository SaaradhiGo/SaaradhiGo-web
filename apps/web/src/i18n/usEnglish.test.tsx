/** US English for US riders and drivers; India keeps UK English (owner, 14 Nov). */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LegalProvider } from '@/components/sg/LegalProvider';
import { LocaleProvider } from './LocaleProvider';
import { usEnglish } from './usEnglish';
import { useTr } from './website';

describe('usEnglish', () => {
  it('respells the common UK words and keeps their case', () => {
    expect(usEnglish('Licence, front')).toBe('License, front');
    expect(usEnglish('Your driving licence expires')).toBe('Your driving license expires');
    expect(usEnglish('Trip cancelled. Cancelling is free.')).toBe('Trip canceled. Canceling is free.');
    expect(usEnglish('Colour, centre, favourite, labelled, catalogue, grey')).toBe('Color, center, favorite, labeled, catalog, gray');
    expect(usEnglish('Authorise the check. Authorisation recorded; recognised.')).toBe('Authorize the check. Authorization recorded; recognized.');
    expect(usEnglish('LICENCE')).toBe('LICENSE');
    expect(usEnglish('Tyres and kerb')).toBe('Tires and curb');
  });

  it('leaves words that are already right, or only look similar, alone', () => {
    for (const s of ['Cancellation fee', 'emphasis', 'promise', 'otherwise', 'exercise', 'License plate', 'Licensed', 'licensee']) {
      expect(usEnglish(s)).toBe(s);
    }
  });
});

afterEach(cleanup);

function Probe() {
  const tr = useTr();
  return <span data-testid="p">{tr('Licence number')}</span>;
}

function at(market: 'IN' | 'US') {
  cleanup();
  return render(
    <LocaleProvider initialLanguage="en">
      <LegalProvider initialMarket={market} decided>
        <Probe />
      </LegalProvider>
    </LocaleProvider>,
  ).getByTestId('p').textContent;
}

describe('useTr', () => {
  it('shows US spelling in the USA and UK spelling in India', () => {
    expect(at('US')).toBe('License number');
    expect(at('IN')).toBe('Licence number');
  });
});
