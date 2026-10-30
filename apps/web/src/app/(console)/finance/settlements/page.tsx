'use client';

import { Suspense, useEffect, useState } from 'react';
import { useDensity } from '@/lib/consolePrefs';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  type ListFilters, activeFilterCount, apiPath, cityName, formatMinor,
} from '@/lib/finance';
import { useFinanceList } from '@/lib/useFinanceList';
import { PageLink } from '@/components/console/PageLink';
import { ExportButton, FinanceNav, Pager, RangeBar } from '@/components/console/finance';
import {
  Column, DataTable, Drawer, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * What each settled trip paid out: gross, the commission rate AS APPLIED,
 * the commission and the driver's net. Totals are per currency.
 *
 * "Source" says whether the row was written when the trip settled or
 * reconstructed later from historical facts; a reconstructed row is evidence
 * with a caveat and is labelled so.
 */
type Row = {
  id: number;
  trip_id: number;
  driver_id: number;
  driver_name: string;
  city: { code: string; name: string } | null;
  gross_fare_minor: number;
  commission_percent: string;
  commission_amount_minor: number;
  driver_net_minor: number;
  currency: string;
  payment_method: string;
  source: string;
  version: number;
  settled_at: string;
};
type Totals = {
  totals: Array<{ currency: string; count: number; gross_minor: number; commission_minor: number; driver_net_minor: number }>;
};

function SettlementsInner() {
  const { filters, data, error, reload, go } = useFinanceList<Row, Totals>('/payments/admin/settlements/');
  const [density, setDensity] = useDensity();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ListFilters>(filters);
  useEffect(() => setDraft(filters), [filters.method, filters.currency]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: Column<Row>[] = [
    {
      key: 'trip', label: 'Trip', width: '6rem', sortValue: (r) => r.trip_id,
      render: (r) => <PageLink page="trips" href={`/trips/${r.trip_id}`}>#{r.trip_id}</PageLink>,
    },
    { key: 'city', label: 'City', hideBelow: 1100, sortValue: (r) => cityName(r.city), render: (r) => cityName(r.city) },
    {
      key: 'driver', label: 'Driver', sortValue: (r) => r.driver_name,
      render: (r) => <PageLink page="drivers" href={`/drivers/${r.driver_id}`}>{r.driver_name || `Driver #${r.driver_id}`}</PageLink>,
    },
    { key: 'gross', label: 'Gross', num: true, width: '8.5rem', sortValue: (r) => r.gross_fare_minor, render: (r) => formatMinor(r.gross_fare_minor, r.currency) },
    {
      key: 'commission', label: 'Commission', num: true, width: '10.5rem', sortValue: (r) => r.commission_amount_minor,
      render: (r) => `${formatMinor(r.commission_amount_minor, r.currency)} · ${Number(r.commission_percent)}%`,
    },
    { key: 'net', label: 'Driver net', num: true, width: '8.5rem', sortValue: (r) => r.driver_net_minor, render: (r) => formatMinor(r.driver_net_minor, r.currency) },
    { key: 'method', label: 'Method', width: '6rem', hideBelow: 1280, render: (r) => r.payment_method || '—' },
    {
      key: 'source', label: 'Source', width: '8rem', hideBelow: 1280,
      render: (r) => (r.source === 'reconstructed' ? <Pill tone="wait">Reconstructed</Pill> : <span>Native</span>),
    },
    { key: 'version', label: 'Ver.', width: '4rem', num: true, hideBelow: 1500, render: (r) => r.version },
    { key: 'when', label: 'Settled', num: true, width: '9.5rem', sortValue: (r) => r.settled_at, render: (r) => stamp(r.settled_at, timeZoneFor(r.city?.code)) },
  ];

  const rows = data?.results ?? [];
  const hasDates = Boolean(filters.from && filters.to);

  return (
    <>
      <PageHeader title="Finance" subtitle="What each settled trip paid out: gross, commission as applied, driver net." />
      <FinanceNav />
      <Panel flush>
        <RangeBar from={filters.from} to={filters.to} idPrefix="settlements"
          onApply={(r) => go({ ...filters, ...r, page: 1 })} />
        <TableToolbar
          summary={data ? `${data.count} settlement${data.count === 1 ? '' : 's'}${hasDates ? ` · ${filters.from} to ${filters.to}` : ''}` : null}
          density={density}
          onDensity={setDensity}
          onFilters={() => setOpen(true)}
          filtersActive={activeFilterCount(filters, ['from', 'to'])}
        >
          {hasDates && (
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
              onClick={() => go({ ...filters, from: '', to: '', page: 1 })}>All dates</button>
          )}
          <ExportButton path={apiPath('/payments/admin/export/settlements/', { ...filters, page: 1 })} />
        </TableToolbar>
        {data === null && !error ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading settlements</span>
            <Skeleton kind="row" count={6} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState title="Settlements could not be loaded"
              detail={`${error} This is not the same as there being none.`} onRetry={() => void reload()} />
          </div>
        ) : rows.length === 0 ? (
          <Empty title="No settlements match" detail="No trip in your scope settled under these filters." />
        ) : (
          <>
            <DataTable caption="Settlements" rows={rows} columns={columns} rowKey={(r) => r.id} density={density} />
            <div className="ops-totals" aria-label="Totals of the matching settlements, per currency">
              {(data?.totals ?? []).map((t) => (
                <div className="ops-totals__group" key={t.currency}>
                  <b>{formatMinor(t.gross_minor, t.currency)} gross</b>
                  <span>
                    {t.currency} · commission {formatMinor(t.commission_minor, t.currency)} · driver net{' '}
                    {formatMinor(t.driver_net_minor, t.currency)} · {t.count} trip{t.count === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
            <Pager page={data?.page ?? 1} totalPages={data?.total_pages ?? 1}
              onPage={(p) => go({ ...filters, page: p })} />
          </>
        )}
      </Panel>

      <Drawer open={open} title="Filter settlements" onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
              onClick={() => setDraft({ ...draft, method: '', currency: '' })}>Reset</button>
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
              onClick={() => { go({ ...draft, page: 1 }); setOpen(false); }}>Show settlements</button>
          </>
        }
      >
        <div className="ops-form">
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="sf-method">Payment method</label>
            <select id="sf-method" className="ops-select" value={draft.method}
              onChange={(e) => setDraft({ ...draft, method: e.target.value })}>
              <option value="">Any</option>
              <option value="online">online</option>
              <option value="cash">cash</option>
              <option value="wallet">wallet</option>
            </select>
          </div>
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="sf-currency">Currency</label>
            <input id="sf-currency" className="ops-select" maxLength={3} placeholder="e.g. INR" value={draft.currency}
              onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />
          </div>
        </div>
      </Drawer>
    </>
  );
}

export default function SettlementsPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <SettlementsInner />
    </Suspense>
  );
}
