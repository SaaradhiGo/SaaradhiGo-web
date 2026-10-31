import { describe, expect, it } from 'vitest';
import type { AdminAccess } from './adminScope';
import {
  STATE_ORDER, matchedWords, actionsFor, blankForm, blockedWords, budgetFloor, budgetWords, canStart, canWrite, costWords, fromCampaign,
  minorOf, placesFor, projectCost, raiseProblem, segments, stateTone, submitProblem, termsWords, toLocalInput,
  toPayload, totalsByCurrency,
  validateForm, writeCapability, type BudgetView, type Campaign, type DraftForm, type Options,
} from './promotions';

const NOW = new Date('2026-11-01T10:00:00Z');
const INR = 'INR';

const access = (permissions: string[]): AdminAccess => ({ permissions } as unknown as AdminAccess);

/** A rider promo form that validates, so each test breaks exactly one thing. */
function promo(over: Partial<DraftForm> = {}): DraftForm {
  return {
    ...blankForm('rider_promo'), name: 'Welcome 50', scope: 'IN-TG-HYD', code: 'welcome50',
    discountType: 'flat', discountFlat: '50', budget: '1000', maxPerUser: '1',
    startsAt: '2026-11-02T09:00', endsAt: '2026-12-02T09:00', reason: 'Launch offer', ...over,
  };
}
function incentive(over: Partial<DraftForm> = {}): DraftForm {
  return {
    ...blankForm('driver_incentive'), name: 'Weekend 3', scope: 'IN-TG-HYD', targetTrips: '3',
    reward: '300', budget: '3000', startsAt: '2026-11-02T09:00', endsAt: '2026-11-09T09:00', ...over,
  };
}
function referral(over: Partial<DraftForm> = {}): DraftForm {
  return {
    ...blankForm('referral'), name: 'Refer a rider', scope: 'IN', requiredTrips: '2',
    referrerReward: '100', refereeReward: '50', budget: '5000', startsAt: '2026-11-02T09:00',
    endsAt: '2027-01-02T09:00', ...over,
  };
}

describe('capabilities', () => {
  it('splits the kinds: promo.write for rider promos and rider referrals, incentive.write for the rest', () => {
    expect(writeCapability('rider_promo')).toBe('promo.write');
    expect(writeCapability('driver_incentive')).toBe('incentive.write');
    expect(writeCapability('referral', 'rider')).toBe('promo.write');
    expect(writeCapability('referral', 'driver')).toBe('incentive.write');
  });

  it('lets Marketing start rider promos and City Ops start incentives, never the other way', () => {
    const marketing = access(['promo.read', 'promo.write']);
    const ops = access(['promo.read', 'incentive.write']);
    expect(canStart(marketing, 'rider_promo')).toBe(true);
    expect(canStart(marketing, 'driver_incentive')).toBe(false);
    expect(canStart(ops, 'driver_incentive')).toBe(true);
    expect(canStart(ops, 'rider_promo')).toBe(false);
    expect(canStart(marketing, 'referral')).toBe(true);
    expect(canStart(ops, 'referral')).toBe(true);
    expect(canWrite(marketing, 'referral', 'driver')).toBe(false);
    expect(canWrite(ops, 'referral', 'driver')).toBe(true);
  });

  it('gives a read-only role (Finance, Analyst) no way to start anything', () => {
    const finance = access(['promo.read']);
    for (const kind of ['rider_promo', 'driver_incentive', 'referral'] as const) {
      expect(canStart(finance, kind)).toBe(false);
    }
    expect(canStart(null, 'rider_promo')).toBe(false);
  });
});

describe('money text', () => {
  it('reads an amount as integer minor units, exactly', () => {
    expect(minorOf('50', INR)).toBe(5000);
    expect(minorOf('1,250.5', INR)).toBe(125050);
    expect(minorOf('0.10', INR)).toBe(10);
    expect(minorOf('0.1', INR)).toBe(10);
  });

  it('tells blank, zero and junk apart', () => {
    expect(minorOf('', INR)).toBeNull();
    expect(minorOf('   ', INR)).toBeNull();
    expect(minorOf('0', INR)).toBe(0);
    expect(minorOf('0.00', INR)).toBe(0);
    expect(minorOf('abc', INR)).toBeUndefined();
    expect(minorOf('1.234', INR)).toBeUndefined();
    expect(minorOf('-5', INR)).toBeUndefined();
  });
});

