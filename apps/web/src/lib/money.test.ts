import { describe, expect, it } from 'vitest';
import { formatExact, formatFare } from './money';

describe('formatExact', () => {
  it('keeps paise only when there are any', () => {
    expect(formatExact('1151.29', 'INR')).toBe('₹1,151.29');
    expect(formatExact('185.00', 'INR')).toBe('₹185');
    expect(formatExact('978.6', 'INR')).toBe('₹978.60');
  });

  it('puts the sign before the symbol', () => {
    expect(formatExact('-49.32', 'INR')).toBe('-₹49.32');
  });

  it('says nothing rather than zero when there is no amount', () => {
    expect(formatExact(null, 'INR')).toBeNull();
    expect(formatExact('', 'INR')).toBeNull();
    expect(formatExact('abc', 'INR')).toBeNull();
  });
});

describe('summaries stay whole', () => {
  it('rounds a summary half up to the rupee', () => {
    expect(formatFare('363.73', 'INR')).toBe('₹364');
    expect(formatFare('978.6', 'INR')).toBe('₹979');
  });
});
