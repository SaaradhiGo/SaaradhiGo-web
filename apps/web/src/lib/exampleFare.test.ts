import { describe, expect, it } from 'vitest';
import { EXAMPLE_FARE, exampleSplit, rupees } from './exampleFare';

describe('the example on the request mock-ups', () => {
  it('adds up: fare = commission + you earn, at the Hyderabad 15%', () => {
    const s = exampleSplit();
    expect(s.commission + s.earn).toBe(s.fare);
    expect(s.commission).toBe(Math.round(EXAMPLE_FARE.fareMinor * 0.15));
    expect([rupees(s.fare), rupees(s.commission), rupees(s.earn)]).toEqual(['₹183.00', '₹27.45', '₹155.55']);
  });
});