describe('the budget bar', () => {
  const view = (over: Partial<BudgetView> = {}): BudgetView => ({
    budget_minor: 100000, committed_minor: 0, spent_minor: 0, remaining_minor: 100000, overshoot_minor: 0,
    used_percent: 0, currency: INR, ...over,
  });

  it('draws spent, reserved and what is left, in whole percent that never exceed 100', () => {
    expect(segments(view({ spent_minor: 25000, committed_minor: 10000 }))).toMatchObject({
      spent: 25, committed: 10, remaining: 65, over: false,
    });
    expect(segments(view())).toMatchObject({ spent: 0, committed: 0, remaining: 100 });
    const full = segments(view({ spent_minor: 100000 }));
    expect(full.spent + full.committed + full.remaining).toBe(100);
  });

  it('rounds the used parts DOWN so a bar never claims more was spent than was', () => {
    const s = segments(view({ spent_minor: 999, committed_minor: 999 }));
    expect(s.spent).toBe(0);
    expect(s.committed).toBe(0);
    expect(s.remaining).toBe(100);
    expect(segments(view({ spent_minor: 33333 })).spent).toBe(33);
  });

  it('marks honoured trips past the cap, and still never draws past 100', () => {
    const s = segments(view({ spent_minor: 90000, committed_minor: 25000 }));
    expect(s.over).toBe(true);
    expect(s.overshootMinor).toBe(15000);
    expect(s.spent + s.committed + s.remaining).toBeLessThanOrEqual(100);
  });

  it('draws no bar for a wrapped code that never had a budget', () => {
    expect(segments(view({ budget_minor: null, remaining_minor: null }))).toMatchObject({ unlimited: true });
    expect(budgetWords(view({ budget_minor: null, remaining_minor: null }))).toContain('No budget');
  });

  it('writes the bar out in words, with the overshoot when there is one', () => {
    const words = budgetWords(view({ spent_minor: 125000, committed_minor: 30000, remaining_minor: 0,
      budget_minor: 100000, overshoot_minor: 55000 }));
    expect(words).toContain('₹1,250.00 spent');
    expect(words).toContain('₹300.00 reserved');
    expect(words).toContain('₹550.00 over the cap');
  });
});

