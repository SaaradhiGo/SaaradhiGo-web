'use client';

import { Suspense, useEffect, useState } from 'react';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  type ListFilters, apiPath, cityName, filtersFromSearch, filtersToQuery, formatMinor, formatWhole,
} from '@/lib/finance';
import { useFinanceList } from '@/lib/useFinanceList';
import { PageButtonLink, PageLink } from '@/components/console/PageLink';
import { ExportButton, FinanceNav, LedgerLink, RangeBar } from '@/components/console/finance';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { RecordPanel, RecordStat } from '@/components/console/kit/RecordPanel';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { CurrencyTotals, financeChips, savedQuery, words } from '@/components/console/money/moneyKit';
import { Drawer, Fact, Facts, Skeleton } from '@/components/console/ui';

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

const METHODS = ['online', 'cash', 'wallet'] as const;

function SourceChip({ source }: { source: string }) {
  return source === 'reconstructed'
    ? <StatusChip tone="info" title="Rebuilt later from historical facts">Reconstructed</StatusChip>
    : <StatusChip tone="neutral">Native</StatusChip>;
}

function SettlementRecord({ row, onClose }: { row: Row; onClose: () => void }) {
  const tz = timeZoneFor(row.city?.code);
  return (
    <RecordPanel
      label="Settlement"
      title={row.driver_name || `Driver D-${row.driver_id}`}
      refId={`T-${row.trip_id}`}
      subtitle={<>{cityName(row.city)} · settled {stamp(row.settled_at, tz)}</>}
      status={<SourceChip source={row.source} />}
      onClose={onClose}
      actions={(
        <>
          <PageButtonLink page="trips" href={`/trips/${row.trip_id}`} variant="ghost">Open trip</PageButtonLink>
          <LedgerLink driverId={row.driver_id} />
        </>
      )}
      tabs={[{
        key: 'money', label: 'Money', content: (
          <div className="grid gap-3">
            <div className="ops-record__stats">
              <RecordStat label="Gross" value={formatMinor(row.gross_fare_minor, row.currency)} />
              <RecordStat label="Commission" value={formatMinor(row.commission_amount_minor, row.currency)} note={`${Number(row.commission_percent)}% as applied`} />
              <RecordStat label="Driver net" value={formatMinor(row.driver_net_minor, row.currency)} />
            </div>
            <Facts>
              <Fact label="Trip"><PageLink page="trips" href={`/trips/${row.trip_id}`}>T-{row.trip_id}</PageLink></Fact>
              <Fact label="Driver"><PageLink page="drivers" href={`/drivers/${row.driver_id}`}>D-{row.driver_id}</PageLink></Fact>
              <Fact label="Payment method">{words(row.payment_method)}</Fact>
              <Fact label="Currency">{row.currency}</Fact>
              <Fact label="Version">{row.version}</Fact>
              <Fact label="Source">{row.source === 'reconstructed' ? 'Reconstructed from historical facts' : 'Written when the trip settled'}</Fact>
            </Facts>
          </div>
        ),
      }]}
    />
  );
}

function SettlementsInner() {
  const { filters, data, error, go } = useFinanceList<Row, Totals>('/payments/admin/settlements/');
  const [open, setOpen] = useState(false);
  const [openRow, setOpenRow] = useState<Row | null>(null);
  const [draft, setDraft] = useState<ListFilters>(filters);
  useEffect(() => setDraft(filters), [filters.method, filters.currency]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: ListColumn<Row>[] = [
    {
      key: 'trip', label: 'Trip', width: '7rem', primary: true,
      render: (r) => <PageLink page="trips" href={`/trips/${r.trip_id}`}>T-{r.trip_id}</PageLink>,
    },
    { key: 'city', label: 'City', render: (r) => cityName(r.city) },
    {
      key: 'driver', label: 'Driver',
      render: (r) => <PageLink page="drivers" href={`/drivers/${r.driver_id}`}>{r.driver_name || `D-${r.driver_id}`}</PageLink>,
    },
    { key: 'gross', label: 'Gross', num: true, render: (r) => formatWhole(r.gross_fare_minor, r.currency) },
    {
      key: 'commission', label: 'Commission', num: true,
      render: (r) => `${formatWhole(r.commission_amount_minor, r.currency)} · ${Number(r.commission_percent)}%`,
    },
    { key: 'net', label: 'Driver net', num: true, render: (r) => formatWhole(r.driver_net_minor, r.currency) },
    { key: 'method', label: 'Method', render: (r) => words(r.payment_method) },
    { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.source} /> },
    { key: 'when', label: 'Settled', num: true, render: (r) => stamp(r.settled_at, timeZoneFor(r.city?.code)) },
  ];

  const query = savedQuery(filtersToQuery(filters));
  const views = [
    { key: '', label: 'All', count: filters.method === '' ? data?.count ?? null : undefined },
    ...METHODS.map((m) => ({ key: m, label: words(m), count: filters.method === m ? data?.count ?? null : undefined })),
  ];

  return (
    <>
      <FinanceNav />
      <div className={openRow ? 'ops-split' : undefined}>
        <ListPage<Row>
          pageKey="finance-settlements"
          title="Settlements"
          summary={data ? <CurrencyTotals totals={data.totals ?? []} noun="trip" amount="gross_minor" /> : 'What each settled trip paid out: gross, commission as applied, driver net.'}
          views={views}
          view={filters.method}
          onView={(method) => go({ ...filters, method, page: 1 })}
          chips={financeChips(filters, go).filter((c) => c.key !== 'method')}
          filterSlot={(
            <>
              <RangeBar from={filters.from} to={filters.to} idPrefix="settlements"
                onApply={(r) => go({ ...filters, ...r, page: 1 })} />
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setOpen(true)}>More filters</button>
              <ExportButton path={apiPath('/payments/admin/export/settlements/', { ...filters, page: 1 })} />
            </>
          )}
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(r) => r.id}
          total={data ? data.count : null}
          page={data?.page ?? filters.page}
          pageSize={data?.page_size ?? 25}
          onPage={(p) => go({ ...filters, page: p })}
          onRow={setOpenRow}
          activeKey={openRow?.id ?? null}
          loading={data === null && !error}
          error={error ? `Settlements could not be loaded. ${error} This is not the same as there being none.` : null}
          empty="No trip in your scope settled under these filters."
          currentQuery={query || undefined}
          onSavedView={(q) => go(filtersFromSearch(new URLSearchParams(q)))}
        />
        {openRow ? <SettlementRecord row={openRow} onClose={() => setOpenRow(null)} /> : null}
      </div>

      <Drawer open={open} title="Filter settlements" onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
              onClick={() => setDraft({ ...draft, currency: '' })}>Reset</button>
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
              onClick={() => { go({ ...draft, page: 1 }); setOpen(false); }}>Show settlements</button>
          </>
        }
      >
        <div className="ops-form">
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
