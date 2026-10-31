import { describe, expect, it } from 'vitest';
import type { AdminAccess } from './adminScope';
import {
  ADJUST_REASONS, NO_POLICY_WORDS, adjustBody, adjustProblem, bulkApprovable, bulkCurrencyProblem,
  bulkRejectable, configBody, configChanges, configProblem, creditBody, creditProblem, draftFrom,
  feeNeedsWarning, minimumMinor, minimumToDraft, payoutActions, perCurrency, reconciliationHref,
  scheduleLabel, takeRateLabel,
} from './financeActions';

const access = (permissions: string[]): AdminAccess => ({
  id: 1, email: 'x@y.test', full_name: 'X', is_superuser: false, is_break_glass: false, permissions,
  roles: [], scopes: [], unrestricted: true, access_model: 'assignments', super_admin_shortfall: 0,
});
const FIN = access(['finance.read', 'finance.payout', 'finance.adjust', 'finance.config']);
const READER = access(['finance.read']);

describe('payout actions', () => {
  const pending = { id: 1, status: 'pending', currency: 'INR' };

  it('a finance.payout holder may approve and reject a pending payout', () => {
    expect(payoutActions(pending, FIN)).toMatchObject({ approve: true, reject: true, retry: false });
  });

  it('a reader holds no action at all', () => {
    expect(payoutActions(pending, READER)).toMatchObject({
      approve: false, reject: false, retry: false, investigate: false, blocked: null,
    });
  });

  it('a country with no approval policy blocks release, plainly, and still allows reject', () => {
    const row = { ...pending, approval_blocked: true, approval_blocked_reason: null };
    const a = payoutActions(row, FIN);
    expect(a.approve).toBe(false);
    expect(a.reject).toBe(true);
    expect(a.blocked).toBe(NO_POLICY_WORDS);
    expect(NO_POLICY_WORDS).toBe('Blocked: no approval policy in this country.');
  });

  it('a request already waiting for a checker is not asked again', () => {
    const a = payoutActions({ ...pending, approval: { status: 'requested' } }, FIN);
    expect(a.approve).toBe(false);
    expect(a.awaitingChecker).toBe(true);
    expect(a.reject).toBe(true);
  });

  it('retry is only for a failed payout that holds no gateway reference', () => {
    expect(payoutActions({ id: 2, status: 'failed', retryable: true }, FIN).retry).toBe(true);
    expect(payoutActions({ id: 2, status: 'failed', retryable: false }, FIN).retry).toBe(false);
    expect(payoutActions({ id: 2, status: 'completed', retryable: true }, FIN).retry).toBe(false);
  });

  it('investigation is offered on open payouts and not on a paid or rejected one', () => {
    for (const s of ['pending', 'approved', 'processed', 'failed', 'unresolved']) {
      expect(payoutActions({ id: 1, status: s }, FIN).investigate).toBe(true);
    }
    for (const s of ['completed', 'rejected']) {
      expect(payoutActions({ id: 1, status: s }, FIN).investigate).toBe(false);
    }
  });

  it('bulk picks only what each bulk action may send, and refuses a currency mix', () => {
    const rows = [
      { id: 1, status: 'pending', currency: 'INR' },
      { id: 2, status: 'pending', currency: 'INR', approval_blocked: true },
      { id: 3, status: 'approved', currency: 'INR' },
      { id: 4, status: 'pending', currency: 'USD' },
    ];
    const picked = new Set([1, 2, 3, 4]);
    expect(bulkApprovable(rows, picked, FIN)).toEqual([1, 4]);
    expect(bulkRejectable(rows, picked, FIN)).toEqual([1, 2, 4]);
    expect(bulkCurrencyProblem(rows, [1, 4])).toMatch(/one currency/);
    expect(bulkCurrencyProblem(rows, [1, 2])).toBeNull();
  });
});

