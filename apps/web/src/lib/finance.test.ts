import { describe, expect, it } from 'vitest';
import type { AdminAccess } from './adminScope';
import {
  EMPTY_FILTERS, MAX_RANGE_DAYS, ageLabel, apiPath, canActOnPayouts, canExport, canResolve,
  cityName, filtersFromSearch, filtersToQuery, formatMinor, groupByCurrency, isDate, payoutTone,
  presetRange, rangeDays, rangeProblem, shiftDate, signedMoney, activeFilterCount,
} from './finance';

describe('totals are grouped by currency, never summed across them', () => {
  const rows = [
    { currency: 'INR', gross: 100_000, net: 80_000 },
    { currency: 'USD', gross: 3_000, net: 2_400 },
    { currency: 'INR', gross: 50_000, net: 40_000 },
    { currency: 'usd', gross: 1_000, net: 800 },
  ];

  it('gives one bucket per currency, sorted by code', () => {
    const totals = groupByCurrency(rows, ['gross', 'net'] as const, (r, c) => r[c]);
    expect(totals.map((t) => t.currency)).toEqual(['INR', 'USD']);
  });

  it('adds within a currency only', () => {
    const [inr, usd] = groupByCurrency(rows, ['gross', 'net'] as const, (r, c) => r[c]);
    expect(inr).toMatchObject({ currency: 'INR', count: 2, gross: 150_000, net: 120_000 });
    expect(usd).toMatchObject({ currency: 'USD', count: 2, gross: 4_000, net: 3_200 });
  });

  it('has no figure that is the sum of two currencies', () => {
    const totals = groupByCurrency(rows, ['gross'] as const, (r, c) => r[c]);
    const everyGross = totals.map((t) => t.gross);
    expect(everyGross).not.toContain(154_000);
    expect(everyGross.reduce((a, b) => a + b, 0)).toBe(154_000); // only a caller adds them; the helper never does
  });

  it('keeps an amount of no known currency apart from every real one', () => {
    const totals = groupByCurrency(
      [{ currency: 'INR', gross: 1 }, { currency: null, gross: 5 }, {}] as Array<{ currency?: string | null; gross: number }>,
      ['gross'] as const, (r) => r.gross ?? 0);
    expect(totals.map((t) => [t.currency, t.gross])).toEqual([['INR', 1], ['unknown', 5]]);
  });

  it('ignores a value that is not a finite number', () => {
    const [t] = groupByCurrency([{ currency: 'INR', gross: Number.NaN }, { currency: 'INR', gross: 7 }],
      ['gross'] as const, (r) => r.gross);
    expect(t.gross).toBe(7);
    expect(t.count).toBe(2);
  });

  it('is empty for no rows', () => {
    expect(groupByCurrency([], ['gross'] as const, () => 0)).toEqual([]);
  });
});

describe('money is minor units, formatted per currency', () => {
  it('formats each currency in its own locale', () => {
    expect(formatMinor(210_000, 'INR')).toBe('₹2,100.00');
    expect(formatMinor(3_000, 'USD')).toBe('$30.00');
    expect(formatMinor(12_345_678, 'INR')).toBe('₹1,23,456.78');
  });

  it('keeps the paise and the cents', () => {
    expect(formatMinor(50_050, 'INR')).toBe('₹500.50');
    expect(formatMinor(5, 'USD')).toBe('$0.05');
  });

  it('is a dash, not a zero, for no amount', () => {
    expect(formatMinor(null, 'INR')).toBe('—');
    expect(formatMinor(undefined, 'USD')).toBe('—');
  });

  it('signs a ledger movement', () => {
    expect(signedMoney(50_000, 'INR')).toBe('+₹500.00');
    expect(signedMoney(-50_000, 'INR')).toBe('−₹500.00');
    expect(signedMoney(0, 'INR')).toBe('₹0.00');
  });
});

describe('dates and ranges', () => {
  it('recognises a calendar date only', () => {
    expect(isDate('2026-03-04')).toBe(true);
    expect(isDate('2026-3-4')).toBe(false);
    expect(isDate('')).toBe(false);
    expect(isDate(null)).toBe(false);
  });

  it('shifts by calendar days across a month and a leap day', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2028-03-01', -1)).toBe('2028-02-29');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('counts a range inclusively', () => {
    expect(rangeDays('2026-03-01', '2026-03-01')).toBe(1);
    expect(rangeDays('2026-03-01', '2026-03-14')).toBe(14);
  });

  it('builds a preset ending today', () => {
    expect(presetRange(7, '2026-03-10')).toEqual({ from: '2026-03-04', to: '2026-03-10' });
    expect(presetRange(1, '2026-03-10')).toEqual({ from: '2026-03-10', to: '2026-03-10' });
  });

  it('says why a range cannot be sent', () => {
    expect(rangeProblem('2026-03-01', '2026-03-10')).toBeNull();
    expect(rangeProblem('', '2026-03-10')).toMatch(/both dates/);
    expect(rangeProblem('2026-03-10', '2026-03-01')).toMatch(/before/);
    expect(rangeProblem('2026-01-01', '2026-12-31')).toBe(`Choose at most ${MAX_RANGE_DAYS} days.`);
    expect(rangeProblem('2026-01-01', shiftDate('2026-01-01', MAX_RANGE_DAYS - 1))).toBeNull();
  });
});

