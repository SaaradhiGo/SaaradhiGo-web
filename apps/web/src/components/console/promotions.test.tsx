import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import type { BudgetView } from '@/lib/promotions';
import { BudgetBar, PromotionsNav } from '@/components/console/promotions';

vi.mock('next/navigation', () => ({ usePathname: () => '/promotions' }));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

let current: AdminAccess | null = null;
vi.mock('@/lib/adminScope', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/adminScope')>();
  return { ...original, useAdminAccess: () => current };
});

afterEach(cleanup);

const access = (permissions: string[]) => ({ permissions } as unknown as AdminAccess);

const budget = (over: Partial<BudgetView> = {}): BudgetView => ({
  budget_minor: 100000, committed_minor: 10000, spent_minor: 25000, remaining_minor: 65000,
  overshoot_minor: 0, used_percent: 35, currency: 'INR', ...over,
});

describe('the Promotions tabs (the link rule)', () => {
  it('draws the three campaign tabs for promo.read and no fraud tab without fraud.read', () => {
    current = access(['promo.read']);
    const { container } = render(<PromotionsNav />);
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/promotions', '/promotions/incentives', '/promotions/referrals']);
  });

  it('adds the fraud tab for fraud.read', () => {
    current = access(['promo.read', 'fraud.read']);
    const { container } = render(<PromotionsNav />);
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href')))
      .toContain('/promotions/fraud');
  });

  it('draws nothing for an operator who cannot read promotions', () => {
    current = access(['trip.read']);
    const { container } = render(<PromotionsNav />);
    expect(container.querySelector('nav')).toBeNull();
  });

  it('marks the current tab', () => {
    current = access(['promo.read']);
    render(<PromotionsNav />);
    expect(screen.getByText('Rider promos').getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Referrals').getAttribute('aria-current')).toBeNull();
  });
});

describe('the budget bar', () => {
  it('writes the three figures out beside the bar and gives the bar a text alternative', () => {
    const { container } = render(<BudgetBar budget={budget()} />);
    const bar = container.querySelector('[role="img"]') as HTMLElement;
    expect(bar.getAttribute('aria-label')).toContain('₹250.00 spent');
    expect(bar.getAttribute('aria-label')).toContain('₹100.00 reserved');
    expect(container.textContent).toContain('₹650.00 left of ₹1,000.00');
    expect((container.querySelector('.pm-bar__spent') as HTMLElement).style.width).toBe('25%');
    expect((container.querySelector('.pm-bar__reserved') as HTMLElement).style.width).toBe('10%');
  });

  it('names an overshoot in words, not only in colour', () => {
    const { container } = render(<BudgetBar budget={budget({ spent_minor: 90000, committed_minor: 25000,
      remaining_minor: 0, overshoot_minor: 15000 })} />);
    expect(container.textContent).toContain('₹150.00 over the cap');
    expect(container.querySelector('.pm-bar--over')).not.toBeNull();
  });

  it('draws no bar for a code that never had a budget', () => {
    const { container } = render(<BudgetBar budget={budget({ budget_minor: null, remaining_minor: null })} />);
    expect(container.querySelector('.pm-bar')).toBeNull();
    expect(container.textContent).toContain('No budget');
  });
});
