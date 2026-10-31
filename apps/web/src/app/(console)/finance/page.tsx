'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { withScope } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import {
  OVERVIEW_COLUMNS, type OverviewRow, cityName, formatMinor, isDate, presetRange, rangeProblem,
} from '@/lib/finance';
import { FinanceNav, RangeBar } from '@/components/console/finance';
import {
  Column, DataTable, Empty, ErrorState, MetricTile, PageHeader, Panel, Skeleton, TableToolbar,
  TileGrid,
} from '@/components/console/ui';

/**
 * Finance overview: per city, per currency, per day, for a range.
 *
 * TABLE FIRST. The figures an operator can reconcile against are rows, so the
 * rows lead and the totals sit above them as one tile set per currency.
 *
 * NO CROSS-CURRENCY TOTAL, ANYWHERE. Rupees and dollars are different money:
 * every total here is the server's per-currency total, and a currency with
 * nothing in the range simply has no tile. A day is a day in the city's own
 * timezone; the server decides which instants those are.
 */
type Overview = {
  range: { from: string; to: string };
  rows: OverviewRow[];
  totals: Array<{ currency: string } & Record<string, number | string>>;
  note?: string;
  // A COUNT per country of drivers the latest weekly payout run skipped (no payout details).
  skipped_in_latest_run?: Array<{ country: string; week_start: string; count: number }>;
};

function OverviewInner() {
  const router = useRouter();
  const search = useSearchParams();
  const fallback = useMemo(() => presetRange(14), []);
  const from = isDate(search.get('from')) ? (search.get('from') as string) : fallback.from;
  const to = isDate(search.get('to')) ? (search.get('to') as string) : fallback.to;

  const [density, setDensity] = useDensity();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    const problem = rangeProblem(from, to);
    if (problem) { setError(problem); return; }
    try {
      setData(await api.get<Overview>(withScope(`/payments/admin/overview/?from=${from}&to=${to}`)));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load the finance overview.');
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const money = (key: (typeof OVERVIEW_COLUMNS)[number][0]) => (r: OverviewRow) =>
    formatMinor(r[key], r.currency);

  const columns: Column<OverviewRow>[] = [
    { key: 'city', label: 'City', sortValue: (r) => cityName(r.city), render: (r) => cityName(r.city) },
    { key: 'day', label: 'Day', width: '7.5rem', sortValue: (r) => r.day, render: (r) => r.day },
    { key: 'currency', label: 'Currency', width: '7rem', sortValue: (r) => r.currency, render: (r) => r.currency },
    ...OVERVIEW_COLUMNS.map(([key, label], i): Column<OverviewRow> => ({
      key, label, num: true, sortValue: (r) => r[key], render: money(key),
      hideBelow: i >= 4 ? 1280 : undefined,
    })),
  ];

  const rows = data?.rows ?? [];
  const go = (range: { from: string; to: string }) =>
    router.push(`/finance?from=${range.from}&to=${range.to}`);

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle="Money collected, kept and paid out, by city and currency. Nothing here adds one currency to another."
      />
      <FinanceNav />

      {data && data.totals.length > 0 && (
        <TileGrid>
          {data.totals.flatMap((t) => [
            <MetricTile key={`${t.currency}-gross`} label={`Gross collected · ${t.currency}`} tone="money"
              value={formatMinor(Number(t.gross_minor), t.currency)}
              note={`Commission ${formatMinor(Number(t.commission_minor), t.currency)} · driver net ${formatMinor(Number(t.driver_net_minor), t.currency)}`} />,
            <MetricTile key={`${t.currency}-pending`} label={`Payouts pending · ${t.currency}`} tone="wait"
              value={formatMinor(Number(t.payouts_pending_minor), t.currency)}
              note={`Paid ${formatMinor(Number(t.payouts_paid_minor), t.currency)} · failed ${formatMinor(Number(t.payouts_failed_minor), t.currency)} · refunds ${formatMinor(Number(t.refunds_minor), t.currency)}`} />,
          ])}
        </TileGrid>
      )}

      {(data?.skipped_in_latest_run ?? []).map((r) => (
        <div key={r.country} className="ops-note ops-note--warn mb-4" role="status">
          <b>{r.country}: {r.count} driver{r.count === 1 ? '' : 's'} skipped in the weekly payout run of {r.week_start}.</b>{' '}
          They have no payout details; they are asked to add them and are picked up the week they do.
        </div>
      ))}

      <Panel flush>
        <RangeBar from={from} to={to} onApply={go} idPrefix="overview" />
        <TableToolbar
          summary={data ? `${rows.length} row${rows.length === 1 ? '' : 's'} · ${from} to ${to}` : null}
          density={density}
          onDensity={setDensity}
        />
        {data === null && !error ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the finance overview</span>
            <Skeleton kind="row" count={6} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState title="The overview could not be loaded"
              detail={`${error} This is not the same as there being no money in the range.`}
              onRetry={() => void load()} />
          </div>
        ) : rows.length === 0 ? (
          <Empty title="No money moved in this range"
            detail="Nothing was settled, refunded or paid out in your scope between these dates." />
        ) : (
          <DataTable
            caption="Finance by city, currency and day"
            rows={rows}
            columns={columns}
            rowKey={(r) => `${r.city?.code ?? 'none'}|${r.day}|${r.currency}`}
            density={density}
            defaultSort={{ key: 'day', dir: 'desc' }}
          />
        )}
      </Panel>
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
