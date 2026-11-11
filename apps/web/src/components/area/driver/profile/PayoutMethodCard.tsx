'use client';

import Link from 'next/link';
import { useTr } from '@/i18n/website';
import { requirements as loadRequirements, setupHref } from '@/lib/area/requirements';
import { useLoad } from '@/lib/area/useLoad';

/** Payouts page (10 Nov): the payout method on file, masked, and where to change it. */
export function PayoutMethodCard() {
  const tr = useTr();
  const load = useLoad(loadRequirements);
  const pm = load.data?.payout_method;
  if (!pm) return null;
  const text = pm.kind === 'stripe'
    ? tr('Stripe: {s}').replace('{s}', tr(pm.stripe_status === 'ready' ? 'Ready' : pm.stripe_status === 'in_progress' ? 'In progress' : 'Not started'))
    : pm.bank ? `${pm.bank.bank_name} ${pm.bank.account_masked}` : pm.upi_masked ? `UPI ${pm.upi_masked}` : tr('None yet');
  return (
    <section className="acard arow" style={{ padding: 20, gap: 12, flexWrap: 'wrap' }} data-testid="payout-method-card">
      <div className="agrow">
        <div className="a14 amut">{tr('Payout method')}</div>
        <div className="ab">{text}</div>
        {pm.held_until && <div className="a14 ared">{tr('Payouts paused until {time} after a change.').replace('{time}', new Date(pm.held_until).toLocaleString())}</div>}
      </div>
      <Link href={setupHref('payouts', 'profile')} className="abtn abtn--ghost">{tr(pm.kind ? 'Change' : 'Add')}</Link>
    </section>
  );
}
