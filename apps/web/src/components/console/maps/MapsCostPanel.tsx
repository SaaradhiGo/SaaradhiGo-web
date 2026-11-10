'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { DataTable, Panel, Skeleton } from '@/components/console/ui';
import { FieldsDrawer, toText, type FieldSpec } from '@/components/console/kit/FieldsDrawer';

/**
 * Configure > Integrations > Maps (9 Nov): today's and this month's calls and cost per SKU, the
 * cost per completed trip, the route cache hit rate, the free allowance used, and each country's
 * monthly budget. Over budget the platform degrades in order (longer route cache, straight-line
 * ETA, autocomplete after 5 characters); booking and SOS are never blocked.
 */
type Price = { sku: string; usd_per_1000: string; free_monthly_calls: number; note: string };
type Summary = {
  today: Record<string, number>; month: Record<string, number>; today_cost_usd: string;
  month_cost_usd: string; month_list_cost_usd: string; route_cache_hit_rate: number | null;
  free_allowance_used: Record<string, { used: number; free: number }>;
};
type Budget = {
  country: string; monthly_usd: string | null; amber_percent: number; red_percent: number;
  degrade_longer_cache: boolean; degrade_straight_line_eta: boolean; degrade_autocomplete_5_chars: boolean;
};
type CountryRow = {
  country: string; usd_to_local: number | null; summary: Summary;
  cost_per_completed_trip_usd: string | null; budget: Budget; degrade_level: number;
};
type Payload = { countries: CountryRow[]; prices: Price[] };

const BUDGET_FIELDS: FieldSpec[] = [
  { key: 'monthly_usd', label: 'Monthly budget (USD, Google bills in USD)', kind: 'number' },
  { key: 'amber_percent', label: 'Amber alert at (%)', kind: 'number' },
  { key: 'red_percent', label: 'Red alert and degrade at (%)', kind: 'number' },
  { key: 'degrade_longer_cache', label: 'Step 1: keep routes cached twice as long', kind: 'bool' },
  { key: 'degrade_straight_line_eta', label: 'Step 2: straight-line ETA only', kind: 'bool' },
  { key: 'degrade_autocomplete_5_chars', label: 'Step 3: search after 5 characters', kind: 'bool' },
];
const PRICE_FIELDS: FieldSpec[] = [
  { key: 'usd_per_1000', label: 'USD per 1,000 calls', kind: 'number' },
  { key: 'free_monthly_calls', label: 'Free calls a month', kind: 'number' },
];

const local = (usd: string | null, fx: number | null, country: string) =>
  usd == null ? '—' : fx ? `${country === 'IN' ? '₹' : '$'}${(Number(usd) * fx).toFixed(2)} ($${Number(usd).toFixed(4)})` : `$${usd}`;

export function MapsCostPanel({ mayEdit }: { mayEdit: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [budgetOf, setBudgetOf] = useState<CountryRow | null>(null);
  const [priceOf, setPriceOf] = useState<Price | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api.get<Payload>('/platform/admin/maps/'));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The Maps costs could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <Panel title="Google Maps cost and budget"><div className="alert-error">{error}</div></Panel>;
  if (!data) return <Panel title="Google Maps cost and budget"><Skeleton kind="row" count={3} /></Panel>;
  const prices = Object.fromEntries(data.prices.map((p) => [p.sku, p]));
  return (
    <Panel title="Google Maps cost and budget">
      {data.countries.map((c) => {
        const skus = Array.from(new Set([...Object.keys(c.summary.month), ...Object.keys(c.summary.today)])).sort();
        const spent = Number(c.summary.month_cost_usd);
        const pct = c.budget.monthly_usd ? Math.round((100 * spent) / Number(c.budget.monthly_usd)) : null;
        return (
          <div key={c.country} className="grid gap-2 mb-4">
            <p className="m-0">
              <b>{c.country}</b>
              {' · '}this month {local(c.summary.month_cost_usd, c.usd_to_local, c.country)}
              {' · '}per completed trip {local(c.cost_per_completed_trip_usd, c.usd_to_local, c.country)}
              {' · '}route cache hit rate {c.summary.route_cache_hit_rate == null ? '—' : `${Math.round(c.summary.route_cache_hit_rate * 100)}%`}
              {' · '}budget {c.budget.monthly_usd ? `$${c.budget.monthly_usd}${pct != null ? ` (${pct}% used)` : ''}` : 'not set'}
              {c.degrade_level > 0 ? ` · degraded, step ${c.degrade_level}` : ''}
              {mayEdit ? <> {' '}<button type="button" className="ops-linkbtn" onClick={() => setBudgetOf(c)}>Budget…</button></> : null}
            </p>
            {pct != null && pct >= c.budget.red_percent ? (
              <div className="alert-error" role="alert">Over budget: the platform is saving calls (step {c.degrade_level}). Booking and SOS are unaffected.</div>
            ) : pct != null && pct >= c.budget.amber_percent ? (
              <div className="ops-note ops-note--warn" role="status">{pct}% of this month’s Maps budget is spent.</div>
            ) : null}
            <DataTable caption={`Google Maps calls and cost in ${c.country}`} rows={skus} rowKey={(s) => s} density="compact" maxHeight={false}
              columns={[
                { key: 'sku', label: 'SKU', render: (s) => <code>{s}</code> },
                { key: 'today', label: 'Today', num: true, render: (s) => c.summary.today[s] ?? 0 },
                { key: 'month', label: 'This month', num: true, render: (s) => c.summary.month[s] ?? 0 },
                { key: 'free', label: 'Free used', num: true, render: (s) => {
                  const f = c.summary.free_allowance_used[s];
                  return f ? `${f.used.toLocaleString()} of ${f.free.toLocaleString()}` : '—';
                } },
                { key: 'price', label: 'List price', num: true, render: (s) => (prices[s] ? (
                  mayEdit ? <button type="button" className="ops-linkbtn" onClick={() => setPriceOf(prices[s])}>${prices[s].usd_per_1000}/1,000</button>
                    : `$${prices[s].usd_per_1000}/1,000`) : 'not billed') },
              ]} />
          </div>
        );
      })}
      {budgetOf ? (
        <FieldsDrawer title={`Maps budget · ${budgetOf.country}`} fields={BUDGET_FIELDS} reasonRequired={false}
          initial={Object.fromEntries(BUDGET_FIELDS.map((f) => [f.key, toText((budgetOf.budget as Record<string, unknown>)[f.key])]))}
          send={(changes, reason) => api.put(`/platform/admin/maps/budget/${budgetOf.country}/`, { ...changes, reason })}
          onClose={() => setBudgetOf(null)} onDone={() => { setBudgetOf(null); void load(); }} />
      ) : null}
      {priceOf ? (
        <FieldsDrawer title={`List price · ${priceOf.sku}`} fields={PRICE_FIELDS} reasonRequired={false}
          initial={Object.fromEntries(PRICE_FIELDS.map((f) => [f.key, toText((priceOf as Record<string, unknown>)[f.key])]))}
          note={priceOf.note}
          send={(changes, reason) => api.put(`/platform/admin/maps/prices/${priceOf.sku}/`, { ...changes, reason })}
          onClose={() => setPriceOf(null)} onDone={() => { setPriceOf(null); void load(); }} />
      ) : null}
    </Panel>
  );
}
