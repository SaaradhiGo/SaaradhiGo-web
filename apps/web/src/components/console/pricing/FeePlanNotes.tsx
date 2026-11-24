'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { formatWhole } from '@/lib/trips';
import { classWord, placeWord } from '@/lib/pricingWords';

/**
 * One line per place whose drivers pay a fee plan instead of a commission (owner, 22 Nov: "Commission
 * pages say plainly 'Hyderabad: no commission; drivers pay the Fair Share plan'").
 */
type Plan = {
  id: number; country: string; scope_code: string; currency: string; plan_type: string; status: string;
  amounts: Record<string, Record<string, number | null>>; daily_cap_minor: number | null;
};
const PLAN_NAMES: Record<string, string> = {
  fair_share: 'Fair Share', per_trip_fee: 'fee per trip', daily_pass: 'daily pass', percent_commission: 'commission',
};

function feeWords(p: Plan): string {
  // The same fee for several classes reads once: "Rs 10 a trip for Mini, Sedan and SUV".
  const byFee = new Map<string, string[]>();
  for (const [cls, a] of Object.entries(p.amounts)) {
    const fee = a.per_trip_fee_minor != null ? (a.per_trip_fee_minor === 0 ? 'no platform fee' : `${formatWhole(a.per_trip_fee_minor, p.currency)} a trip`)
      : a.daily_pass_minor != null ? (a.daily_pass_minor === 0 ? 'no platform fee' : `${formatWhole(a.daily_pass_minor, p.currency)} a day`) : null;
    if (fee) byFee.set(fee, [...(byFee.get(fee) ?? []), classWord(cls)]);
  }
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]);
  const parts = Array.from(byFee.entries()).map(([fee, classes]) => (
    classes.length === 1 && classes[0] === 'All classes' ? fee : `${fee} for ${list(classes)}`));
  const cap = p.daily_cap_minor != null ? `, at most ${formatWhole(p.daily_cap_minor, p.currency)} a day` : '';
  return parts.length ? `${parts.join('; ')}${cap}` : 'fee not yet decided';
}

export function FeePlanNotes() {
  const access = useAdminAccess();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  useEffect(() => {
    void api.get<{ results: Plan[] }>('/pricing/admin/fee-plans/')
      .then((d) => setPlans(d.results.filter((p) => p.status === 'active' && p.plan_type !== 'percent_commission')))
      .catch(() => setPlans(null));
  }, []);
  if (!plans?.length) return null;
  return (
    <ul className="ops-note mb-3 pr-feeplans" aria-label="Places on a driver fee plan">
      {plans.map((p) => (
        <li key={p.id}>
          <b>{placeWord(p.scope_code, access, p.country === 'IN' ? 'India' : p.country === 'US' ? 'United States' : p.country)}:</b>{' '}
          {feeWords(p) === 'no platform fee' ? 'no driver fee.'
            : <>drivers pay the {PLAN_NAMES[p.plan_type] ?? p.plan_type} plan ({feeWords(p)}).</>}
        </li>
      ))}
    </ul>
  );
}