describe('filters, the URL and the API say the same thing', () => {
  it('round-trips and leaves defaults out', () => {
    const f = filtersFromSearch(new URLSearchParams(
      'from=2026-03-01&to=2026-03-09&status=failed&method=cash&currency=usd&q=%20abc%20&scope=US-TX-AUS&page=3'));
    expect(f).toEqual({
      from: '2026-03-01', to: '2026-03-09', status: 'failed', method: 'cash', currency: 'USD',
      q: 'abc', scope: 'US-TX-AUS', page: 3,
    });
    expect(filtersToQuery(f)).toBe(
      'from=2026-03-01&to=2026-03-09&status=failed&method=cash&currency=USD&q=abc&scope=US-TX-AUS&page=3');
    expect(filtersToQuery(EMPTY_FILTERS)).toBe('');
  });

  it('drops anything malformed instead of guessing', () => {
    const f = filtersFromSearch(new URLSearchParams('from=yesterday&to=2026-13&currency=rupees&page=-2'));
    expect(f).toEqual(EMPTY_FILTERS);
  });

  it('builds the API path with extras and without a first page', () => {
    expect(apiPath('/payments/admin/payouts/', EMPTY_FILTERS, { status: 'failed' }))
      .toBe('/payments/admin/payouts/?status=failed');
    expect(apiPath('/payments/admin/payments/', { ...EMPTY_FILTERS, page: 2, currency: 'INR' }))
      .toBe('/payments/admin/payments/?currency=INR&page=2');
    expect(apiPath('/payments/admin/payments/', EMPTY_FILTERS)).toBe('/payments/admin/payments/');
  });

  it('lets an extra override a filter (a tab is the status)', () => {
    expect(apiPath('/x/', { ...EMPTY_FILTERS, status: 'pending' }, { status: 'failed' })).toBe('/x/?status=failed');
  });

  it('counts the filters that narrow, not the page or the ignored ones', () => {
    const f = { ...EMPTY_FILTERS, from: '2026-03-01', to: '2026-03-02', status: 'failed', page: 4 };
    expect(activeFilterCount(f)).toBe(3);
    expect(activeFilterCount(f, ['from', 'to'])).toBe(1);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });
});

describe('words', () => {
  it('labels how long a payout has waited', () => {
    expect(ageLabel(null)).toBe('—');
    expect(ageLabel(-5)).toBe('—');
    expect(ageLabel(20)).toBe('under a minute');
    expect(ageLabel(5 * 60)).toBe('5 min');
    expect(ageLabel(3 * 3600 + 20 * 60)).toBe('3 h 20 min');
    expect(ageLabel(3 * 3600)).toBe('3 h');
    expect(ageLabel(2 * 86_400 + 4 * 3600)).toBe('2 d 4 h');
  });

  it('never prints "null" for a row with no city', () => {
    expect(cityName(null)).toBe('Unplaced');
    expect(cityName({ name: 'Hyderabad' })).toBe('Hyderabad');
  });

  it('tones the payout statuses', () => {
    expect(payoutTone('completed')).toBe('good');
    expect(payoutTone('failed')).toBe('bad');
    expect(payoutTone('processed')).toBe('wait');
    expect(payoutTone('rejected')).toBe('neutral');
  });
});

describe('who may do what (the server refuses regardless)', () => {
  const access = (permissions: string[]) => ({ permissions } as unknown as AdminAccess);

  it('offers an export only to finance.export', () => {
    expect(canExport(access(['finance.read']))).toBe(false);
    expect(canExport(access(['finance.read', 'finance.export']))).toBe(true);
    expect(canExport(null)).toBe(false);
  });

  it('offers resolving only to finance.adjust and payout actions only to finance.payout', () => {
    expect(canResolve(access(['finance.read']))).toBe(false);
    expect(canResolve(access(['finance.adjust']))).toBe(true);
    expect(canActOnPayouts(access(['finance.read']))).toBe(false);
    expect(canActOnPayouts(access(['finance.payout']))).toBe(true);
  });
});
