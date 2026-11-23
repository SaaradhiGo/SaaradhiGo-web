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
  const fees = Object.entries(p.amounts).flatMap(([cls, a]) => {
    if (a.per_trip_fee_minor != null) return [`${formatWhole(a.per_trip_fee_minor, p.currency)} a trip${Object.keys(p.amounts).length > 1 ? ` (${classWord(cls)})` : ''}`];
    if (a.daily_pass_minor != null) return [`${formatWhole(a.daily_pass_minor, p.currency)} a day`];
    return [];
  });
  const unique = Array.from(new Set(fees));
  const cap = p.daily_cap_minor != null ? `, at most ${formatWhole(p.daily_cap_minor, p.currency)} a day` : '';
  return unique.length ? `${unique.join(', ')}${cap}` : 'fee not yet decided';
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
          no commission; drivers pay the {PLAN_NAMES[p.plan_type] ?? p.plan_type} plan ({feeWords(p)}).
        </li>
      ))}
    </ul>
  );
}
