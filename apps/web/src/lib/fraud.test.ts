import { describe, expect, it } from 'vitest';
import type { AdminAccess } from './adminScope';
import {
  BLANK_FILTERS, FALLBACK_CONFIRM_REASONS, FALLBACK_DISMISS_REASONS, FALLBACK_REOPEN_REASONS, NOTE_MAX,
  ageWords, canChangeRules, canReadFraud, canReviewFraud, changedThresholds, decisionProblem,
  evidenceLines, filtersFromParams, queueQuery, thresholdProblem, type Evidence, type RuleThreshold,
} from './fraud';

const access = (permissions: string[]) => ({ permissions } as unknown as AdminAccess);
const flag = (kind: string, evidence: Evidence) => ({ kind, rule_key: kind, evidence });

describe('capabilities', () => {
  it('keeps Marketing read-only and gives rule changes to fraud.rules alone', () => {
    const marketing = access(['fraud.read', 'promo.write']);
    const ops = access(['fraud.read', 'fraud.review']);
    const superAdmin = access(['fraud.read', 'fraud.review', 'fraud.rules']);
    expect([canReadFraud(marketing), canReviewFraud(marketing), canChangeRules(marketing)]).toEqual([true, false, false]);
    expect([canReadFraud(ops), canReviewFraud(ops), canChangeRules(ops)]).toEqual([true, true, false]);
    expect(canChangeRules(superAdmin)).toBe(true);
    expect(canReadFraud(access(['finance.read']))).toBe(false);
  });
});

describe('the decision form', () => {
  const confirm = FALLBACK_CONFIRM_REASONS;
  const dismiss = FALLBACK_DISMISS_REASONS;

  it('needs a reason first, then a note', () => {
    expect(decisionProblem({ reason: '', note: 'Same handset, four accounts' }, confirm)).toBe('Choose a reason.');
    expect(decisionProblem({ reason: 'collusion', note: '' }, confirm)).toBe('Add a note for the record.');
    expect(decisionProblem({ reason: 'collusion', note: '   ' }, confirm)).toBe('Add a note for the record.');
  });

  it('accepts a note of 5 to 500 characters once trimmed', () => {
    expect(decisionProblem({ reason: 'collusion', note: 'abcd' }, confirm)).toBe('The note needs at least 5 characters.');
    expect(decisionProblem({ reason: 'collusion', note: '  abcde  ' }, confirm)).toBeNull();
    expect(decisionProblem({ reason: 'collusion', note: 'x'.repeat(NOTE_MAX) }, confirm)).toBeNull();
    expect(decisionProblem({ reason: 'collusion', note: 'x'.repeat(NOTE_MAX + 1) }, confirm))
      .toBe('Keep the note to 500 characters or fewer (it is 501).');
  });

  it('refuses a reason that belongs to the other decision', () => {
    expect(decisionProblem({ reason: 'false_positive', note: 'A family phone' }, confirm))
      .toBe('Choose one of the listed reasons.');
    expect(decisionProblem({ reason: 'false_positive', note: 'A family phone' }, dismiss)).toBeNull();
    expect(decisionProblem({ reason: 'collusion', note: 'A family phone' }, dismiss))
      .toBe('Choose one of the listed reasons.');
  });

  it('offers every code the server accepts, and "other" on each list', () => {
    expect(confirm.map((r) => r.key)).toEqual(
      ['multi_accounting', 'collusion', 'gps_spoofing', 'promo_abuse', 'payment_abuse', 'other']);
    expect(dismiss.map((r) => r.key)).toEqual(
      ['false_positive', 'legitimate_shared_device', 'insufficient_evidence', 'duplicate', 'other']);
    expect(FALLBACK_REOPEN_REASONS.map((r) => r.key)).toContain('new_evidence');
  });
});