describe('the rider promo form', () => {
  it('accepts a complete flat promo and sends minor units', () => {
    expect(validateForm(promo(), INR, NOW)).toEqual({});
    const body = toPayload(promo(), INR) as { budget_minor: number; config: Record<string, unknown> };
    expect(body.budget_minor).toBe(100000);
    expect(body.config).toMatchObject({
      code: 'WELCOME50', discount_type: 'flat', discount_flat_minor: 5000, discount_percent: null,
      max_per_user: 1, auto_apply: false,
    });
  });

  it('needs a name, a place, a window and a budget', () => {
    const p = validateForm(promo({ name: '  ', scope: '', startsAt: '', endsAt: '', budget: '' }), INR, NOW);
    expect(Object.keys(p).sort()).toEqual(['budget', 'endsAt', 'name', 'scope', 'startsAt']);
    expect(p.budget).toContain('stops when it is used up');
  });

  it('refuses a window that runs backwards or has already ended', () => {
    expect(validateForm(promo({ endsAt: '2026-11-01T09:00' }), INR, NOW).endsAt).toBe('It must end after it starts.');
    expect(validateForm(promo({ startsAt: '2026-10-01T09:00', endsAt: '2026-10-20T09:00' }), INR, NOW).endsAt)
      .toBe('That end time has already passed.');
  });

  it('needs a code, unless it applies itself, and checks the code shape', () => {
    expect(validateForm(promo({ code: '' }), INR, NOW).code).toContain('Give it a code');
    expect(validateForm(promo({ code: '', autoApply: true }), INR, NOW).code).toBeUndefined();
    expect(validateForm(promo({ code: 'x' }), INR, NOW).code).toContain('3 to 32');
    expect(validateForm(promo({ code: 'has space' }), INR, NOW).code).toContain('3 to 32');
  });

  it('checks a percentage: above 0, at most 100, two decimals', () => {
    const pct = (v: string) => validateForm(promo({ discountType: 'percent', discountPercent: v, discountFlat: '' }), INR, NOW)
      .discountPercent;
    expect(pct('')).toBeDefined();
    expect(pct('0')).toBeDefined();
    expect(pct('101')).toBeDefined();
    expect(pct('12.345')).toBeDefined();
    expect(pct('12.5')).toBeUndefined();
    expect(pct('100')).toBeUndefined();
  });

  it('checks a flat amount, the minimum fare, the per-rider limit and the total cap', () => {
    expect(validateForm(promo({ discountFlat: '0' }), INR, NOW).discountFlat).toBeDefined();
    expect(validateForm(promo({ discountFlat: '' }), INR, NOW).discountFlat).toBe('How much comes off?');
    expect(validateForm(promo({ minFare: 'abc' }), INR, NOW).minFare).toBeDefined();
    expect(validateForm(promo({ maxPerUser: '0' }), INR, NOW).maxPerUser).toBeDefined();
    expect(validateForm(promo({ maxPerUser: '1.5' }), INR, NOW).maxPerUser).toBeDefined();
    expect(validateForm(promo({ maxTotal: '0' }), INR, NOW).maxTotal).toBeDefined();
    expect(validateForm(promo({ maxTotal: '500' }), INR, NOW).maxTotal).toBeUndefined();
  });

  it('refuses a budget that cannot fund even one reward', () => {
    const p = validateForm(incentive({ reward: '300', budget: '100' }), INR, NOW);
    expect(p.budget).toContain('cannot fund even one reward');
    expect(budgetFloor(incentive(), INR)).toBe(30000);
  });

  it('refuses a negative, zero or fractional-paisa budget', () => {
    for (const bad of ['0', '-1', '10.001', 'lots']) {
      expect(validateForm(promo({ budget: bad }), INR, NOW).budget).toBeDefined();
    }
  });
});

describe('the incentive form', () => {
  it('accepts a complete incentive', () => {
    expect(validateForm(incentive(), INR, NOW)).toEqual({});
    const body = toPayload(incentive({ hourFrom: '22', hourTo: '6', vehicleType: 'sedan' }), INR) as {
      config: Record<string, unknown>;
    };
    expect(body.config).toEqual({
      target_trips: 3, reward_minor: 30000, zone_code: '', hour_from: 22, hour_to: 6, vehicle_type: 'sedan',
    });
  });

  it('needs a trip target in range and a reward', () => {
    expect(validateForm(incentive({ targetTrips: '0' }), INR, NOW).targetTrips).toBeDefined();
    expect(validateForm(incentive({ targetTrips: '1001' }), INR, NOW).targetTrips).toBeDefined();
    expect(validateForm(incentive({ reward: '' }), INR, NOW).reward).toBe('How much is the reward?');
  });

  it('wants both hours or neither, in range, and different', () => {
    expect(validateForm(incentive({ hourFrom: '22' }), INR, NOW).hourFrom).toContain('both hours');
    expect(validateForm(incentive({ hourFrom: '25', hourTo: '6' }), INR, NOW).hourFrom).toBeDefined();
    expect(validateForm(incentive({ hourFrom: '6', hourTo: '6' }), INR, NOW).hourTo).toBe('The hours must differ.');
    expect(validateForm(incentive({ hourFrom: '22', hourTo: '6' }), INR, NOW)).toEqual({});
  });
});

