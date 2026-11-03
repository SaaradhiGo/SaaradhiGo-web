'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import {
  OVERVIEW_COLUMNS, type OverviewRow, canExport, cityName, formatMinor, formatWhole, isDate,
  presetRange, rangeProblem,
} from '@/lib/finance';
import { FinanceNav, RangeBar } from '@/components/console/finance';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { MetricCard } from '@/components/console/kit/MetricCard';
import { RecordPanel } from '@/components/console/kit/RecordPanel';
import { Skeleton } from '@/components/console/ui';

/**
 * Money overview: one row per place and currency for the range, whole units,
 * with the day-by-day figures one click away (the place opens beside the
 * table) or as a view of their own.
 *
 * NO CROSS-CURRENCY TOTAL, ANYWHERE. Rupees and dollars are different money:
 * a place's row adds only its own currency's days, and every headline figure
 * is the server's per-currency total. A day is a day in the city's own
 * timezone; the server decides which instants those are.
 */
type Overview = {
  range: { from: string; to: string };
  rows: OverviewRow[];
  totals: Array<{ currency: string } & Record<string, number | string>>;
  note?: string;
  // A COUNT per country of drivers the latest weekly payout run skipped (no payout details).
  skipped_in_latest_run?: Array<{
    country: string; week_start: string; count: number; held_count?: number; no_handle_count?: number;
  }>;
  // Started trips an operator ended this week as a safety incident or platform fault: the rider paid 0.
  platform_funded_trip_ends?: {
    week_start: string; count: number;
    totals: Array<{ currency: string; count: number; driver_earnings_minor: number }>;
    regulatory_fee_expenses?: {
      totals: Array<{ currency: string; count: number; amount_minor: number }>;
      rows: Array<{ trip_id: number; amount_minor: number; currency: string }>; note: string;
    };
  };
};

type MoneyKey = (typeof OVERVIEW_COLUMNS)[number][0];
type PlaceRow = { key: string; city: OverviewRow['city']; currency: string; days: number } & Record<MoneyKey, number>;

const placeKey = (r: { city: OverviewRow['city']; currency: string }) => `${r.city?.code ?? 'none'}|${r.currency}`;

