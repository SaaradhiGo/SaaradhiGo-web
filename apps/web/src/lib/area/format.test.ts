import { describe, expect, it } from 'vitest';
import { chartDay, listWhen, money, rangeLabel } from './format';

const words = { today: 'Today', yesterday: 'Yesterday' };
const NOW = new Date('2026-11-08T16:00:00Z'); // 21:30 in Hyderabad, Sun 8 Nov
const IST = 'Asia/Kolkata';

describe('money', () => {
  it('formats in the trip currency with its decimals, zero included', () => {
    expect(money('118', 'INR', 'en-IN')).toBe('₹118.00');
    expect(money('0.00', 'INR', 'en-IN')).toBe('₹0.00');
    expect(money(0, 'INR', 'en-IN')).toBe('₹0.00');
    expect(money('631.55', 'INR', 'en-IN')).toBe('₹631.55');
    expect(money('1257.50', 'INR', 'en-IN')).toBe('₹1,257.50');
    expect(money('12.5', 'USD', 'en-US')).toBe('$12.50');
  });
  it('shows nothing rather than a guess', () => {
    expect(money(null, 'INR', 'en-IN')).toBeNull();
    expect(money('118', null, 'en-IN')).toBeNull();
  });
});

describe('list dates', () => {
  it('today and yesterday over the full date and time', () => {
    expect(listWhen('2026-11-08T03:42:00Z', 'en-IN', IST, words, NOW)).toEqual({ first: 'Today', second: 'Sun, 8 Nov · 9:12 am' });
    expect(listWhen('2026-11-07T12:35:00Z', 'en-IN', IST, words, NOW)?.first).toBe('Yesterday');
  });
  it('older rows: the date over the time, in the trip time zone', () => {
    expect(listWhen('2026-11-02T03:10:00Z', 'en-IN', IST, words, NOW)).toEqual({ first: 'Mon, 2 Nov', second: '8:40 am' });
  });
  it('the year when it is not this year', () => {
    expect(listWhen('2025-12-30T03:10:00Z', 'en-IN', IST, words, NOW)?.first).toBe('Tue, 30 Dec, 2025');
  });
  it('the market time zone decides the day', () => {
    // 23:30 on 7 Nov in Hyderabad is already the 8th: not "Yesterday".
    expect(listWhen('2026-11-07T18:30:00Z', 'en-IN', IST, words, NOW)?.first).toBe('Today');
  });
  it('a missing date shows no row date at all', () => {
    expect(listWhen(null, 'en-IN', IST, words, NOW)).toBeNull();
    expect(listWhen('not a date', 'en-IN', IST, words, NOW)).toBeNull();
  });
  it('a trip with no time zone uses the market zone, never the browser zone', () => {
    expect(listWhen('2026-11-08T03:42:00Z', 'en-IN', null, words, NOW)).toEqual({ first: 'Today', second: 'Sun, 8 Nov · 9:12 am' });
    expect(listWhen('2026-11-08T03:42:00Z', 'en-IN', 'Not/AZone', words, NOW)?.second).toBe('Sun, 8 Nov · 9:12 am');
  });
});

describe('chart and week labels', () => {
  it('weekday and date', () => {
    expect(chartDay('2026-11-02', 'en-IN')).toBe('Mon 2');
  });
  it('the week range', () => {
    expect(rangeLabel('2026-11-02', '2026-11-08', 'en-IN')).toBe('Mon 2 – Sun 8 Nov');
    expect(rangeLabel('2026-10-26', '2026-11-01', 'en-IN')).toBe('Mon 26 Oct – Sun 1 Nov');
  });
});
