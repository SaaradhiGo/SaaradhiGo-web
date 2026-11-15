/** Console times in the city's own zone (owner, 14 Nov): the Treasure Valley is Boise, Mountain time. */
import { describe, expect, it } from 'vitest';
import { cityTimeZone, stamp, timeZoneFor } from './consoleTime';

// The support case the console showed as "14 Nov, 19:58 EST".
const CASE = '2026-11-15T00:58:00Z';

describe('timeZoneFor', () => {
  it('maps the Treasure Valley and Idaho to Boise', () => {
    expect(timeZoneFor('US-ID-TV')).toBe('America/Boise');
    expect(timeZoneFor('US-ID')).toBe('America/Boise');
  });
  it('a US-wide row takes the backend US default, Boise, not New York', () => {
    expect(timeZoneFor('US')).toBe('America/Boise');
  });
  it('keeps India and Texas', () => {
    expect(timeZoneFor('IN-TG-HYD')).toBe('Asia/Kolkata');
    expect(timeZoneFor('US-TX-AUS')).toBe('America/Chicago');
  });
  it('no code: no zone', () => {
    expect(timeZoneFor(null)).toBeUndefined();
    expect(timeZoneFor('')).toBeUndefined();
  });
});

describe('cityTimeZone', () => {
  it("prefers the zone the API sent with the city", () => {
    expect(cityTimeZone({ code: 'US-ID-TV', timezone: 'America/Los_Angeles' })).toBe('America/Los_Angeles');
  });
  it('falls back to the code', () => {
    expect(cityTimeZone({ code: 'US-ID-TV', name: 'Treasure Valley' } as { code: string })).toBe('America/Boise');
    expect(cityTimeZone('IN-TG-HYD')).toBe('Asia/Kolkata');
  });
  it('no city: undefined, so stamp keeps UTC', () => {
    expect(cityTimeZone(null)).toBeUndefined();
    expect(stamp(CASE, cityTimeZone(null))).toBe('15 Nov, 00:58 UTC');
  });
});

describe('stamp in the city zone', () => {
  it('shows the Treasure Valley case in Mountain time with its abbreviation', () => {
    expect(stamp(CASE, cityTimeZone({ code: 'US-ID-TV' }))).toBe('14 Nov, 17:58 MST');
  });
  it('summer in Boise is MDT', () => {
    expect(stamp('2026-07-01T18:00:00Z', timeZoneFor('US-ID-TV'))).toBe('01 Jul, 12:00 MDT');
  });
  it('Hyderabad stays IST', () => {
    expect(stamp(CASE, cityTimeZone({ code: 'IN-TG-HYD' }))).toBe('15 Nov, 06:28 IST');
  });
});
