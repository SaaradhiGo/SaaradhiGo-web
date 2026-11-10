'use client';

import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { areaGet } from '@/lib/area/api';
import type { Day } from '@/lib/area/driver';
import { money } from '@/lib/area/format';
import { useLoad } from '@/lib/area/useLoad';

/**
 * Driver fee plans (9 Nov): the platform fee for each day with its reason ("Today: 12 trips x
 * Rs 10 = Rs 120 (cap Rs 149)", "No fee today: earnings under Rs 1,000"), and "How our fee works",
 * written from the active plan's own values. Hidden under the percentage commission.
 */
type FeePlan = {
  plan: { plan_type: string; currency: string; earnings_floor_minor: number; daily_cap_minor: number | null;
    waiver_first_days: number | null } | null;
  applies_to_my_class: boolean;
  my_amounts?: { per_trip_fee_minor?: number; daily_pass_minor?: number; fee_free_after_trips?: number };
};
export type FeeDay = Day & { platform_fee?: string; platform_fee_note?: string; platform_fee_so_far?: boolean };

export function PlatformFeeCard({ days, currency }: { days: FeeDay[] | null; currency: string | null }) {
  const tr = useTr();
  const { locale } = useLocale();
  const plan = useLoad(() => areaGet<FeePlan>('/driver/fee-plan/'));
  const p = plan.data?.plan;
  if (!p || p.plan_type === 'percent_commission' || !plan.data?.applies_to_my_class) return null;
  const a = plan.data.my_amounts ?? {};
  const m = (minor: number | null | undefined) => money((minor ?? 0) / 100, p.currency ?? currency, locale);
  const withFee = (days ?? []).filter((d) => d.platform_fee != null).slice().reverse();
  const how = [
    a.per_trip_fee_minor ? tr('{fee} for each trip.').replace('{fee}', m(a.per_trip_fee_minor) ?? '') : null,
    a.daily_pass_minor ? tr('{fee} for a day with at least one trip.').replace('{fee}', m(a.daily_pass_minor) ?? '') : null,
    a.fee_free_after_trips ? tr('Trips after the first {n} in a day are free.').replace('{n}', `${a.fee_free_after_trips}`) : null,
    p.daily_cap_minor != null ? tr('Never more than {cap} in a day.').replace('{cap}', m(p.daily_cap_minor) ?? '') : null,
    p.earnings_floor_minor ? tr('No fee on a day when your fares are under {floor}.').replace('{floor}', m(p.earnings_floor_minor) ?? '') : null,
    p.waiver_first_days ? tr('No fee in your first {n} days.').replace('{n}', `${p.waiver_first_days}`) : null,
    tr('You always keep at least 80% of every fare.'),
    tr('The fee is taken once a day, after the day ends.'),
  ].filter(Boolean) as string[];
  return (
    <section className="acard" style={{ padding: 20 }} data-testid="platform-fee">
      <h2 className="a20">{tr('Platform fee')}</h2>
      {withFee.length === 0 ? <p className="a14 amut">{tr('No platform fee yet.')}</p> : withFee.map((d) => (
        <div key={d.date} className="arow" style={{ padding: '10px 0', borderTop: '1px solid var(--c-border)', gap: 12 }}>
          <span className="ab" style={{ width: 110 }}>{d.date}{d.platform_fee_so_far ? ` · ${tr('so far')}` : ''}</span>
          <span className="agrow a14 amut">{d.platform_fee_note}</span>
          <span className="ab">{money(d.platform_fee ?? 0, currency, locale)}</span>
        </div>
      ))}
      <details className="a14" style={{ marginTop: 10 }}>
        <summary>{tr('How our fee works')}</summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{how.map((h) => <li key={h}>{h}</li>)}</ul>
      </details>
    </section>
  );
}