describe('driver balance adjustment', () => {
  const ok = {
    direction: 'credit' as const, amount: '10.50', currency: 'INR', balanceMinor: 5000,
    reasonCode: 'correction', note: 'Missed trip 12',
  };

  it('accepts a valid credit and builds the body in minor units', () => {
    expect(adjustProblem(ok)).toBeNull();
    expect(adjustBody(ok, 'k1')).toEqual({
      direction: 'credit', amount_minor: 1050, currency: 'INR', reason_code: 'correction',
      note: 'Missed trip 12', idempotency_key: 'k1',
    });
  });

  it('a debit may never take the balance below zero', () => {
    expect(adjustProblem({ ...ok, direction: 'debit', amount: '50.01' })).toMatch(/below zero/);
    expect(adjustProblem({ ...ok, direction: 'debit', amount: '50.00' })).toBeNull();
  });

  it('needs an amount, a known reason and a note', () => {
    expect(adjustProblem({ ...ok, amount: '' })).toMatch(/amount/i);
    expect(adjustProblem({ ...ok, amount: 'abc' })).toMatch(/positive/);
    expect(adjustProblem({ ...ok, amount: '1.234' })).toMatch(/decimals/);
    expect(adjustProblem({ ...ok, reasonCode: 'vibes' })).toMatch(/reason/i);
    expect(adjustProblem({ ...ok, note: '  ' })).toMatch(/note/i);
    expect(Object.keys(ADJUST_REASONS)).toEqual(
      ['correction', 'goodwill', 'chargeback', 'damage_recovery', 'other']);
  });

  it('works in a two-decimal currency that is not rupees', () => {
    expect(adjustBody({ ...ok, currency: 'USD', amount: '1.00' }, 'k').amount_minor).toBe(100);
  });
});

describe('rider wallet credit', () => {
  const ok = { amount: '200', currency: 'INR', reasonCode: 'service_recovery', note: '', ticketId: '' };

  it('builds the body, with the ticket only when one is linked', () => {
    expect(creditProblem(ok)).toBeNull();
    expect(creditBody(ok, 'k')).toEqual({
      amount_minor: 20000, currency: 'INR', reason_code: 'service_recovery', note: '',
      idempotency_key: 'k',
    });
    expect(creditBody({ ...ok, ticketId: ' 42 ' }, 'k')).toMatchObject({ ticket_id: 42 });
  });

  it('"other" needs a note and a ticket id must be digits', () => {
    expect(creditProblem({ ...ok, reasonCode: 'other' })).toMatch(/note/i);
    expect(creditProblem({ ...ok, reasonCode: 'other', note: 'why' })).toBeNull();
    expect(creditProblem({ ...ok, ticketId: '4x2' })).toMatch(/digits/);
  });
});

