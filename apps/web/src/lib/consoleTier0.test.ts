import { describe, expect, it } from 'vitest';
import { stamp } from './consoleTime';
import { cityTime, formatWhole } from './trips';

// Owner, 2026-11-03: whole units on lists and dashboards; times in the city's
// own zone, labelled, and never in the viewer's browser zone.

describe('formatWhole', () => {
  it('drops the paise and rounds half away from zero', () => {
    expect(formatWhole(184_200_00, 'INR')).toBe('₹1,84,200');
    expect(formatWhole(60_050, 'INR')).toBe('₹601');
    expect(formatWhole(60_049, 'INR')).toBe('₹600');
    expect(formatWhole(4_000, 'USD')).toBe('$40');
    expect(formatWhole(-250, 'USD')).toBe('−$3');
    expect(formatWhole(null, 'INR')).toBe('—');
  });
});

describe('times carry their zone', () => {
  const iso = '2026-11-03T08:35:00Z';
  it('shows a city time with its label', () => {
    expect(stamp(iso, 'Asia/Kolkata')).toBe('03 Nov, 14:05 IST');
  });
  it('falls back to UTC, labelled, never the browser zone', () => {
    expect(stamp(iso)).toBe('03 Nov, 08:35 UTC');
    expect(cityTime(iso, null)).toBe('03 Nov, 08:35 UTC');
  });
});
