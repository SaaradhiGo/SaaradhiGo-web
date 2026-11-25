import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import type { BudgetView } from '@/lib/promotions';
import { BudgetBar, PromotionsNav, WhoQualifies } from '@/components/console/promotions';

vi.mock('next/navigation', () => ({ usePathname: () => '/ops/promotions' }));
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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
    expect(links).toEqual(['/ops/promotions', '/ops/promotions/incentives', '/ops/promotions/referrals']);
  });

  it('adds the fraud tab for fraud.read', () => {
    current = access(['promo.read', 'fraud.read']);
    const { container } = render(<PromotionsNav />);
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href')))
      .toContain('/ops/promotions/fraud');
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
    expect(bar.getAttribute('aria-label')).toContain('₹250 spent');
    expect(bar.getAttribute('aria-label')).toContain('₹100 reserved');
    expect(container.textContent).toContain('₹650 left of ₹1,000');
    expect((container.querySelector('.pm-bar__spent') as HTMLElement).style.width).toBe('25%');
    expect((container.querySelector('.pm-bar__reserved') as HTMLElement).style.width).toBe('10%');
  });

  it('names an overshoot in words, not only in colour', () => {
    const { container } = render(<BudgetBar budget={budget({ spent_minor: 90000, committed_minor: 25000,
      remaining_minor: 0, overshoot_minor: 15000 })} />);
    expect(container.textContent).toContain('₹150 over the cap');
    expect(container.querySelector('.pm-bar--over')).not.toBeNull();
  });

  it('draws no bar for a code that never had a budget', () => {
    const { container } = render(<BudgetBar budget={budget({ budget_minor: null, remaining_minor: null })} />);
    expect(container.querySelector('.pm-bar')).toBeNull();
    expect(container.textContent).toContain('No budget');
  });
});

describe('who qualifies', () => {
  const stub = (data: unknown) => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data }) }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('counts the riders a saved campaign reaches, with its rules', async () => {
    const fetchMock = stub({ who: 'riders', count: 1240, place: 'Hyderabad', rules: ['new riders only (no trip yet)'] });
    render(<WhoQualifies campaignId={12} />);
    expect(await screen.findByText('1,240 riders')).toBeTruthy();
    expect(screen.getByLabelText('Who qualifies').textContent).toContain('in Hyderabad qualify (new riders only (no trip yet)).');
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/promotions/admin/campaigns/12/audience/');
  });

  it('agrees with one driver', async () => {
    stub({ who: 'drivers', count: 1, place: 'Austin', rules: [] });
    render(<WhoQualifies campaignId={3} />);
    expect(await screen.findByText('1 driver')).toBeTruthy();
    expect(screen.getByLabelText('Who qualifies').textContent).toContain('in Austin qualifies.');
  });
});