describe('the referral form', () => {
  it('accepts either reward alone, or both', () => {
    expect(validateForm(referral(), INR, NOW)).toEqual({});
    expect(validateForm(referral({ refereeReward: '' }), INR, NOW)).toEqual({});
    expect(validateForm(referral({ referrerReward: '', refereeReward: '75' }), INR, NOW)).toEqual({});
  });

  it('needs somebody to be rewarded and a trip count', () => {
    expect(validateForm(referral({ referrerReward: '', refereeReward: '' }), INR, NOW).referrerReward)
      .toBe('Reward the referrer, the referee, or both.');
    expect(validateForm(referral({ requiredTrips: '0' }), INR, NOW).requiredTrips).toBeDefined();
    expect(validateForm(referral({ requiredTrips: '' }), INR, NOW).requiredTrips).toBeDefined();
  });

  it('sends the audience and both rewards in minor units', () => {
    const body = toPayload(referral({ audience: 'driver' }), INR) as { config: Record<string, unknown> };
    expect(body.config).toEqual({
      audience: 'driver', required_trips: 2, referrer_reward_minor: 10000, referee_reward_minor: 5000,
    });
  });
});

describe('the cost projection', () => {
  it('prices a flat promo and counts what the budget funds', () => {
    const cost = projectCost(promo({ discountFlat: '50', budget: '1000' }), INR);
    expect(cost).toMatchObject({ budgetMinor: 100000, averageMinor: 5000, maxRedemptions: 20 });
    expect(costWords(cost, 'rider_promo', INR)).toBe('Funds about 20 rides at ₹50.00 each.');
  });

  it('never funds more than the total redemptions cap', () => {
    expect(projectCost(promo({ maxTotal: '8' }), INR).maxRedemptions).toBe(8);
    expect(projectCost(promo({ maxTotal: '500' }), INR).maxRedemptions).toBe(20);
  });

  it('prices a percentage promo from a typical fare, capped by the maximum discount', () => {
    const base = { discountType: 'percent' as const, discountPercent: '10', discountFlat: '', budget: '1000' };
    expect(projectCost(promo({ ...base, typicalFare: '200' }), INR)).toMatchObject({
      averageMinor: 2000, maxRedemptions: 50,
    });
    expect(projectCost(promo({ ...base, typicalFare: '200', maxDiscount: '15' }), INR).averageMinor).toBe(1500);
    expect(projectCost(promo({ ...base, discountPercent: '12.5', typicalFare: '200' }), INR).averageMinor).toBe(2500);
  });

  it('says why there is no figure yet, instead of inventing one', () => {
    const cost = projectCost(promo({ discountType: 'percent', discountPercent: '10', discountFlat: '' }), INR);
    expect(cost.averageMinor).toBeNull();
    expect(cost.maxRedemptions).toBeNull();
    expect(cost.hint).toContain('typical fare');
    expect(costWords(cost, 'rider_promo', INR)).toBeNull();
  });

  it('counts driver rewards and referrals', () => {
    expect(projectCost(incentive({ reward: '300', budget: '3000' }), INR)).toMatchObject({
      averageMinor: 30000, maxRedemptions: 10,
    });
    expect(projectCost(referral({ referrerReward: '100', refereeReward: '50', budget: '5000' }), INR)).toMatchObject({
      averageMinor: 15000, maxRedemptions: 33,
    });
    expect(costWords(projectCost(incentive({ reward: '300', budget: '300' }), INR), 'driver_incentive', INR))
      .toBe('Funds about 1 driver reward at ₹300.00 each.');
  });

  it('has no budget until a valid one is typed', () => {
    expect(projectCost(promo({ budget: '' }), INR)).toMatchObject({ budgetMinor: null, maxRedemptions: null });
    expect(projectCost(promo({ budget: 'x' }), INR).budgetMinor).toBeNull();
  });
});