describe('payout settings', () => {
  const current = {
    fee_percent: '0.00', minimum_withdrawal_minor: 50000, stuck_payout_hours: 24 as number | null,
    payout_schedule: 'on_request' as const, payout_weekday: null as number | null,
  };

  it('reads the minimum in major units and writes it back in minor units', () => {
    expect(minimumToDraft(50000, 'INR')).toBe('500.00');
    expect(minimumToDraft(100, 'USD')).toBe('1.00');
    expect(minimumMinor('1.00', 'USD')).toBe(100);
    expect(minimumMinor('0', 'USD')).toBe(0);
    expect(minimumMinor('', 'USD')).toBeNull();
  });

  it('describes what changes and nothing else', () => {
    const draft = draftFrom(current, 'INR');
    expect(configChanges(current, draft, 'INR')).toEqual([]);
    const changes = configChanges(
      current, { ...draft, fee: '1.5', minimum: '600', schedule: 'weekly', weekday: 0 }, 'INR');
    expect(changes.map((c) => c.label)).toEqual(['Transfer fee', 'Minimum withdrawal', 'Payout schedule']);
    expect(changes[0]).toEqual({ label: 'Transfer fee', from: '0%', to: '1.5%' });
    expect(changes[2].to).toBe('Weekly, Mondays');
  });

  it('builds the request body', () => {
    const draft = {
      ...draftFrom(current, 'INR'), fee: '1.5', schedule: 'weekly' as const, weekday: 4, stuckHours: '',
    };
    expect(configBody(draft, 'INR', ' Q4 review ', 'k')).toEqual({
      fee_percent: '1.50', minimum_withdrawal_minor: 50000, stuck_payout_hours: null,
      payout_schedule: 'weekly', payout_weekday: 4, reason: 'Q4 review', idempotency_key: 'k',
      reward_hold_days: 7, recovery_max_percent: 50, payout_hold_max_days: 14,
    });
    expect(configBody({ ...draft, schedule: 'on_request' }, 'INR', 'r', 'k').payout_weekday).toBeNull();
  });

  it('validates the draft', () => {
    const draft = draftFrom(current, 'INR');
    expect(configProblem(draft, 'INR')).toBeNull();
    expect(configProblem({ ...draft, fee: '101' }, 'INR')).toMatch(/0 to 100/);
    expect(configProblem({ ...draft, fee: '1.234' }, 'INR')).toMatch(/two decimals/);
    expect(configProblem({ ...draft, stuckHours: '0' }, 'INR')).toMatch(/whole number/);
    expect(configProblem({ ...draft, minimum: 'x' }, 'INR')).toMatch(/minimum/i);
  });

  it('carries the fraud money settings: defaults, changes and bounds', () => {
    const draft = draftFrom(current, 'INR');
    expect([draft.rewardHoldDays, draft.recoveryPercent, draft.holdMaxDays]).toEqual(['7', '50', '14']);
    const changes = configChanges(current, { ...draft, rewardHoldDays: '5', recoveryPercent: '40', holdMaxDays: '10' }, 'INR');
    expect(changes.map((c) => `${c.label}: ${c.from} to ${c.to}`)).toEqual([
      'Reward held for review: 7 days to 5 days',
      'Most of one payout a recovery may take: 50% to 40%',
      'Longest payout hold: 14 days to 10 days',
    ]);
    expect(configProblem({ ...draft, rewardHoldDays: '0' }, 'INR')).toMatch(/Reward hold/);
    expect(configProblem({ ...draft, recoveryPercent: '101' }, 'INR')).toMatch(/Recovery cap/);
    expect(configProblem({ ...draft, holdMaxDays: '1.5' }, 'INR')).toMatch(/payout hold/);
    const fromServer = draftFrom({ ...current, reward_hold_days: 3, recovery_max_percent: 20, payout_hold_max_days: 9 }, 'INR');
    expect([fromServer.rewardHoldDays, fromServer.recoveryPercent, fromServer.holdMaxDays]).toEqual(['3', '20', '9']);
  });

  it('warns for any fee above zero and for none at zero', () => {
    expect(feeNeedsWarning('0')).toBe(false);
    expect(feeNeedsWarning('0.00')).toBe(false);
    expect(feeNeedsWarning('0.5')).toBe(true);
    expect(feeNeedsWarning('')).toBe(false);
  });

  it('labels the schedule', () => {
    expect(scheduleLabel({ payout_schedule: 'on_request', payout_weekday: null })).toBe('On request');
    expect(scheduleLabel({ payout_schedule: 'weekly', payout_weekday: 0 })).toBe('Weekly, Mondays');
    expect(scheduleLabel({ payout_schedule: 'weekly', payout_weekday: null })).toBe('Weekly');
  });
});

describe('Command Centre finance tiles', () => {
  it('a take rate is a percentage or nothing, never 0', () => {
    expect(takeRateLabel(18.44)).toBe('18.4%');
    expect(takeRateLabel(null)).toBeNull();
    expect(takeRateLabel(undefined)).toBeNull();
  });

  it('lists a currency at a time, sorted, and never sums them', () => {
    expect(perCurrency({ USD: 5, INR: 7 })).toEqual([['INR', 7], ['USD', 5]]);
    expect(perCurrency(undefined)).toEqual([]);
  });

  it('links to reconciliation only for a finance.read holder', () => {
    expect(reconciliationHref({ reconciliation_link: true }, READER)).toBe('/finance/reconciliation');
    expect(reconciliationHref({ reconciliation_link: false }, READER)).toBeUndefined();
    expect(reconciliationHref({ reconciliation_link: true }, access(['finance.aggregate']))).toBeUndefined();
  });
});
