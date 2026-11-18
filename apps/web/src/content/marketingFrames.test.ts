import { describe, expect, it } from 'vitest';
import frames from './marketing-frames.json';

/**
 * The Home and Safety phone frames are pictures of the product with demo data (owner, 17-18 Nov).
 * Their numbers must never contradict an approved fee plan: the fee shown is what the plan charges
 * for that week, and what the driver earned is fares minus that fee.
 */
type Plan = { per_trip: number; daily_cap: number; daily_floor: number };
const feeFor = (plan: Plan, fares: number[], trips: number[]) =>
  fares.reduce((sum, f, i) => (plan.per_trip && f >= plan.daily_floor ? sum + Math.min(plan.per_trip * trips[i], plan.daily_cap) : sum), 0);

describe('marketing frames agree with the approved fee plans', () => {
  for (const market of ['IN', 'US'] as const) {
    const plan = frames.approved_fee_plans[market];
    const week = frames.week[market];
    it(`${market}: the fee is what the plan charges, and earned = fares - fee`, () => {
      const fares = week.fares_per_day.reduce((a, b) => a + b, 0);
      expect(week.platform_fee).toBe(feeFor(plan, week.fares_per_day, week.trips_per_day));
      expect(week.earned).toBe(fares - week.platform_fee);
      expect(week.paid_to_bank).toBeLessThanOrEqual(week.earned);
    });
  }
  it('US (Treasure Valley, no plan): no platform fee at all', () => {
    expect(frames.approved_fee_plans.US.per_trip).toBe(0);
    expect(frames.week.US.platform_fee).toBe(0);
  });
  it('India: Rs 10 a trip, at most Rs 149 a day', () => {
    expect(frames.approved_fee_plans.IN).toMatchObject({ per_trip: 10, daily_cap: 149, daily_floor: 1000 });
  });
  it('every class shows a driver a few minutes away', () => {
    for (const m of frames.choose_eta_min) expect(m).toBeGreaterThanOrEqual(2);
  });
});
