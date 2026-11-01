import { describe, expect, it } from 'vitest';
import {
  CHART_DEFAULT, MAX_RANGE_DAYS, chartableColumns, currenciesOf, exportPath, filtersFromParams,
  filtersToQuery, formatCell, formatMinor, granularityNote, groupWord, niceScale, pivot,
  presetRange, rangeDays, rangeProblem, reportPath, rowsOfCurrency, secondsWords, shiftDate,
  stackMax, sumByCurrency, type Row,
} from './reports';

describe('the date range', () => {
  it('accepts a normal range and the 400 day limit exactly', () => {
    expect(rangeProblem('2026-10-01', '2026-10-31')).toBeNull();
    const from = '2025-09-27';
    expect(rangeDays(from, '2026-10-31')).toBe(MAX_RANGE_DAYS);
    expect(rangeProblem(from, '2026-10-31')).toBeNull();
  });

  it('refuses 401 days, an inverted range and missing dates, in words', () => {
    expect(rangeProblem('2025-09-26', '2026-10-31')).toBe('Choose at most 400 days.');
    expect(rangeProblem('2026-10-10', '2026-10-01')).toBe('The end date is before the start date.');
    expect(rangeProblem('', '2026-10-01')).toBe('Pick both dates.');
    expect(rangeProblem('yesterday', '2026-10-01')).toBe('Pick both dates.');
  });

  it('builds presets that end today and are valid', () => {
    const r = presetRange(30, '2026-10-31');
    expect(r).toEqual({ from: '2026-10-02', to: '2026-10-31' });
    expect(rangeProblem(r.from, r.to)).toBeNull();
    expect(rangeDays(presetRange(365, '2026-10-31').from, '2026-10-31')).toBe(365);
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('granularity', () => {
  it('warns about unreadable combinations without refusing them', () => {
    expect(granularityNote('day', '2026-01-01', '2026-10-31')).toMatch(/daily points/);
    expect(granularityNote('month', '2026-10-01', '2026-10-10')).toMatch(/Under a month/);
    expect(granularityNote('week', '2026-01-01', '2026-10-31')).toBeNull();
    expect(granularityNote('day', '2026-10-01', '2026-10-31')).toBeNull();
  });

  it('round-trips through the URL, falling back to day for a bad value', () => {
    const fb = { from: '2026-10-02', to: '2026-10-31' };
    const get = (m: Record<string, string>) => (k: string) => m[k] ?? null;
    const f = filtersFromParams(get({ granularity: 'week', city: 'IN-TG-HYD', group_by: 'city' }), fb, 'none');
    expect(f).toMatchObject({ granularity: 'week', city: 'IN-TG-HYD', group: 'city', from: fb.from });
    expect(filtersFromParams(get({ granularity: 'year' }), fb, 'vehicle').granularity).toBe('day');
    expect(filtersFromParams(get({}), fb, 'vehicle').group).toBe('vehicle');
    expect(filtersToQuery(f)).toBe('from=2026-10-02&to=2026-10-31&granularity=week&city=IN-TG-HYD&group_by=city');
    expect(reportPath('trips', f)).toBe(`/reports/admin/trips/?${filtersToQuery(f)}`);
    expect(exportPath('trips', f)).toBe(`/reports/admin/trips/export/?${filtersToQuery(f)}`);
  });
});

describe('money is per currency and never summed across currencies', () => {
  const rows = [
    { period: '2026-10-01', currency: 'INR', gmv_minor: 100_000, trips: 3 },
    { period: '2026-10-02', currency: 'INR', gmv_minor: 50_000, trips: 2 },
    { period: '2026-10-01', currency: 'USD', gmv_minor: 3_000, trips: 1 },
  ];

  it('keeps one bucket per currency', () => {
    const totals = sumByCurrency(rows, ['gmv_minor', 'trips']);
    expect(totals).toEqual([
      { currency: 'INR', gmv_minor: 150_000, trips: 5 },
      { currency: 'USD', gmv_minor: 3_000, trips: 1 },
    ]);
    // There is no number anywhere that is 153,000.
    expect(totals.some((t) => t.gmv_minor === 153_000)).toBe(false);
  });

  it('groups a row with no currency as unknown, not into a rupee bucket', () => {
    const t = sumByCurrency([...rows, { period: '2026-10-03', gmv_minor: 7 }], ['gmv_minor']);
    expect(t.map((b) => b.currency)).toEqual(['INR', 'USD', 'unknown']);
    expect(t[0].gmv_minor).toBe(150_000);
  });

  it('draws one panel per currency from the rows', () => {
    const body = { rows: rows as Row[], totals: [{ currency: 'INR' }, { currency: 'USD' }] };
    expect(currenciesOf(body)).toEqual(['INR', 'USD']);
    expect(rowsOfCurrency(rows as Row[], 'USD')).toHaveLength(1);
    expect(currenciesOf({ rows: [], totals: [{ trips: 0 }] })).toEqual([]);
  });

  it('formats each currency with its own grouping (no en-IN lakh grouping on dollars)', () => {
    expect(formatMinor(123_456_750, 'INR')).toBe('₹12,34,567.50');
    expect(formatMinor(123_456_750, 'USD')).toBe('$1,234,567.50');
    expect(formatCell({ key: 'm', label: 'm', type: 'money' }, 123_456_750, 'USD')).toBe('$1,234,567.50');
  });
});

describe('cells', () => {
  it('writes each type and never turns a missing value into a zero', () => {
    const c = (type: 'count' | 'percent' | 'seconds' | 'hours' | 'km' | 'minutes') => ({ key: 'x', label: 'x', type });
    expect(formatCell(c('count'), 12345)).toBe('12,345');
    expect(formatCell(c('percent'), 66.666)).toBe('66.7%');
    expect(formatCell(c('seconds'), 252)).toBe('4 min 12 s');
    expect(formatCell(c('hours'), 9)).toBe('9 h');
    expect(formatCell(c('km'), 12.34)).toBe('12.3 km');
    expect(formatCell(c('count'), null)).toBe('—');
    expect(formatCell(c('count'), 0)).toBe('0');
    expect(secondsWords(45)).toBe('45 s');
    expect(secondsWords(3720)).toBe('1 h 2 min');
  });
});

describe('chart data', () => {
  const rows: Row[] = [
    { period: '2026-10-01', vehicle: 'sedan', v: 10 },
    { period: '2026-10-01', vehicle: 'auto', v: 4 },
    { period: '2026-10-02', vehicle: 'sedan', v: 6 },
  ];

  it('pivots into periods by series, keeping each entity in first-seen order', () => {
    const p = pivot(rows, 'v', 'All');
    expect(p.periods).toEqual(['2026-10-01', '2026-10-02']);
    expect(p.series).toEqual([
      { name: 'sedan', values: [10, 6] }, { name: 'auto', values: [4, null] },
    ]);
    expect(stackMax(p)).toBe(14);
  });

  it('uses one fallback series when there is no group, and a city group when it is a city', () => {
    expect(pivot([{ period: '2026-10-01', v: 3 }], 'v', 'All').series[0].name).toBe('All');
    expect(pivot([{ period: '2026-10-01', city: 'IN-TG-HYD', v: 3 }], 'v', 'All').series[0].name).toBe('IN-TG-HYD');
  });

  it('chooses round axis ceilings', () => {
    expect(niceScale(14).top).toBe(15);
    expect(niceScale(0)).toEqual({ top: 1, ticks: [0, 1] });
    const s = niceScale(23_400);
    expect(s.top).toBeGreaterThanOrEqual(23_400);
    expect(s.ticks[0]).toBe(0);
  });

  it('draws counts and money but not percentages, and has a default metric per report', () => {
    const cols = [
      { key: 'a', label: 'a', type: 'count' as const }, { key: 'b', label: 'b', type: 'percent' as const },
      { key: 'c', label: 'c', type: 'money' as const }, { key: 'd', label: 'd', type: 'seconds' as const },
    ];
    expect(chartableColumns(cols).map((c) => c.key)).toEqual(['a', 'c']);
    expect(CHART_DEFAULT.revenue).toBe('rider_paid_minor');
    expect(groupWord('unattributed')).toBe('Not vehicle-specific');
    expect(groupWord('sedan')).toBe('sedan');
  });
});