describe('evidence, in words', () => {
  it('says "same device as 2 other accounts"', () => {
    const lines = evidenceLines(flag('multi_accounting', {
      signals: ['same_device'], refs: { counterpart_user_ids: [4, 9] }, measures: { accounts: 3, promo_redemptions: 0 },
    }));
    expect(lines).toEqual(['Same device as 2 other accounts']);
  });

  it('joins several signals and counts the promos', () => {
    const lines = evidenceLines(flag('multi_accounting', {
      signals: ['same_device', 'same_phone', 'same_emergency_contact'],
      refs: { counterpart_user_ids: [4] }, measures: { promo_redemptions: 2 }, hit_count: 3,
    }));
    expect(lines[0]).toBe('Same device, same phone number and same emergency contact as 1 other account');
    expect(lines).toContain('2 promo redemptions across the group');
    expect(lines).toContain('Seen 3 times');
  });

  it('reads collusion, farming, GPS, cancellations and payments', () => {
    expect(evidenceLines(flag('collusion', {
      signals: ['repeat_pair', 'incentive_in_progress'], refs: { counterpart_user_ids: [7] },
      measures: { top_pair_trips: 14, rider_share_pct: 90, driver_trips: 20 },
    }))).toEqual(['14 trips between the same rider and driver', '90% of 20 trips are with 1 rider', 'An incentive was in progress']);
    expect(evidenceLines(flag('incentive_farming', { measures: { short_trips: 7, counted_trips: 8 } })))
      .toEqual(['7 of 8 trips counted toward an incentive were very short']);
    expect(evidenceLines(flag('gps_anomaly', {
      signals: ['impossible_jump', 'trail_short_of_billed'], measures: { anomalous_trips: 3 },
    }))).toEqual(['3 trips with impossible jumps in the location trail and a trail far shorter than the distance billed']);
    expect(evidenceLines(flag('cancellation_abuse', { measures: { accepted: 10, cancelled: 5, cancel_pct: 50 } })))
      .toEqual(['Cancelled 5 of 10 accepted trips (50%)']);
    expect(evidenceLines(flag('cancellation_abuse', { measures: { cancelled_after_accept: 5, refunded: 3 } })))
      .toEqual(['Cancelled 5 trips after a driver accepted, 3 refunded']);
    expect(evidenceLines(flag('payment_abuse', { measures: { failed_online_payments: 5, unpaid_cash_trips: 1 } })))
      .toEqual(['5 failed online payments', '1 completed cash trip left unpaid']);
  });

  it('still reads a module-12 referral flag that has no measures', () => {
    expect(evidenceLines(flag('referral_abuse', {
      signals: ['same_phone'], referral_id: 9, trips_completed: 2,
    }))).toEqual(['Referral #9: The same phone number · 2 trips completed']);
  });

  it('never has a value to show: only the signal names it was given', () => {
    const lines = evidenceLines(flag('multi_accounting', { signals: ['same_device'], refs: { counterpart_user_ids: [1] } }));
    expect(lines.join(' ')).not.toMatch(/\d{7,}|@|token/i);
  });

  it('copes with an empty evidence blob', () => {
    expect(evidenceLines(flag('collusion', {}))).toEqual(['No evidence summary']);
  });
});

describe('ages and queries', () => {
  it('writes an age the way a person says it', () => {
    expect([ageWords(0), ageWords(5), ageWords(47), ageWords(48), ageWords(100)])
      .toEqual(['under 1 h', '5 h', '47 h', '2 d', '4 d']);
  });

  it('builds the queue query from the filters', () => {
    expect(queueQuery(BLANK_FILTERS)).toBe('limit=100&status=active');
    expect(queueQuery({ ...BLANK_FILTERS, kind: 'collusion', severity: 'high', assigned: 'me', olderThanHours: '48' }))
      .toBe('limit=100&status=active&kind=collusion&severity=high&assigned=me&older_than_hours=48');
  });

  it('reads the filters a link carries, e.g. the Promotions tab and the aging alert', () => {
    const params = new URLSearchParams('kind=referral_abuse&status=');
    expect(filtersFromParams((k) => params.get(k)).kind).toBe('referral_abuse');
    expect(filtersFromParams((k) => params.get(k)).status).toBe('');
    const aging = new URLSearchParams('status=active&older_than_hours=48');
    expect(filtersFromParams((k) => aging.get(k)).olderThanHours).toBe('48');
    expect(filtersFromParams(() => null)).toEqual(BLANK_FILTERS);
  });
});

describe('rule thresholds', () => {
  const row: RuleThreshold = { key: 'min_pair_trips', label: 'Trips by one pair', unit: 'trips', value: 10, default: 10, low: 2, high: 200, hint: '' };

  it('holds a draft to whole numbers inside the server bounds', () => {
    expect(thresholdProblem(row, '')).toBe('Enter a number.');
    expect(thresholdProblem(row, '1.5')).toBe('Whole numbers only.');
    expect(thresholdProblem(row, '-3')).toBe('Whole numbers only.');
    expect(thresholdProblem(row, '1')).toBe('Between 2 and 200.');
    expect(thresholdProblem(row, '201')).toBe('Between 2 and 200.');
    expect(thresholdProblem(row, '14')).toBeNull();
  });

  it('sends only what changed', () => {
    const other: RuleThreshold = { ...row, key: 'window_days', value: 7, default: 7, low: 1, high: 90 };
    expect(changedThresholds([row, other], { min_pair_trips: '14', window_days: '7' })).toEqual({ min_pair_trips: 14 });
    expect(changedThresholds([row, other], { min_pair_trips: '10' })).toEqual({});
    expect(changedThresholds([row, other], {})).toEqual({});
  });
});
