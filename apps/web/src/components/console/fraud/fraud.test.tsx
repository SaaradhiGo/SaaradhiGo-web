import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import type { FlagDetail } from '@/lib/fraud';
import { FlagDecisionDrawer } from '@/components/console/fraud/FlagDecisionDrawer';
import { FraudNav } from '@/components/console/fraud/parts';

vi.mock('next/navigation', () => ({ usePathname: () => '/fraud', useRouter: () => ({ push: vi.fn() }) }));
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

const flag = (): FlagDetail => ({
  id: 7, kind: 'multi_accounting', status: 'open', severity: 'high', score: 82, rule_key: 'multi_accounting',
  rule_version: 1, hit_count: 1, subject: { ref: 'rider #12', role: 'rider', user_id: 12, href: '/riders/12' },
  evidence: { signals: ['same_device'], refs: { counterpart_user_ids: [3, 4] } }, source_ref: '', scope: 'IN-TG-HYD',
  scope_name: 'Hyderabad', assigned_to: null, assigned_at: null, decision_reason: '', decision_note: '', decided_by: null,
  decided_at: null, created_at: '2026-11-01T10:00:00Z', last_seen_at: null, age_hours: 3, may_review: true,
  linked: { accounts: [], outside_scope: 0, outside_scope_label: null },
  related: { trips: [], trip_count: 0, campaigns: [] }, timeline: [],
  handoffs: [
    { kind: 'rider_block', label: 'Suspend the rider', capability: 'rider.block', href: '/riders/12', available: false, taken_at: null },
    { kind: 'finance_adjustment', label: 'Request a Finance adjustment', capability: 'finance.adjust', href: '/riders/12', available: false, taken_at: null },
  ],
  handoffs_taken: [],
});

beforeEach(() => { post.mockReset(); post.mockResolvedValue({}); current = access(['fraud.read', 'fraud.review', 'rider.block']); });
afterEach(cleanup);

describe('the decision dialog', () => {
  it('refuses to send without a reason and a note, and says what is missing', () => {
    render(<FlagDecisionDrawer action="confirm" flag={flag()} options={null} onClose={() => undefined} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm fraud' }));
    expect(screen.getByRole('alert').textContent).toBe('Choose a reason.');
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses a short note, then sends the reason code and the trimmed-length note', async () => {
    const done = vi.fn();
    render(<FlagDecisionDrawer action="confirm" flag={flag()} options={null} onClose={() => undefined} onDone={done} />);
    fireEvent.click(screen.getByLabelText('Multiple accounts for one person'));
    fireEvent.change(screen.getByLabelText('Note for the record (required)'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm fraud' }));
    expect(screen.getByRole('alert').textContent).toBe('The note needs at least 5 characters.');
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Note for the record (required)'), { target: { value: 'Four accounts, one handset' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm fraud' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/fraud/admin/flags/7/confirm/',
      { reason_code: 'multi_accounting', note: 'Four accounts, one handset' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
  });

  it('offers the dismiss reasons on a dismissal and not the confirm ones', () => {
    render(<FlagDecisionDrawer action="dismiss" flag={flag()} options={null} onClose={() => undefined} onDone={() => undefined} />);
    expect(screen.getByLabelText('Legitimate shared device')).toBeTruthy();
    expect(screen.queryByLabelText('GPS spoofing or tampering')).toBeNull();
  });

  it('lists only the follow-up actions this operator holds the capability for, and says nothing happens yet', () => {
    render(<FlagDecisionDrawer action="confirm" flag={flag()} options={null} onClose={() => undefined} onDone={() => undefined} />);
    expect(screen.getByText('Suspend the rider')).toBeTruthy();
    expect(screen.queryByText('Request a Finance adjustment')).toBeNull();
    expect(screen.getByText(/Nothing happens until you take one/)).toBeTruthy();
    expect(screen.getByText(/does not suspend anyone, take any money, hold a payout, or tell the person/)).toBeTruthy();
  });
});

describe('the Fraud tabs (the link rule)', () => {
  it('draws Queue and Rules for fraud.read and nothing otherwise', () => {
    current = access(['fraud.read']);
    const { container, rerender } = render(<FraudNav />);
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/fraud', '/fraud/rules']);
    current = access(['promo.read']);
    rerender(<FraudNav />);
    expect(container.querySelectorAll('a').length).toBe(0);
  });
});