/** One row per place and currency: integer sums of the same currency only. */
function byPlace(rows: readonly OverviewRow[]): PlaceRow[] {
  const out = new Map<string, PlaceRow>();
  for (const r of rows) {
    const k = placeKey(r);
    let p = out.get(k);
    if (!p) {
      p = { key: k, city: r.city, currency: r.currency, days: 0 } as PlaceRow;
      for (const [c] of OVERVIEW_COLUMNS) p[c] = 0;
      out.set(k, p);
    }
    p.days += 1;
    for (const [c] of OVERVIEW_COLUMNS) p[c] += r[c] ?? 0;
  }
  return [...out.values()].sort((a, b) => a.currency.localeCompare(b.currency) || b.gross_minor - a.gross_minor);
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function OverviewInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const fallback = useMemo(() => presetRange(14), []);
  const from = isDate(search.get('from')) ? (search.get('from') as string) : fallback.from;
  const to = isDate(search.get('to')) ? (search.get('to') as string) : fallback.to;
  const view = search.get('view') === 'days' ? 'days' : 'places';

  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPlace, setOpenPlace] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    const problem = rangeProblem(from, to);
    if (problem) { setError(problem); return; }
    try {
      setData(await api.get<Overview>(withScope(`/payments/admin/overview/?from=${from}&to=${to}`)));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load the money overview.');
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const places = useMemo(() => byPlace(rows), [rows]);
  const go = (patch: { from?: string; to?: string; view?: string }) => {
    const q = new URLSearchParams({ from: patch.from ?? from, to: patch.to ?? to });
    const v = patch.view ?? view;
    if (v === 'days') q.set('view', 'days');
    router.push(`/finance?${q}`);
  };

  const moneyCols = <T extends Record<MoneyKey, number> & { currency: string }>(): ListColumn<T>[] =>
    OVERVIEW_COLUMNS.map(([key, label]) => ({ key, label, num: true, render: (r: T) => formatWhole(r[key], r.currency) }));
  const placeColumns: ListColumn<PlaceRow>[] = [
    { key: 'city', label: 'Place', primary: true, render: (r) => cityName(r.city) },
    { key: 'currency', label: 'Currency', render: (r) => r.currency },
    ...moneyCols<PlaceRow>(),
  ];
  const dayColumns: ListColumn<OverviewRow>[] = [
    { key: 'city', label: 'Place', primary: true, render: (r) => cityName(r.city) },
    { key: 'day', label: 'Day', render: (r) => r.day },
    { key: 'currency', label: 'Currency', render: (r) => r.currency },
    ...moneyCols<OverviewRow>(),
  ];

  const exportCsv = () => {
    const head = view === 'days' ? ['Place', 'Day', 'Currency'] : ['Place', 'Currency'];
    const lines = [[...head, ...OVERVIEW_COLUMNS.map(([, l]) => `${l} (minor units)`)].map(csvCell).join(',')];
    const source: Array<OverviewRow | PlaceRow> = view === 'days' ? rows : places;
    for (const r of source) {
      const lead = view === 'days' ? [cityName(r.city), (r as OverviewRow).day, r.currency] : [cityName(r.city), r.currency];
      lines.push([...lead, ...OVERVIEW_COLUMNS.map(([k]) => r[k])].map(csvCell).join(','));
    }
    const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `money-${view}-${from}-to-${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const open = openPlace ? places.find((p) => p.key === openPlace) ?? null : null;
  const openDays = open ? rows.filter((r) => placeKey(r) === open.key) : [];
  const common = {
    pageKey: 'finance-overview',
    title: 'Money overview',
    summary: `Money collected, kept and paid out, by place and currency · ${from} to ${to}`,
    views: [
      { key: 'places', label: 'By place', count: data ? places.length : undefined },
      { key: 'days', label: 'By place and day', count: data ? rows.length : undefined },
    ],
    view,
    onView: (v: string) => go({ view: v }),
    filterSlot: <RangeBar from={from} to={to} onApply={(r) => go(r)} idPrefix="overview" />,
    page: 1,
    onPage: () => undefined,
    onExport: canExport(access) && data && rows.length > 0 ? exportCsv : undefined,
    loading: data === null && !error,
    error: error ? `The overview could not be loaded. ${error} This is not the same as there being no money in the range.` : null,
    empty: 'No money moved in this range. Nothing was settled, refunded or paid out in your scope between these dates.',
  };

  return (
    <>
      <FinanceNav />

      {data && data.totals.length > 0 && (
        <div className="ops-metrics mb-4">
          {data.totals.flatMap((t) => [
            <MetricCard key={`${t.currency}-gross`} label={`Gross collected · ${t.currency}`}
              value={formatWhole(Number(t.gross_minor), t.currency)}
              note={`Commission ${formatWhole(Number(t.commission_minor), t.currency)} · driver net ${formatWhole(Number(t.driver_net_minor), t.currency)}`} />,
            <MetricCard key={`${t.currency}-pending`} label={`Payouts pending · ${t.currency}`}
              tone={Number(t.payouts_failed_minor) > 0 ? 'caution' : 'neutral'}
              value={formatWhole(Number(t.payouts_pending_minor), t.currency)}
              note={`Paid ${formatWhole(Number(t.payouts_paid_minor), t.currency)} · failed ${formatWhole(Number(t.payouts_failed_minor), t.currency)} · refunds ${formatWhole(Number(t.refunds_minor), t.currency)}`} />,
          ])}
        </div>
      )}

      {(data?.skipped_in_latest_run ?? []).map((r) => {
        const held = r.held_count ?? 0;
        const noHandle = r.no_handle_count ?? r.count - held;
        return (
          <div key={r.country} className="ops-note ops-note--warn mb-4" role="status">
            <b>{r.country}: {r.count} driver{r.count === 1 ? '' : 's'} skipped in the weekly payout run of {r.week_start}.</b>{' '}
            {noHandle > 0 ? `${noHandle} have no payout details; they are asked to add them and are picked up the week they do. ` : ''}
            {held > 0 ? `${held} ${held === 1 ? 'has' : 'have'} their payouts on hold (a suspended driver, approved by a second admin); the hold ends by itself unless renewed.` : ''}
          </div>
        );
      })}

      {(data?.platform_funded_trip_ends?.count ?? 0) > 0 ? (
        <section className="ops-card mb-4" aria-labelledby="pf-ends">
          <header className="ops-card__head"><h2 id="pf-ends">Trips ended by SaaradhiGo this week (the rider was not charged)</h2></header>
          <ul className="fr-evidence" aria-label="Platform-funded trip ends">
            {(data?.platform_funded_trip_ends?.totals ?? []).map((t) => (
              <li key={t.currency}>
                {t.currency}: {t.count} trip{t.count === 1 ? '' : 's'}, driver earnings paid by SaaradhiGo {formatWhole(t.driver_earnings_minor, t.currency)}
              </li>
            ))}
            {(data?.platform_funded_trip_ends?.regulatory_fee_expenses?.totals ?? []).map((t) => (
              <li key={`fee-${t.currency}`}>
                {t.currency}: per-trip regulatory fee booked as a platform expense {formatWhole(t.amount_minor, t.currency)} on {t.count} trip{t.count === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
          <p className="help m-0">
            {data?.platform_funded_trip_ends?.regulatory_fee_expenses?.note
              ?? 'No tax or fee is charged to the rider on these trips.'}
          </p>
        </section>
      ) : null}

      <div className={open ? 'ops-split' : undefined}>
        {view === 'days' ? (
          <ListPage<OverviewRow> {...common} columns={dayColumns} rows={rows}
            rowKey={(r) => `${placeKey(r)}|${r.day}`} total={data ? rows.length : null} pageSize={Math.max(1, rows.length)}
            onRow={(r) => setOpenPlace(placeKey(r))} activeKey={null} />
        ) : (
          <ListPage<PlaceRow> {...common} columns={placeColumns} rows={places}
            rowKey={(r) => r.key} total={data ? places.length : null} pageSize={Math.max(1, places.length)}
            onRow={(r) => setOpenPlace(r.key)} activeKey={openPlace} />
        )}
        {open ? (
          <RecordPanel
            label="Place"
            title={cityName(open.city)}
            refId={open.currency}
            subtitle={`${from} to ${to} · ${open.days} day${open.days === 1 ? '' : 's'} with money moving`}
            onClose={() => setOpenPlace(null)}
            tabs={[
              {
                key: 'totals', label: 'Totals', content: (
                  <dl className="ops-money">
                    {OVERVIEW_COLUMNS.map(([k, label]) => (
                      <div key={k}><dt>{label}</dt><dd className="sg-num">{formatMinor(open[k], open.currency)}</dd></div>
                    ))}
                  </dl>
                ),
              },
              {
                key: 'days', label: 'By day', content: (
                  <table className="ops-table ops-table--compact">
                    <caption className="sr-only">{cityName(open.city)} by day</caption>
                    <thead><tr><th scope="col">Day</th><th scope="col" className="num">Gross</th><th scope="col" className="num">Commission</th><th scope="col" className="num">Payouts pending</th></tr></thead>
                    <tbody>
                      {openDays.map((d) => (
                        <tr key={d.day}>
                          <td>{d.day}</td>
                          <td className="num">{formatWhole(d.gross_minor, d.currency)}</td>
                          <td className="num">{formatWhole(d.commission_minor, d.currency)}</td>
                          <td className="num">{formatWhole(d.payouts_pending_minor, d.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              },
            ]}
          />
        ) : null}
      </div>
      <p className="muted mt-3">
        Payouts pending are open requests (pending, approved, processing or unresolved) counted on the
        day they were requested. Days are the city&rsquo;s own calendar days.
      </p>
    </>
  );
}

export default function FinanceOverviewPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <OverviewInner />
    </Suspense>
  );
}
