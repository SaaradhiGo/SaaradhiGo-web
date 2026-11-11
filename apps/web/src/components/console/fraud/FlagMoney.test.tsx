import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import type { FlagDetail, MoneyBlock } from '@/lib/fraud';
import { ClearRestrictionDrawer } from '@/components/console/ClearRestrictionDrawer';
import { FlagMoney } from '@/components/console/fraud/FlagMoney';

vi.mock('next/navigation', () => ({ usePathname: () => '/fraud/7', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

const post = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return { ...original, api: { ...original.api, post: (...args: unknown[]) => post(...args), get: vi.fn() } };
});

let current: AdminAccess | null = null;
vi.mock('@/lib/adminScope', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/adminScope')>();
  return { ...original, useAdminAccess: () => current };
});

const access = (permissions: string[]) => ({ permissions } as unknown as AdminAccess);

const money = (over: Partial<MoneyBlock> = {}): MoneyBlock => ({
  rewards: [
    { ledger_entry_id: 1, kind: 'incentive_reward', campaign_id: 4, campaign: 'Weekend 3', amount_minor: 30000,
      currency: 'INR', state: 'held', held_minor: 30000, release_at: '2026-11-08T10:00:00Z', credited_at: '2026-11-01T10:00:00Z' },
    { ledger_entry_id: 2, kind: 'referral_reward', campaign_id: 5, campaign: 'Refer a driver', amount_minor: 10000,
      currency: 'INR', state: 'paid', held_minor: 0, release_at: null, credited_at: '2026-10-20T10:00:00Z' },
  ],
  currency: 'INR', linked_minor: 40000, held_minor: 30000, paid_minor: 10000, recoverable_minor: 40000,
  can_recover: true, hold_days: 7, debts: [],
  recover: { applies: true, may_request: true, max_minor: 40000, reason_code: 'fraud_recovery' },
  cash: null,
  payout_hold: { blockers: ['driver_not_suspended'], max_days: 14, serious_reasons: ['gps_spoofing', 'collusion'],
    active: false, holds: [], may_request: true, eligible: false },
  ...over,
});

const flag = (m: MoneyBlock | undefined, over: Partial<FlagDetail> = {}): FlagDetail => ({
  id: 7, kind: 'incentive_farming', status: 'confirmed', severity: 'high', score: 82, rule_key: 'incentive_farming',
  rule_version: 1, hit_count: 1, subject: { ref: 'driver #12', role: 'driver', user_id: 12, href: '/drivers/3' },
  evidence: {}, source_ref: '', scope: 'IN-TG-HYD', scope_name: 'Hyderabad', assigned_to: null, assigned_at: null,
  decision_reason: 'promo_abuse', decision_note: 'Confirmed', decided_by: null, decided_at: null,
  created_at: '2026-11-01T10:00:00Z', last_seen_at: null, age_hours: 3, may_review: true,
  linked: { accounts: [], outside_scope: 0, outside_scope_label: null },
  related: { trips: [], trip_count: 0, campaigns: [] }, timeline: [], handoffs: [], handoffs_taken: [],
  money: m, ...over,
});

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ state: 'pending_approval', approval_request: { id: 41, status: 'requested' } });
  current = access(['fraud.read', 'fraud.review', 'finance.adjust', 'riders.read']);
});
afterEach(cleanup);

