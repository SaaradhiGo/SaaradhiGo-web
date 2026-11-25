import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/ops/pricing/fee-plans' }));
vi.mock('@/lib/adminScope', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/adminScope')>();
  const access = {
    id: 1, email: 'ops@example.test', full_name: 'Ops', is_superuser: false, is_break_glass: false,
    permissions: ['pricing.write', 'zone.read'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const PLAN = {
  id: 7, country: 'IN', scope_code: 'IN-TG-HYD', scope_name: 'Hyderabad', currency: 'INR', plan_type: 'fair_share',
  amounts: { sedan: { per_trip_fee_minor: 1000 } }, earnings_floor_minor: 100000, daily_cap_minor: 14900,
  waiver_until: null, waiver_first_days: 60, status: 'active', version: 3, effective_from: '2026-11-01', effective_to: null,
  note: 'Rs 10 a trip, to be decided by Srini for Auto', created_by: 'Ops', created_at: '2026-10-30T10:00:00Z',
  decision: { status: 'executed', by: 'Checker', at: '2026-10-31T10:00:00Z', reason: 'ok', request_reason: 'Launch' },
};
const OLD = { ...PLAN, id: 6, version: 2, status: 'archived', note: '' };
const IMPACT = {
  changes: [{ label: 'Sedan: fee a trip', from: '₹10', to: '₹8' }],
  impact: { rows: [], table: { title: 'A driver’s day, today against the change', columns: ['Class', 'Day', 'a', 'b', 'c', 'd'],
    rows: [['Sedan', '5 trips', '₹1,450', '₹1,460', '₹50', '₹40']] } },
  start: { effective_from: '2026-11-26', increase: false, notice_days: 0, today: '2026-11-25' },
};
const fetchMock = vi.fn();
const calls = () => fetchMock.mock.calls.map(([url, init]) => [decodeURIComponent(String(url)), init?.method ?? 'GET', init?.body]);

beforeEach(() => {
  document.cookie = 'sg-staff-in=1; path=/';
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const u = decodeURIComponent(String(url));
    const data = u.includes('/impact/') ? IMPACT
      : u.includes('/edit/') ? { approval_request: { id: 99, status: 'requested' }, state: 'pending_approval' }
        : u.includes('/fee-plans/') && !u.includes('resolved') ? { results: [PLAN, OLD] }
          : u.includes('/regulation/') ? { results: [], zones: [] } : { rows: [], classes: [], results: [], zones: [] };
    return { ok: true, status: u.includes('/edit/') ? 202 : 200, json: async () => ({ status: 'success', data }) };
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => cleanup());

describe('Driver fee plans: the Edit pattern (25 Nov)', () => {
  it('shows an Edit button on the plan in force and no Note column; ended versions live in the history', async () => {
    render(<Page />);
    expect(await screen.findByRole('button', { name: 'Edit the plan for Hyderabad' })).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Driver fee plans' })).queryByRole('columnheader', { name: 'Note' })).toBeNull();
    expect(screen.queryByText('v2')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'History of the plan for Hyderabad' }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getAllByText(/₹10 a trip, to be decided by Srini/).length).toBeGreaterThan(0);
    expect(within(panel).getByText('v2')).toBeTruthy();
    expect(within(panel).getAllByText(/Approved by Checker/).length).toBeGreaterThan(0);
  });

  it('Edit is prefilled, highlights a change, previews the impact and sends it with a reason', async () => {
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit the plan for Hyderabad' }));
    const input = (await screen.findByLabelText('Sedan: Fee a trip (₹)')) as HTMLInputElement;
    expect(input.value).toBe('10');
    fireEvent.change(input, { target: { value: '8' } });
    expect(input.closest('td')?.className).toContain('is-changed');
    expect(await screen.findByText('₹8')).toBeTruthy();
    expect(screen.getByText(/next local day, 2026-11-26/)).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Send for approval' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Why/), { target: { value: 'Quarterly review' } });
    fireEvent.click(send);
    await waitFor(() => expect(calls().some(([u, m]) => u.includes('/fee-plans/7/edit/') && m === 'POST')).toBe(true));
    const [, , body] = calls().find(([u]) => u.includes('/fee-plans/7/edit/'))!;
    const sent = JSON.parse(String(body));
    expect(sent.amounts.sedan.per_trip_fee_minor).toBe(800);
    expect(sent.reason).toBe('Quarterly review');
  });
});
