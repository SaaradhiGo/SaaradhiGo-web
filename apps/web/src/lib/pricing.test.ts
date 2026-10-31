/**
 * The pricing helpers: the matrix grid, the draft checks, the driver-earnings
 * preview and the rider-fare preview. Pure functions, no network.
 */
import { describe, expect, it } from 'vitest';
import {
  FARE_FIELDS, capWords, cardBody, daysBetween, draftBody, fareChangeText, fareChanges, fareProblem, gridOf,
  isIncrease, noticeWords, pct, previewGrid, previewLines, previewSentence, ruleProblem, unconfiguredCells,
  valuesOf, type CountryConfig, type EarningsPreview, type FarePreviewRow, type FareValues, type MatrixRow,
} from './pricing';

const row = (over: Partial<MatrixRow>): MatrixRow => ({
  country: 'IN', city: 'IN-TG-HYD', city_name: 'Hyderabad', vehicle_type: 1, vehicle_type_name: 'sedan',
  percent: '15.00', source: 'country default', rule_id: 1, version: 1, effective_from: '2026-10-30T10:00:00Z',
  next_change: null, ...over,
});

const CFG: CountryConfig = {
  country: 'IN', configured: true, notice_days: 7, max_percent: null, cap_status: 'cap not confirmed (legal)',
  version: 1, updated_at: null, updated_by: '',
};

describe('the matrix grid', () => {
  const rows = [
    row({}),
    row({ vehicle_type: 2, vehicle_type_name: 'auto', percent: '12.00', source: 'vehicle-class override' }),
    row({ city: 'IN-AP-VJA', city_name: 'Vijayawada', percent: null, source: null, rule_id: null, version: null }),
    row({ country: 'US', city: 'US-TX-AUS', city_name: 'Austin' }),
  ];

  it('lists the cities and classes of a country once, in the order they come', () => {
    const g = gridOf(rows, 'IN');
    expect(g.cities.map((c) => c.code)).toEqual(['IN-TG-HYD', 'IN-AP-VJA']);
    expect(g.classes.map((c) => c.name)).toEqual(['sedan', 'auto']);
    expect(g.cell('IN-TG-HYD', 2)?.percent).toBe('12.00');
    expect(g.cell('IN-AP-VJA', 2)).toBeNull();
  });

  it('never mixes countries', () => {
    expect(gridOf(rows, 'US').cities.map((c) => c.code)).toEqual(['US-TX-AUS']);
  });

  it('counts the cells with no rule: a city the readiness checklist will refuse', () => {
    expect(unconfiguredCells(rows, 'IN')).toBe(1);
    expect(unconfiguredCells(rows, 'US')).toBe(0);
  });
});

describe('words', () => {
  it('admits when the cap is not confirmed', () => {
    expect(capWords(CFG)).toBe('cap not confirmed (legal)');
    expect(capWords({ ...CFG, max_percent: '20.00' })).toBe('cap 20%');
    expect(capWords(null)).toBe('cap not confirmed (legal)');
  });
  it('says the notice period', () => {
    expect(noticeWords(7)).toBe('7 days notice for an increase');
    expect(noticeWords(1)).toBe('1 day notice for an increase');
    expect(noticeWords(0)).toBe('no notice period');
  });
  it('prints a rate without trailing zeros', () => {
    expect(pct('15.00')).toBe('15%');
    expect(pct('12.50')).toBe('12.5%');
    expect(pct(null)).toBe('—');
  });
  it('counts days up', () => {
    expect(daysBetween('2026-10-30T00:00:00Z', '2026-11-06T00:00:01Z')).toBe(8);
  });
});

