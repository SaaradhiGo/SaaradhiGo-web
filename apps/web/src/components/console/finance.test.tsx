/**
 * The Finance parts: the export button is drawn only for `finance.export`,
 * the ledger link only for `finance.read`, the sub-navigation marks the page
 * you are on, and the range bar refuses a range the server would.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import { ExportButton, FinanceNav, LedgerLink, Pager, RangeBar } from '@/components/console/finance';

let pathname = '/finance/payouts';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => pathname,
}));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

let current: AdminAccess | null = null;
vi.mock('@/lib/adminScope', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/adminScope')>();
  return { ...original, useAdminAccess: () => current, withScope: (p: string) => p };
});

afterEach(() => { cleanup(); current = null; pathname = '/finance/payouts'; });

const access = (permissions: string[]) => ({ permissions, roles: [], scopes: [], access_model: 'assignments' } as unknown as AdminAccess);

describe('ExportButton', () => {
  it('is not drawn without finance.export', () => {
    current = access(['finance.read']);
    const { container } = render(<ExportButton path="/payments/admin/export/payments/" />);
    expect(container.innerHTML).toBe('');
  });

  it('is not drawn when access is unknown', () => {
    current = null;
    const { container } = render(<ExportButton path="/payments/admin/export/payments/" />);
    expect(container.innerHTML).toBe('');
  });

  it('is drawn for finance.export', () => {
    current = access(['finance.read', 'finance.export']);
    render(<ExportButton path="/payments/admin/export/payments/" />);
    expect(screen.getByRole('button', { name: /export csv/i })).toBeTruthy();
  });
});

describe('LedgerLink', () => {
  it('is drawn only for an operator who can open Finance', () => {
    current = access(['driver.read']);
    const { container, rerender } = render(<LedgerLink driverId={7} />);
    expect(container.innerHTML).toBe('');
    current = access(['finance.read']);
    rerender(<LedgerLink driverId={7} />);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/finance/drivers/7/ledger');
  });
});

describe('FinanceNav', () => {
  it('marks the current page and only that one', () => {
    pathname = '/finance/payouts';
    render(<FinanceNav />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Overview', 'Payments', 'Settlements', 'Payouts', 'Reconciliation']);
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent)).toEqual(['Payouts']);
  });

  it('keeps a detail page under its tab, and the overview off every other', () => {
    pathname = '/finance/payments/12';
    render(<FinanceNav />);
    const current = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
    expect(current.map((l) => l.textContent)).toEqual(['Payments']);
  });

  it('marks no tab on a finance page that no tab owns (a driver ledger)', () => {
    pathname = '/finance/drivers/7/ledger';
    render(<FinanceNav />);
    expect(screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')).toEqual([]);
  });

  it('marks the overview on /finance itself', () => {
    pathname = '/finance';
    render(<FinanceNav />);
    const current = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
    expect(current.map((l) => l.textContent)).toEqual(['Overview']);
  });
});

describe('RangeBar', () => {
  it('will not apply a range the server would refuse', () => {
    const onApply = vi.fn();
    render(<RangeBar from="2026-03-10" to="2026-03-01" onApply={onApply} />);
    const show = screen.getByRole('button', { name: 'Show' }) as HTMLButtonElement;
    expect(show.disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/before/);
    fireEvent.click(show);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('says nothing about dates nobody has chosen yet, and still will not apply them', () => {
    render(<RangeBar from="" to="" onApply={vi.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('button', { name: 'Show' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('applies a good range and offers presets', () => {
    const onApply = vi.fn();
    render(<RangeBar from="2026-03-01" to="2026-03-10" onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(onApply).toHaveBeenCalledWith({ from: '2026-03-01', to: '2026-03-10' });
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(onApply).toHaveBeenCalledTimes(2);
  });
});

describe('Pager', () => {
  it('is absent for one page and bounded at the ends', () => {
    const { container, rerender } = render(<Pager page={1} totalPages={1} onPage={() => undefined} />);
    expect(container.innerHTML).toBe('');
    const onPage = vi.fn();
    rerender(<Pager page={1} totalPages={3} onPage={onPage} />);
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
});