describe('what may be done to a campaign', () => {
  const c = (state: Campaign['state'], over: Partial<Campaign> = {}) => ({
    state, is_legacy: false, budget: { budget_minor: 1000 } as BudgetView, ...over,
  });

  it('follows the server state machine', () => {
    expect(actionsFor(c('draft'))).toEqual(['edit', 'submit', 'cancel']);
    expect(actionsFor(c('pending_approval'))).toEqual(['cancel']);
    expect(actionsFor(c('live'))).toEqual(['pause', 'cancel', 'raise']);
    expect(actionsFor(c('paused'))).toEqual(['resume', 'cancel', 'raise']);
    expect(actionsFor(c('exhausted'))).toEqual(['cancel', 'raise']);
    expect(actionsFor(c('ended'))).toEqual([]);
    expect(actionsFor(c('cancelled'))).toEqual([]);
  });

  it('offers no budget raise on a wrapped code that has no budget', () => {
    const wrapped = { budget: { budget_minor: null } as BudgetView };
    expect(actionsFor(c('live', wrapped))).toEqual(['pause', 'cancel']);
    expect(actionsFor(c('draft', { is_legacy: true }))).toEqual(['cancel']);
  });

  it('only accepts a higher budget', () => {
    expect(raiseProblem('', 100000, INR)).toBe('Enter the new total budget.');
    expect(raiseProblem('abc', 100000, INR)).toContain('above zero');
    expect(raiseProblem('1000', 100000, INR)).toContain('can only go up');
    expect(raiseProblem('500', 100000, INR)).toContain('can only go up');
    expect(raiseProblem('1500', 100000, INR)).toBeNull();
  });

  it('asks for a reason before a submit', () => {
    expect(submitProblem('')).toBe('Say why, in a few words.');
    expect(submitProblem('ok')).not.toBeNull();
    expect(submitProblem('Launch offer')).toBeNull();
  });
});

describe('words and places', () => {
  it('names why a reward was blocked, by signal, never by value', () => {
    expect(blockedWords(['same_phone'])).toBe('Blocked: the same phone number');
    expect(blockedWords(['same_device', 'same_phone'])).toBe('Blocked: the same device and the same phone number');
    expect(blockedWords(['same_device', 'same_phone', 'same_instrument'])).toBe(
      'Blocked: the same device, the same phone number and the same payment instrument');
    expect(blockedWords([])).toBe('Blocked');
  });

  it('colours states so the word still carries the meaning', () => {
    expect(stateTone('live')).toBe('good');
    expect(stateTone('exhausted')).toBe('bad');
    expect(stateTone('pending_approval')).toBe('wait');
    expect(stateTone('ended')).toBe('neutral');
  });

  it('offers only the places the operator may write this kind in', () => {
    const options: Options = {
      places: [
        { code: 'IN', name: 'India', kind: 'country', country: 'IN', currency: 'INR', can_write: ['promo.write'] },
        { code: 'IN-TG-HYD', name: 'Hyderabad', kind: 'city', country: 'IN', currency: 'INR', can_write: ['promo.write', 'incentive.write'] },
        { code: 'US', name: 'United States', kind: 'country', country: 'US', currency: 'USD', can_write: ['incentive.write'] },
      ],
      zones: [], vehicle_types: [],
    };
    expect(placesFor(options, 'rider_promo', 'rider').map((p) => p.code)).toEqual(['IN', 'IN-TG-HYD']);
    expect(placesFor(options, 'driver_incentive', 'rider').map((p) => p.code)).toEqual(['IN-TG-HYD', 'US']);
    expect(placesFor(options, 'referral', 'driver').map((p) => p.code)).toEqual(['IN-TG-HYD', 'US']);
    expect(placesFor(null, 'rider_promo', 'rider')).toEqual([]);
  });
});