describe('the rewards and money panel', () => {
  it('lists each linked reward as held or paid and offers Recover with the cap in the label', () => {
    render(<FlagMoney flag={flag(money())} onDone={() => undefined} />);
    const table = screen.getByRole('table', { name: 'Rewards linked to this flag' });
    expect(within(table).getByText('Held')).toBeTruthy();
    expect(within(table).getByText('Paid out')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Recover/ }).textContent).toContain('400.00');
    expect(screen.getByText(/already paid out/)).toBeTruthy();
  });

  it('sends the recovery as a request with the typed amount in minor units and one idempotency key', async () => {
    const done = vi.fn();
    render(<FlagMoney flag={flag(money())} onDone={done} />);
    fireEvent.click(screen.getByRole('button', { name: /^Recover/ }));
    // Prefilled with the most that can be recovered.
    expect((screen.getByLabelText(/Amount to recover/) as HTMLInputElement).value).toBe('400.00');
    fireEvent.change(screen.getByLabelText(/Amount to recover/), { target: { value: '150.50' } });
    fireEvent.change(screen.getByLabelText('Note for the record (required)'), { target: { value: 'Recovering the abused reward' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [path, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/fraud/admin/flags/7/recover/');
    expect(body.amount_minor).toBe(15050);
    expect(body.note).toBe('Recovering the abused reward');
    expect(typeof body.idempotency_key).toBe('string');
    await waitFor(() => expect(done).toHaveBeenCalledWith('Sent for approval · request #41'));
  });

  it('refuses more than the cap or no note before anything is sent', () => {
    render(<FlagMoney flag={flag(money())} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /^Recover/ }));
    fireEvent.change(screen.getByLabelText(/Amount to recover/), { target: { value: '400.01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(screen.getByRole('alert').textContent).toMatch(/more than the linked rewards/);
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Amount to recover/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(screen.getByRole('alert').textContent).toMatch(/at least 5/);
    expect(post).not.toHaveBeenCalled();
  });

  it('draws no Recover button without finance.adjust, or when nothing is left to recover', () => {
    current = access(['fraud.read', 'fraud.review']);
    const { rerender } = render(<FlagMoney flag={flag(money())} onDone={() => undefined} />);
    expect(screen.queryByRole('button', { name: /^Recover/ })).toBeNull();
    expect(screen.getByText(/needs both fraud.review and finance.adjust/)).toBeTruthy();
    current = access(['fraud.read', 'fraud.review', 'finance.adjust']);
    rerender(<FlagMoney flag={flag(money({ recoverable_minor: 0, can_recover: false }))} onDone={() => undefined} />);
    expect(screen.queryByRole('button', { name: /^Recover/ })).toBeNull();
    expect(screen.getByText('Recovery is fully requested.')).toBeTruthy();
  });

  it('shows a recovery with its carry-over', () => {
    const m = money({ debts: [{ id: 3, requested_minor: 8000, forfeited_minor: 0, amount_minor: 8000,
      recovered_minor: 5000, uncollected_minor: 0, remaining_minor: 3000, currency: 'INR', created_at: '2026-11-02T00:00:00Z' }] });
    render(<FlagMoney flag={flag(m)} onDone={() => undefined} />);
    expect(screen.getByText(/Recovery #3/).textContent).toMatch(/carries to the next payout/);
  });

  it('shows an empty state when no reward is linked, and never a Recover button', () => {
    render(<FlagMoney flag={flag(money({ rewards: [], linked_minor: 0, held_minor: 0, paid_minor: 0, recoverable_minor: 0,
      can_recover: false, recover: { applies: false, may_request: true, max_minor: 0, reason_code: 'fraud_recovery' } }))}
      onDone={() => undefined} />);
    expect(screen.getByText('No rewards are linked to this flag')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Recover/ })).toBeNull();
  });
});

describe('online payment only', () => {
  const rider = (cash: MoneyBlock['cash']) => flag(money({ rewards: [], recover: { applies: false, may_request: true, max_minor: 0,
    reason_code: 'fraud_recovery' }, cash }), {
    kind: 'payment_abuse', decision_reason: 'payment_abuse', subject: { ref: 'rider #9', role: 'rider', user_id: 9, href: '/riders/9' },
  });

  it('is offered on a confirmed payment-abuse flag, sends the note, and points blocking at the Riders page', async () => {
    const done = vi.fn();
    post.mockResolvedValue({ restriction_id: 1, kind: 'cash_disabled', created: true });
    render(<FlagMoney flag={rider({ offered: true, active: false, set_at: null, may_set: true,
      note: 'Blocking stays the separate Suspend the rider action, for repeat or severe cases only.', block_href: '/riders/9' })}
      onDone={done} />);
    expect(screen.getByText(/for repeat or severe cases only/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Online payment only' }));
    fireEvent.change(screen.getByLabelText('Note for the record (required)'), { target: { value: 'Three chargebacks on cash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set online payment only' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/fraud/admin/flags/7/restrict-cash/', { note: 'Three chargebacks on cash' }));
    await waitFor(() => expect(done).toHaveBeenCalledWith('The rider can now pay online only.'));
  });

  it('shows that it is on instead of the button once set', () => {
    render(<FlagMoney flag={rider({ offered: true, active: true, set_at: '2026-11-02T10:00:00Z', may_set: true, note: 'n', block_href: '/riders/9' })}
      onDone={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Online payment only' })).toBeNull();
    expect(screen.getByText(/Online only since/)).toBeTruthy();
  });

  it('is not offered at all unless the flag was confirmed as payment abuse', () => {
    render(<FlagMoney flag={rider({ offered: false, active: false, set_at: null, may_set: true, note: 'n', block_href: '/riders/9' })}
      onDone={() => undefined} />);
    expect(screen.queryByText('Online payment only')).toBeNull();
  });
});

describe('the payout hold', () => {
  it('says why it is not available, and offers no button, while the conditions are not met', () => {
    render(<FlagMoney flag={flag(money())} onDone={() => undefined} />);
    expect(screen.getByText(/not suspended/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hold payouts' })).toBeNull();
  });

  it('offers it only when the server says the conditions are met, and sends days, note and the key', async () => {
    const eligible = money({ payout_hold: { blockers: [], max_days: 14, serious_reasons: ['gps_spoofing'], active: false,
      holds: [], may_request: true, eligible: true } });
    render(<FlagMoney flag={flag(eligible, { decision_reason: 'gps_spoofing' })} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hold payouts' }));
    fireEvent.change(screen.getByLabelText(/Days/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Note for the record (required)'), { target: { value: 'Fake trips, suspended' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(screen.getByRole('alert').textContent).toMatch(/1 to 14/);
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Days/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [path, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/fraud/admin/flags/7/payout-hold/');
    expect(body).toMatchObject({ days: 10, note: 'Fake trips, suspended', renew: false });
    expect(typeof body.idempotency_key).toBe('string');
  });

  it('offers Release now for an active hold and Renew after an earlier one, never a second plain hold', () => {
    const hold = { id: 5, status: 'active' as const, starts_at: '2026-11-02T00:00:00Z', expires_at: '2026-11-16T00:00:00Z',
      max_days: 14, renewal_of: null, note: '', released_at: null, release_note: '', approval_request_id: 9 };
    const m = money({ payout_hold: { blockers: [], max_days: 14, serious_reasons: [], active: true, holds: [hold],
      may_request: true, eligible: true } });
    render(<FlagMoney flag={flag(m, { decision_reason: 'collusion' })} onDone={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Release the hold now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Renew the hold' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hold payouts' })).toBeNull();
  });
});

describe('clearing the online-payment-only restriction', () => {
  it('needs a note, then posts it', async () => {
    const done = vi.fn();
    post.mockResolvedValue({});
    render(<ClearRestrictionDrawer riderId={9} riderName="Rider Nine" onClose={() => undefined} onDone={done} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear restriction' }));
    expect(screen.getByRole('alert').textContent).toMatch(/at least 5/);
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Note for the record (required)'), { target: { value: 'Cleared on appeal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear restriction' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/rider/admin/9/restriction/clear/', { note: 'Cleared on appeal' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
  });
});
