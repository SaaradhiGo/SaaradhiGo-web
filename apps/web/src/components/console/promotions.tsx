'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminAccess } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import {
  budgetWords, canReadFraud, segments, STATE_WORDS, stateTone, type BudgetView, type State,
} from '@/lib/promotions';
import { formatMinor } from '@/lib/trips';
import { Empty, Pill } from '@/components/console/ui';

/**
 * The four Promotions pages share one sub-navigation. Rider promos, Driver incentives and Referrals
 * open with `promo.read`; the Fraud flags tab needs `fraud.read` as well. A tab is drawn only when
 * its page would open (the link rule): an operator without the capability never sees a dead end.
 */
const TABS = [
  { href: '/promotions', label: 'Rider promos', fraud: false },
  { href: '/promotions/incentives', label: 'Driver incentives', fraud: false },
  { href: '/promotions/referrals', label: 'Referrals', fraud: false },
  { href: '/promotions/fraud', label: 'Fraud flags', fraud: true },
] as const;

export function PromotionsNav() {
  const pathname = usePathname() ?? '';
  const access = useAdminAccess();
  if (!canOpen(access, 'promotions')) return null;
  const tabs = TABS.filter((t) => !t.fraud || canReadFraud(access));
  const current = tabs.find((t) => (t.href === '/promotions'
    ? pathname === t.href
    : pathname === t.href || pathname.startsWith(`${t.href}/`)))?.href;
  return (
    <nav className="ops-subnav" aria-label="Promotions">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="ops-subnav__link"
          aria-current={current === t.href ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** What a page shows to an operator who cannot read promotions (reached by a typed URL). */
export function NoAccess({ what = 'Promotions' }: { what?: string }) {
  return (
    <Empty title={`${what} ${what === 'Promotions' ? 'are' : 'is'} not available to your role`}
      detail="Rider promos, driver incentives and referrals open with the promo.read capability." />
  );
}

export function StateTag({ state }: { state: State }) {
  return <Pill tone={stateTone(state)}>{STATE_WORDS[state]}</Pill>;
}

/**
 * The budget: spent (settled), reserved (discount held on booked trips) and what is left, drawn as
 * a bar and written out beside it, because a bar alone is a colour and the figures are the point.
 * A budget is a hard cap: a campaign stops when it is used up, and a trip that already holds a
 * discount is honoured, so reserved + spent can stand above it (drawn in the danger colour and
 * named). A wrapped legacy code has no budget and no bar.
 */
export function BudgetBar({ budget, compact = false }: { budget: BudgetView; compact?: boolean }) {
  const seg = segments(budget);
  if (seg.unlimited) {
    return <span className="muted">No budget (existing code)</span>;
  }
  const currency = budget.currency;
  return (
    <div className="pm-budget">
      <div className={`pm-bar${seg.over ? ' pm-bar--over' : ''}`} role="img" aria-label={budgetWords(budget)}>
        <span className="pm-bar__spent" style={{ width: `${seg.spent}%` }} />
        <span className="pm-bar__reserved" style={{ width: `${seg.committed}%` }} />
      </div>
      <div className="pm-budget__nums">
        <span><b>{formatMinor(budget.spent_minor, currency)}</b> spent</span>
        <span><b>{formatMinor(budget.committed_minor, currency)}</b> reserved</span>
        <span><b>{formatMinor(budget.remaining_minor ?? 0, currency)}</b> left{compact ? '' : ` of ${formatMinor(budget.budget_minor, currency)}`}</span>
        {budget.overshoot_minor > 0 ? (
          <span className="pm-budget__over">{formatMinor(budget.overshoot_minor, currency)} over the cap</span>
        ) : null}
      </div>
    </div>
  );
}