describe('editing a saved draft', () => {
  it('round-trips a campaign into the form and back to the same body', () => {
    const form = promo({ maxTotal: '40', zoneCode: '', newRidersOnly: true });
    const body = toPayload(form, INR) as Record<string, unknown>;
    const saved = {
      id: 1, kind: 'rider_promo', name: form.name, description: '', state: 'draft', country: 'IN', currency: INR,
      scope: 'IN-TG-HYD', scope_name: 'Hyderabad', scope_kind: 'city',
      budget: { budget_minor: 100000, committed_minor: 0, spent_minor: 0, remaining_minor: 100000,
        overshoot_minor: 0, used_percent: 0, currency: INR },
      starts_at: new Date(form.startsAt).toISOString(), ends_at: new Date(form.endsAt).toISOString(),
      config: body.config, is_legacy: false, reason: form.reason,
    } as unknown as Campaign;
    const again = fromCampaign(saved);
    expect(again.budget).toBe('1000.00');
    expect(again.discountFlat).toBe('50.00');
    expect(again.maxTotal).toBe('40');
    expect(again.newRidersOnly).toBe(true);
    expect(validateForm(again, INR, NOW)).toEqual({});
    expect(toPayload(again, INR)).toEqual(body);
  });

  it('writes an instant into a datetime-local input, and nothing for a bad one', () => {
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput('not a date')).toBe('');
    expect(toLocalInput('2026-11-02T09:00:00Z')).toMatch(/^2026-11-0[12]T\d{2}:\d{2}$/);
  });
});

describe('a campaign in a line, and totals', () => {
  const base = { currency: INR } as Pick<Campaign, 'kind' | 'config' | 'currency'>;

  it('states the terms of each kind', () => {
    expect(termsWords({ ...base, kind: 'rider_promo', config: { code: 'WELCOME50', discount_type: 'flat', discount_flat_minor: 5000 } }))
      .toBe('WELCOME50 · ₹50.00 off');
    expect(termsWords({ ...base, kind: 'rider_promo', config: { auto_apply: true, discount_type: 'percent', discount_percent: '10.00', max_discount_minor: 3000 } }))
      .toBe('Applied automatically · 10.00% off up to ₹30.00');
    expect(termsWords({ ...base, kind: 'driver_incentive', config: { target_trips: 3, reward_minor: 30000, zone_code: 'HYD-N', hour_from: 22, hour_to: 6 } }))
      .toBe('3 trips, ₹300.00 reward (HYD-N, 22:00 to 6:00)');
    expect(termsWords({ ...base, kind: 'referral', config: { audience: 'driver', required_trips: 2, referrer_reward_minor: 10000, referee_reward_minor: 5000 } }))
      .toBe('After 2 trips · ₹100.00 to the referrer, ₹50.00 to the new driver (drivers)');
  });

  it('adds budgets per currency and never across them, skipping uncapped codes', () => {
    const row = (currency: string, budget: number | null, spent: number, committed: number) => ({
      currency, budget: { budget_minor: budget, spent_minor: spent, committed_minor: committed } as BudgetView,
    });
    expect(totalsByCurrency([row('INR', 1000, 100, 50), row('USD', 500, 0, 0), row('INR', 2000, 300, 0), row('INR', null, 9, 9)]))
      .toEqual([
        { currency: 'INR', budget: 3000, spent: 400, committed: 50 },
        { currency: 'USD', budget: 500, spent: 0, committed: 0 },
      ]);
  });
});

describe('the list order and the blocked-reward line', () => {
  it('reads live first and finished last', () => {
    const order = Object.entries(STATE_ORDER).sort((a, b) => a[1] - b[1]).map(([k]) => k);
    expect(order).toEqual(['live', 'scheduled', 'pending_approval', 'paused', 'exhausted', 'draft', 'ended', 'cancelled']);
  });

  it('names the matched signals under a blocked reward', () => {
    expect(matchedWords(['same_phone'])).toBe('Matched on the same phone number');
    expect(matchedWords(['same_device', 'same_instrument'])).toBe('Matched on the same device and the same payment instrument');
    expect(matchedWords([])).toBe('Matched on a signal');
  });

  it('leaves a draft and a pending request out of the launched budget', () => {
    const row = (state: Campaign['state'], budget: number) => ({
      state, currency: INR, budget: { budget_minor: budget, spent_minor: 0, committed_minor: 0 } as BudgetView,
    });
    expect(totalsByCurrency([row('draft', 100), row('pending_approval', 200), row('cancelled', 400), row('live', 800), row('exhausted', 1600)]))
      .toEqual([{ currency: INR, budget: 2400, spent: 0, committed: 0 }]);
  });
});
