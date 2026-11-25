import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayoutHoldDrawer } from '@/components/console/drivers/PayoutHoldDrawer';
import { WhoCanApprove } from '@/components/console/WhoCanApprove';

vi.mock('@/lib/adminScope', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/adminScope')>();
  const access = {
    id: 1, email: 'ops@example.test', full_name: 'Ops', is_superuser: false, is_break_glass: false,
    permissions: ['platform.settings', 'finance.payout'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const fetchMock = vi.fn();
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
  .map(([url, init]) => [decodeURIComponent(String(url)), JSON.parse(String(init.body))]);

beforeEach(() => {
  document.cookie = 'sg-staff-in=1; path=/';
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const u = decodeURIComponent(String(url));
    const data = u.includes('/policies/preview/') ? { changes: [{ label: 'One person may approve up to', from: '₹1,000.00', to: '₹2,500.00' }] }
      : u.includes('/policies/') && init?.method !== 'POST' ? {
        actions: [{ key: 'support.refund', description: 'Refund a rider', capability: 'support.refund', always_checker: false, checkers: [] }],
        policies: [{ id: 3, country: 'IN', action_key: 'support.refund', limit_kind: 'money', currency: 'INR', maker_limit: 100000,
          maker_daily_limit: null, cumulative_per_target: false, version: 2 }] }
        : { approval_request: { id: 9, status: 'requested' }, state: 'pending_approval' };
    return { ok: true, status: init?.method === 'POST' && !u.includes('preview') ? 202 : 200, json: async () => ({ status: 'success', data }) };
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => cleanup());

describe('Payout hold (owner ruling 25 Nov)', () => {
  it('names a reason, at most 14 days, a written reason, then sends it for approval', async () => {
    const done = vi.fn();
    render(<PayoutHoldDrawer driverId={5} driverName="Ravi" onClose={() => undefined} onDone={done} />);
    const send = screen.getByRole('button', { name: 'Send for approval' }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText(/how many days/), { target: { value: '15' } });
    expect(screen.getByText('A hold lasts 1 to 14 days.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/how many days/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'compliance_check' } });
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Why, in writing/), { target: { value: 'Licence renewal being checked' } });
    expect(screen.getByText('Held for 7 days (Compliance check)')).toBeTruthy();
    fireEvent.click(send);
    await waitFor(() => expect(done).toHaveBeenCalled());
    const [url, body] = posts()[0];
    expect(url).toContain('/payments/admin/drivers/5/payout-hold/');
    expect(body).toMatchObject({ reason_kind: 'compliance_check', days: 7 });
  });
});

describe('Approval limits: Edit (25 Nov)', () => {
  it('shows each country limit with Edit, previews the change and sends it with a reason', async () => {
    render(<WhoCanApprove />);
    fireEvent.click(screen.getByText('Who can approve what'));
    const details = screen.getByText('Who can approve what').closest('details')!;
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit the limit for Refund a rider in India' }));
    fireEvent.change(screen.getByLabelText(/One person may approve up to/), { target: { value: '2500' } });
    expect(await screen.findByText('₹2,500.00')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Why/), { target: { value: 'Festival season refunds' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(posts().some(([u]) => u.includes('/policies/change/'))).toBe(true));
    const [, body] = posts().find(([u]) => u.includes('/policies/change/'))!;
    expect(body).toMatchObject({ country: 'IN', action_key: 'support.refund', maker_limit: 250000, reason: 'Festival season refunds' });
  });
});
