import { afterEach, describe, expect, it } from 'vitest';
import { cityTime } from '../trips';
import {
  addition, chartDay, clock, dateLabel, dateLocale, dateTime, deduction, fullDate, listWhen, money, rangeLabel, setMarketZone,
} from './format';

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

describe('zero amounts (11 Nov)', () => {
  it('a negative zero is a plain ₹0.00', () => {
    expect(money('-0.00', 'INR', 'en-IN')).toBe('₹0.00');
    expect(money(-0, 'INR', 'en-IN')).toBe('₹0.00');
    expect(money('abc', 'INR', 'en-IN')).toBeNull();
  });
  it('a fee shows the minus and red only above zero', () => {
    expect(deduction('0.00', 'INR', 'en-IN')).toEqual({ text: '₹0.00', red: false });
    expect(deduction(null, 'INR', 'en-IN')).toEqual({ text: '₹0.00', red: false });
    expect(deduction('45.5', 'INR', 'en-IN')).toEqual({ text: '− ₹45.50', red: true });
  });
  it('a tip shows the plus only above zero', () => {
    expect(addition('0.00', 'INR', 'en-IN')).toBe('₹0.00');
    expect(addition('20', 'INR', 'en-IN')).toBe('+ ₹20.00');
  });
});

describe('dates follow the MARKET, not the site market the visitor picked (15 Nov, round 3)', () => {
  const BOISE = 'America/Boise';
  const at = '2026-11-15T02:30:00Z'; // Sat 14 Nov, 7:30 PM in Boise
  const sun = new Date('2026-11-15T18:00:00Z');
  afterEach(() => setMarketZone('Asia/Kolkata'));

  it('a US trip reads month first in English, whatever English the reader chose', () => {
    for (const reader of ['en-US', 'en-IN', 'en-GB', 'en']) {
      expect(dateLocale(reader, BOISE)).toBe('en-US');
      expect(dateLabel(at, reader, BOISE, sun)).toBe('Sat, Nov 14');
      expect(clock(at, reader, BOISE)).toBe('7:30 PM');
    }
    expect(dateLabel(at, 'en-IN', BOISE, sun, true)).toBe('Sat, Nov 14, 2026');
    expect(fullDate(at, 'en-IN', BOISE)).toBe('Nov 14, 2026');
    expect(dateTime(at, 'en-IN', BOISE)).toBe('Nov 14, 2026, 7:30 PM');
    expect(listWhen(at, 'en-IN', BOISE, words, sun)).toEqual({ first: 'Yesterday', second: 'Sat, Nov 14 · 7:30 PM' });
  });

  it('an Indian trip keeps the day first, even for a US-English reader', () => {
    expect(dateLocale('en-US', IST)).toBe('en-IN');
    expect(dateLabel('2026-11-14T06:00:00Z', 'en-US', IST, sun)).toBe('Sat, 14 Nov');
    expect(fullDate('2026-11-14T06:00:00Z', 'en-US', IST)).toBe('14 Nov 2026');
    expect(rangeLabel('2026-11-09', '2026-11-15', 'en-US')).toBe('Mon 9 – Sun 15 Nov');
  });

  it('calendar days (chart, week, earnings) follow the market zone the driver pages set', () => {
    setMarketZone(BOISE);
    expect(rangeLabel('2026-11-09', '2026-11-15', 'en-IN')).toBe('Nov 9 – 15');
    expect(rangeLabel('2026-10-26', '2026-11-01', 'en')).toBe('Oct 26 – Nov 1');
    expect(dateLabel('2026-11-15T12:00:00Z', 'en-IN', 'UTC', sun, true)).toBe('Sun, Nov 15, 2026');
    expect(dateLocale('en-IN', 'UTC')).toBe('en-US');
    expect(chartDay('2026-11-09', 'en-IN')).toBe('Mon 9');
  });

  it('Hindi, Telugu and Spanish keep their own order', () => {
    expect(dateLocale('hi-IN', BOISE)).toBe('hi-IN');
    expect(dateLocale('es-US', IST)).toBe('es-US');
  });

  it('console city times: a US city is month first on a 12-hour clock, India unchanged', () => {
    expect(cityTime(at, BOISE)).toBe('Nov 14, 7:30 PM');
    expect(cityTime(at, BOISE, { zone: true })).toBe('Nov 14, 7:30 PM MST');
    expect(cityTime('2026-11-14T06:00:00Z', IST)).toBe('14 Nov, 11:30');
  });
});
