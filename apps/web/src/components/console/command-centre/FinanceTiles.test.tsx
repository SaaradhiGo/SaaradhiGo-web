import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import type { FinanceBlock } from '@/lib/financeActions';
import { FinanceTiles } from './FinanceTiles';

vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

afterEach(cleanup);

const access = (permissions: string[]): AdminAccess => ({
  id: 1, email: 'a@b.test', full_name: 'A', is_superuser: false, is_break_glass: false, permissions,
  roles: [], scopes: [], unrestricted: true, access_model: 'assignments', super_admin_shortfall: 0,
});

const tile = (code: string, name: string, cur: string) => ({
  code, name, country: 'IN', currency: cur, window: 'today', timezone: 'UTC',
  gmv: { [cur]: 210_000 }, commission: { [cur]: 37_800 }, take_rate_percent: { [cur]: 18 as number | null },
  payouts_pending: { count: 2, amount: { [cur]: 50_000 } }, reconciliation: { open_findings: 3 },
});

const block = (over: Partial<FinanceBlock> = {}): FinanceBlock => ({
  visible: true, tiles: [tile('IN-TG-HYD', 'Hyderabad', 'INR')], reconciliation_link: true, ...over,
});

describe('FinanceTiles', () => {
  it('draws nothing when the server says the caller has no finance tiles', () => {
    const { container } = render(
      <FinanceTiles finance={{ visible: false, tiles: [], reconciliation_link: false }} access={access([])} city={null} />);
    expect(container.firstChild).toBeNull();
    const none = render(<FinanceTiles finance={undefined} access={access([])} city={null} />);
    expect(none.container.firstChild).toBeNull();
  });

  it('shows GMV, take rate, pending payouts and findings, per city', () => {
    render(<FinanceTiles finance={block()} access={access(['finance.aggregate'])} city={null} />);
    expect(screen.getByText('Hyderabad · money, totals only')).toBeTruthy();
    expect(screen.getByText('GMV · INR')).toBeTruthy();
    expect(screen.getByText('18.0%')).toBeTruthy();
    expect(screen.getByText('Open reconciliation findings')).toBeTruthy();
  });

  it('links the reconciliation tile only for a finance.read holder', () => {
    const { container, rerender } = render(
      <FinanceTiles finance={block()} access={access(['finance.aggregate'])} city={null} />);
    expect(container.querySelector('a[href="/finance/reconciliation"]')).toBeNull();
    rerender(<FinanceTiles finance={block()} access={access(['finance.aggregate', 'finance.read'])} city={null} />);
    expect(container.querySelector('a[href="/finance/reconciliation"]')).not.toBeNull();
  });

  it('a take rate with nothing settled reads as unavailable, never zero', () => {
    const t = tile('IN-TG-HYD', 'Hyderabad', 'INR');
    t.take_rate_percent = { INR: null };
    render(<FinanceTiles finance={block({ tiles: [t] })} access={access([])} city={null} />);
    expect(screen.getByText('Nothing settled in this window')).toBeTruthy();
    expect(screen.queryByText('0.0%')).toBeNull();
  });

  it('narrows to the chosen city and keeps currencies apart', () => {
    const us = tile('US-TX-AUS', 'Austin', 'USD');
    render(<FinanceTiles finance={block({ tiles: [tile('IN-TG-HYD', 'Hyderabad', 'INR'), us] })}
      access={access([])} city="US-TX-AUS" />);
    expect(screen.queryByText('Hyderabad · money, totals only')).toBeNull();
    expect(screen.getByText('GMV · USD')).toBeTruthy();
    expect(screen.queryByText('GMV · INR')).toBeNull();
  });
});