describe('a commission draft', () => {
  const ok = { percent: '15', effectiveFrom: '', reason: 'Owner ruling' };
  const now = new Date('2026-10-30T10:00:00Z');

  it('accepts a plain rate with a reason', () => {
    expect(ruleProblem(ok, CFG)).toBeNull();
  });
  it('refuses a non-number, a rate out of range and a missing reason', () => {
    expect(ruleProblem({ ...ok, percent: 'fifteen' }, CFG)).toMatch(/number/);
    expect(ruleProblem({ ...ok, percent: '101' }, CFG)).toMatch(/between 0 and 100/);
    expect(ruleProblem({ ...ok, percent: '15.555' }, CFG)).toMatch(/number/);
    expect(ruleProblem({ ...ok, reason: 'x' }, CFG)).toMatch(/why/i);
  });
  it('refuses a rate above the cap, only when a cap is set', () => {
    expect(ruleProblem({ ...ok, percent: '25' }, CFG)).toBeNull();
    expect(ruleProblem({ ...ok, percent: '25' }, { ...CFG, max_percent: '20.00' }))
      .toMatch(/above this country's cap of 20%/);
    expect(ruleProblem({ ...ok, percent: '20' }, { ...CFG, max_percent: '20.00' })).toBeNull();
  });
  it('holds an increase to the notice period, and lets a decrease start at once', () => {
    const soon = { ...ok, percent: '18', effectiveFrom: '2026-10-31T10:00:00Z' };
    expect(ruleProblem(soon, CFG, { increase: true, now })).toMatch(/7 days notice/);
    expect(ruleProblem({ ...soon, effectiveFrom: '2026-11-06T09:00:00Z' }, CFG, { increase: true, now }))
      .toMatch(/7 days/);
    expect(ruleProblem({ ...soon, effectiveFrom: '2026-11-07T10:00:00Z' }, CFG, { increase: true, now })).toBeNull();
    expect(ruleProblem({ ...soon, percent: '12' }, CFG, { increase: false, now })).toBeNull();
  });
  it('knows an increase from a decrease', () => {
    expect(isIncrease('15.00', '18')).toBe(true);
    expect(isIncrease('15.00', '12')).toBe(false);
    expect(isIncrease('15.00', '15')).toBe(false);
    expect(isIncrease(null, '18')).toBe(false);
  });
  it('builds the body without blank optional fields', () => {
    expect(draftBody({ country: 'IN', city: '', vehicleType: '' }, ok)).toEqual({
      country: 'IN', kind: 'percentage', percent: '15', reason: 'Owner ruling',
    });
    const full = draftBody({ country: 'IN', city: 'IN-TG-HYD', vehicleType: '2' },
      { ...ok, effectiveFrom: '2026-11-10T09:00' });
    expect(full).toMatchObject({ city: 'IN-TG-HYD', vehicle_type: 2 });
    expect(typeof full.effective_from).toBe('string');
  });
});

describe('the driver-earnings preview', () => {
  const rule = {} as EarningsPreview['rule'];
  const base: EarningsPreview = {
    window_days: 30, since: '', percent: '12.00', note: '', increase: false, notice_days: 7, rule,
    by_currency: {
      USD: { trips_affected: 4, drivers_affected: 2, total_change_minor: 600, average_change_minor: 150 },
      INR: { trips_affected: 10, drivers_affected: 3, total_change_minor: -12_000, average_change_minor: -1_200 },
    },
  };

  it('is one line per currency, sorted, never added across currencies', () => {
    const lines = previewLines(base);
    expect(lines.map((l) => l.currency)).toEqual(['INR', 'USD']);
    expect(lines[1].total).toContain('$6.00');
    expect(lines[0].total).toContain('₹120.00');
    expect(lines[0].direction).toBe('less');
    expect(lines[1].direction).toBe('more');
  });

  it('says trips, drivers and the change in words', () => {
    const [inr, usd] = previewLines(base);
    expect(previewSentence(usd, 30)).toContain('4 trips by 2 drivers');
    expect(previewSentence(usd, 30)).toContain('more in total');
    expect(previewSentence(inr, 30)).toContain('10 trips by 3 drivers');
    expect(previewSentence(inr, 30)).toContain('less in total');
  });

  it('is empty when nothing was settled in scope', () => {
    expect(previewLines({ ...base, by_currency: {} })).toEqual([]);
  });

  it('reads no change as no change', () => {
    const [line] = previewLines({
      ...base,
      by_currency: { INR: { trips_affected: 1, drivers_affected: 1, total_change_minor: 0, average_change_minor: 0 } },
    });
    expect(line.direction).toBe('same');
    expect(previewSentence(line, 30)).toContain('no change in driver earnings');
  });
});

describe('a fare card draft', () => {
  const card: FareValues = {
    base_fare: '30.00', per_km_fare: '12.00', per_min_fare: '2.00', min_fare: '50.00',
    night_surge_multiplier: '1.25', night_surge_start_hour: '23', night_surge_end_hour: '5',
    surge_cap_multiplier: '1.50', gst_percent: '5.000',
  };

  it('keeps only the fare fields from a card row', () => {
    const full = { ...card, id: 9, version: 2, is_active: true, notes: 'x' } as never;
    expect(Object.keys(valuesOf(full))).toEqual(FARE_FIELDS.map((f) => f.key));
  });

  it('lists only what changed, comparing numbers not strings', () => {
    expect(fareChanges(card, { ...card, base_fare: '30' })).toEqual([]);
    expect(fareChanges(card, { ...card, per_km_fare: '13.50' })).toEqual([
      { key: 'per_km_fare', label: 'Per km', from: 12, to: 13.5 }]);
  });

  it('refuses a blank, a non-number, a cap under 1, bad night hours, no change and no reason', () => {
    const why = 'Quarterly review';
    expect(fareProblem({ ...card, base_fare: '' }, why, card)).toMatch(/Base fare/);
    expect(fareProblem({ ...card, per_km_fare: 'abc' }, why, card)).toMatch(/Per km/);
    expect(fareProblem({ ...card, surge_cap_multiplier: '0.90' }, why, card)).toMatch(/below 1/);
    expect(fareProblem({ ...card, night_surge_end_hour: '25' }, why, card)).toMatch(/0 to 23/);
    expect(fareProblem(card, why, card)).toMatch(/Nothing differs/);
    expect(fareProblem({ ...card, base_fare: '35' }, 'x', card)).toMatch(/why/i);
    expect(fareProblem({ ...card, base_fare: '35' }, why, card)).toBeNull();
    // a first card has nothing to differ from
    expect(fareProblem(card, why, null)).toBeNull();
  });

  it('builds the request body from the draft', () => {
    const body = cardBody({ ...card, base_fare: ' 35 ' }, ' Review ', '');
    expect(body).toMatchObject({ base_fare: '35', reason: 'Review' });
    expect(body).not.toHaveProperty('effective_from');
    expect(typeof cardBody(card, 'r', '2026-11-01T08:00').effective_from).toBe('string');
  });
});

describe('the rider-fare preview', () => {
  const rows: FarePreviewRow[] = [
    { distance_km: 8, minutes: 24, period: 'night', old_minor: 20_000, new_minor: 22_000, change_minor: 2_000, night_applied: true },
    { distance_km: 3, minutes: 9, period: 'off_peak', old_minor: 10_000, new_minor: 10_000, change_minor: 0, night_applied: false },
    { distance_km: 3, minutes: 9, period: 'night', old_minor: 12_500, new_minor: 12_000, change_minor: -500, night_applied: true },
    { distance_km: 8, minutes: 24, period: 'off_peak', old_minor: 16_000, new_minor: 16_000, change_minor: 0, night_applied: false },
  ];

  it('is one row per distance, shortest first, off-peak beside night', () => {
    const g = previewGrid(rows);
    expect(g.map((r) => r.distance_km)).toEqual([3, 8]);
    expect(g[0].off_peak?.period).toBe('off_peak');
    expect(g[0].night?.period).toBe('night');
  });

  it('shows old, new and the change in the zone currency', () => {
    expect(fareChangeText(rows[0], 'INR')).toContain('₹200.00');
    expect(fareChangeText(rows[0], 'INR')).toContain('₹220.00');
    expect(fareChangeText(rows[0], 'INR')).toContain('₹20.00');
    expect(fareChangeText(rows[1], 'INR')).toContain('no change');
    expect(fareChangeText(rows[2], 'USD')).toContain('$125.00');
    expect(fareChangeText(rows[2], 'USD')).toContain('$5.00');
    expect(fareChangeText(null, 'INR')).toBe('—');
  });

  it('shows just the fare when there is no old card', () => {
    expect(fareChangeText({ ...rows[0], old_minor: null, change_minor: null }, 'INR')).toBe('₹220.00');
  });
});
