/**
 * The Command Centre's formatting rules, as facts:
 *
 *   * money is one amount per currency, in that currency's own locale, and
 *     nothing here can add rupees to dollars;
 *   * counts follow the country's grouping (lakhs in India);
 *   * a rate with nothing to divide by stays null and is never shown as 0;
 *   * a delta is drawn only when last week's figure makes a comparison
 *     honest, and a rate's delta is in points, not percent-of-percent.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  alertMeasure, alertsPath, delta, formatAge, formatCount, formatDelta, formatMinutes, formatMoneyMinor,
  formatRate, isWindow, localeFor, minorToMajor, moneyTiles, overviewPath,
} from './commandCentre';
import { SCOPE_KEY } from './adminScope';

describe('money', () => {
  it('formats each currency in its own locale from integer minor units', () => {
    expect(formatMoneyMinor(210_000, 'INR')).toBe('₹2,100.00');
    expect(formatMoneyMinor(4_000, 'USD')).toBe('$40.00');
    // Lakh grouping for rupees, thousand grouping for dollars.
    expect(formatMoneyMinor(12_345_678, 'INR')).toBe('₹1,23,456.78');
    expect(formatMoneyMinor(12_345_678, 'USD')).toBe('$123,456.78');
    expect(minorToMajor(150, 'INR')).toBe(1.5);
  });

  it('is null for nothing, not zero', () => {
    expect(formatMoneyMinor(null, 'INR')).toBeNull();
    expect(formatMoneyMinor(undefined, 'USD')).toBeNull();
    expect(formatMoneyMinor(0, 'INR')).toBe('₹0.00');
  });

  it('makes one tile per currency and never a combined one', () => {
    const tiles = moneyTiles({
      INR: { now_minor: 210_000, last_week_minor: 40_000 },
      USD: { now_minor: 4_000, last_week_minor: 0 },
    }, 'Collected');
    expect(tiles.map((t) => t.currency)).toEqual(['INR', 'USD']);
    expect(tiles.map((t) => t.value)).toEqual(['₹2,100.00', '$40.00']);
    expect(tiles.map((t) => t.label)).toEqual(['Collected (INR)', 'Collected (USD)']);
    // INR grew 425 %; USD had nothing last week, so no delta is invented.
    expect(tiles[0].delta?.value).toBe(425);
    expect(tiles[1].delta).toBeNull();
    expect(tiles.some((t) => t.value.includes('₹') && t.value.includes('$'))).toBe(false);
    expect(moneyTiles(undefined, 'Collected')).toEqual([]);
  });
});

describe('counts and rates', () => {
  it('groups by the country', () => {
    expect(localeFor('IN')).toBe('en-IN');
    expect(localeFor('US')).toBe('en-US');
    expect(localeFor('XX')).toBeUndefined();
    expect(formatCount(1_234_567, 'IN')).toBe('12,34,567');
    expect(formatCount(1_234_567, 'US')).toBe('1,234,567');
    expect(formatCount(null, 'IN')).toBeNull();
  });

  it('keeps a zero-denominator rate as null', () => {
    expect(formatRate(20, 'IN')).toBe('20.0%');
    expect(formatRate(42.9, 'US')).toBe('42.9%');
    expect(formatRate(null)).toBeNull();
    expect(formatRate(undefined)).toBeNull();
    expect(formatMinutes(10, 'IN')).toBe('10.0 min');
    expect(formatMinutes(null)).toBeNull();
  });
});

describe('deltas', () => {
  it('compares counts as a percentage of last week', () => {
    expect(delta(10, 5, 'count', 'up')).toEqual({ value: 100, unit: 'pct', good: true });
    expect(delta(3, 4, 'count', 'down')).toEqual({ value: -25, unit: 'pct', good: true });
    expect(delta(3, 4, 'count', 'up')?.good).toBe(false);
    expect(delta(4, 4, 'count', 'up')?.good).toBeNull();
    expect(delta(4, 4, 'count', 'none')?.value).toBe(0);
  });

  it('has no honest answer without last week, or from zero', () => {
    expect(delta(10, null)).toBeNull();
    expect(delta(10, undefined)).toBeNull();
    expect(delta(null, 10)).toBeNull();
    expect(delta(10, 0)).toBeNull();
  });

  it('compares rates in points', () => {
    expect(delta(20, 15, 'rate', 'down')).toEqual({ value: 5, unit: 'pp', good: false });
    expect(delta(70, 80, 'rate', 'up')).toEqual({ value: -10, unit: 'pp', good: false });
    expect(delta(20, null, 'rate')).toBeNull();
    // A rate CAN move from zero: 0 % to 20 % is +20 points, not infinity.
    expect(delta(20, 0, 'rate', 'down')?.value).toBe(20);
  });

  it('writes the arrow and the unit', () => {
    expect(formatDelta(delta(10, 5, 'count'))).toBe('▲ 100%');
    expect(formatDelta(delta(3, 4, 'count'))).toBe('▼ 25%');
    expect(formatDelta(delta(4, 4, 'count'))).toBe('■ 0%');
    expect(formatDelta(delta(20, 15, 'rate'))).toBe('▲ 5.0 pp');
    expect(formatDelta(null)).toBeNull();
  });
});

describe('alerts', () => {
  it('states the value against its line', () => {
    const base = {
      id: 1, kind: 'threshold_unfulfilled_rate', severity: 'warning' as const, title: 't',
      source_type: 'alert_threshold', source_id: 'x', city: 'IN-TG-HYD', city_name: 'Hyderabad',
      created_at: '2026-10-28T01:00:00Z', acknowledged_at: null, acknowledged_by: null,
      acknowledged_note: '', ack_permission: 'trip.write',
    };
    expect(alertMeasure({ ...base, payload: { value: 20, threshold: '15', unit: 'percent' } })).toBe('20% vs 15% line');
    expect(alertMeasure({ ...base, payload: { value: 60.2, threshold: '48', unit: 'hours' } })).toBe('60.2 h vs 48 h line');
    expect(alertMeasure({ ...base, payload: { value: 1, threshold: '0', unit: 'count' } })).toBe('1 vs 0 line');
    expect(alertMeasure({ ...base, payload: { sos_id: 4 } })).toBeNull();
  });
});

describe('formatAge', () => {
  it('says a long wait the way a person does', () => {
    expect(formatAge(0)).toBe('0 min');
    expect(formatAge(45)).toBe('45 min');
    expect(formatAge(60)).toBe('1 h');
    expect(formatAge(320)).toBe('5 h 20 min');
    expect(formatAge(1440)).toBe('1 d');
    expect(formatAge(1440 + 180)).toBe('1 d 3 h');
    // The real case: an SOS left open for five weeks was "51,922.5 min".
    expect(formatAge(51_922.5)).toBe('36 d');
    expect(formatAge(null)).toBeNull();
    expect(formatAge(Number.NaN)).toBeNull();
  });

  it('is what an SOS threshold crossing reads in', () => {
    const base = { id: 1 } as never;
    expect(alertMeasure({ ...(base as object), payload: { value: 51_922.5, threshold: '5', unit: 'minutes' } } as never))
      .toBe('36 d vs 5 min line');
  });
});

describe('paths', () => {
  beforeEach(() => window.localStorage.removeItem(SCOPE_KEY));

  it('narrows to the chosen city, else to the top bar region', () => {
    expect(overviewPath('24h', 'US-TX-AUS')).toBe('/command-centre/admin/overview/?window=24h&scope=US-TX-AUS');
    expect(overviewPath('today', null)).toBe('/command-centre/admin/overview/?window=today');
    window.localStorage.setItem(SCOPE_KEY, 'IN');
    expect(overviewPath('7d', null)).toBe('/command-centre/admin/overview/?window=7d&scope=IN');
    expect(alertsPath(null)).toBe('/command-centre/admin/alerts/?open=1&limit=50&scope=IN');
    expect(alertsPath('IN-TG-HYD')).toBe('/command-centre/admin/alerts/?open=1&limit=50&city=IN-TG-HYD');
  });

  it('only accepts the three windows', () => {
    expect(isWindow('today') && isWindow('24h') && isWindow('7d')).toBe(true);
    expect(isWindow('1h')).toBe(false);
    expect(isWindow(null)).toBe(false);
  });
});
