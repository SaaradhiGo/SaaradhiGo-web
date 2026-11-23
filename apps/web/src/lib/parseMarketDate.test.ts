import { describe, expect, it } from 'vitest';
import { marketDate, parseMarketDate } from './consoleTime';

describe('parseMarketDate (24 Nov: report dates in the market format)', () => {
  it('reads India, US and ISO forms', () => {
    expect(parseMarketDate('20 Nov 2026')).toBe('2026-11-20');
    expect(parseMarketDate('Nov 20, 2026')).toBe('2026-11-20');
    expect(parseMarketDate('2026-11-20')).toBe('2026-11-20');
    expect(parseMarketDate('31 Feb 2026')).toBeNull();
    expect(parseMarketDate('soon')).toBeNull();
  });
  it('round-trips the shown form', () => {
    expect(parseMarketDate(marketDate('2026-01-05', 'US'))).toBe('2026-01-05');
    expect(parseMarketDate(marketDate('2026-01-05', 'IN'))).toBe('2026-01-05');
  });
});
