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
  it('the /drive example request charges the plan, never a commission (19 Nov)', async () => {
    const { exampleFor, planSplitOf } = await import('@/lib/exampleFare');
    const india = planSplitOf(exampleFor('IN'));
    expect(india.fee).toBe(frames.approved_fee_plans.IN.per_trip * 100);
    expect(india.earn).toBe(india.fare - india.fee);
    const us = planSplitOf(exampleFor('US'));
    expect(us.fee).toBe(0);
    expect(us.earn).toBe(us.fare);
  });
  it('public copy says "platform fee", never "commission", while no approved plan takes one (19 Nov)', async () => {
    const en = (await import('@/i18n/website/en.json')).default as Record<string, string>;
    const plans = Object.values(frames.approved_fee_plans) as Array<{ per_trip: number }>;
    expect(plans.every((p) => p.per_trip >= 0)).toBe(true);
    const said = Object.values(en).filter((v) => /commission/i.test(v));
    expect(said).toEqual([]);
  });
  it('India amounts in the plan note are whole rupees (19 Nov)', () => {
    expect(frames.approved_fee_plans.IN.note).toBe('₹10 a trip, at most ₹149 a day');
    expect(frames.approved_fee_plans.IN.note).not.toMatch(/\.00/);
  });
  it('every class shows a driver a few minutes away', () => {
    for (const m of frames.choose_eta_min) expect(m).toBeGreaterThanOrEqual(2);
  });
});
