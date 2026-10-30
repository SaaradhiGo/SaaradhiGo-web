'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useDensity } from '@/lib/consolePrefs';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  PAYMENT_METHODS, PAYMENT_STATUSES, type ListFilters, activeFilterCount, apiPath, cityName,
  formatMinor, paymentTone,
} from '@/lib/finance';
import { useFinanceList } from '@/lib/useFinanceList';
import { PageLink } from '@/components/console/PageLink';
import { ExportButton, FinanceNav, Pager, RangeBar } from '@/components/console/finance';
import {
  Column, DataTable, Drawer, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Rider charges, newest first.
 *
 * A payment is anchored at the trip's city. The gateway ids are shown by
 * their last four characters only (enough to find one at the gateway, not to
 * use it), and nothing the gateway sent is shown here: no signature, no
 * customer details, no raw webhook.
 */
type PaymentRow = {
  id: number;
  trip_id: number;
  city: { code: string; name: string } | null;
  rider_name: string;
  amount_minor: number;
  currency: string;
  method: string;
  status: string;
  gateway: string;
  gateway_order_id: string | null;
  gateway_payment_id: string | null;
  replaced_by_id: number | null;
  created_at: string;
};
type Totals = { totals: Array<{ currency: string; count: number; amount_minor: number }> };

function PaymentsInner() {
  const { filters, data, error, reload, go } = useFinanceList<PaymentRow, Totals>('/payments/admin/payments/');
  const [density, setDensity] = useDensity();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ListFilters>(filters);
  useEffect(() => setDraft(filters), [filters.status, filters.method, filters.currency, filters.q]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: Column<PaymentRow>[] = [
    {
      key: 'id', label: 'Payment', width: '6.5rem', sortValue: (p) => p.id,
      render: (p) => <Link href={`/finance/payments/${p.id}`}>#{p.id}</Link>,
    },
    {
      key: 'trip', label: 'Trip', width: '6rem', sortValue: (p) => p.trip_id,
      render: (p) => <PageLink page="trips" href={`/trips/${p.trip_id}`}>#{p.trip_id}</PageLink>,
    },
    { key: 'city', label: 'City', sortValue: (p) => cityName(p.city), render: (p) => cityName(p.city), hideBelow: 1100 },
    { key: 'rider', label: 'Rider', sortValue: (p) => p.rider_name, render: (p) => p.rider_name || '—', hideBelow: 1280 },
    {
      key: 'amount', label: 'Amount', num: true, width: '9rem', sortValue: (p) => p.amount_minor,
      render: (p) => formatMinor(p.amount_minor, p.currency),
    },
    { key: 'method', label: 'Method', width: '6rem', render: (p) => p.method },
    {
      key: 'status', label: 'Status', width: '7.5rem',
      render: (p) => <Pill tone={paymentTone(p.status)}>{p.status}</Pill>,
    },
    { key: 'gateway', label: 'Gateway ref', width: '9rem', hideBelow: 1280, render: (p) => p.gateway_order_id || '—' },
    {
      key: 'when', label: 'Created', num: true, width: '9.5rem', sortValue: (p) => p.created_at,
      render: (p) => stamp(p.created_at, timeZoneFor(p.city?.code)),
    },
  ];

  const rows = data?.results ?? [];
  const exportPath = apiPath('/payments/admin/export/payments/', { ...filters, page: 1 });
  const hasDates = Boolean(filters.from && filters.to);

  return (
    <>
      <PageHeader title="Finance" subtitle="Rider charges, with their gateway and any refunds." />
      <FinanceNav />
      <Panel flush>
        <RangeBar from={filters.from} to={filters.to} idPrefix="payments"
          onApply={(r) => go({ ...filters, ...r, page: 1 })} />
        <TableToolbar
          summary={data ? `${data.count} payment${data.count === 1 ? '' : 's'}${hasDates ? ` · ${filters.from} to ${filters.to}` : ''}` : null}
          density={density}
          onDensity={setDensity}
          onFilters={() => setOpen(true)}
          filtersActive={activeFilterCount(filters, ['from', 'to'])}
        >
          {hasDates && (
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
              onClick={() => go({ ...filters, from: '', to: '', page: 1 })}>All dates</button>
          )}
          <ExportButton path={exportPath} />
        </TableToolbar>
        {data === null && !error ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading payments</span>
            <Skeleton kind="row" count={6} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState title="Payments could not be loaded"
              detail={`${error} This is not the same as there being no payments.`} onRetry={() => void reload()} />
          </div>
        ) : rows.length === 0 ? (
          <Empty title="No payments match" detail="Nothing in your scope matches these filters." />
        ) : (
          <>
            <DataTable caption="Payments" rows={rows} columns={columns} rowKey={(p) => p.id} density={density} />
            <div className="ops-totals" aria-label="Totals of the matching payments, per currency">
              {(data?.totals ?? []).map((t) => (
                <div className="ops-totals__group" key={t.currency}>
                  <b>{formatMinor(t.amount_minor, t.currency)}</b>
                  <span>{t.currency} · {t.count} payment{t.count === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
            <Pager page={data?.page ?? 1} totalPages={data?.total_pages ?? 1}
              onPage={(p) => go({ ...filters, page: p })} />
          </>
        )}
      </Panel>

      <Drawer open={open} title="Filter payments" onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
              onClick={() => setDraft({ ...draft, status: '', method: '', currency: '', q: '' })}>Reset</button>
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
              onClick={() => { go({ ...draft, page: 1 }); setOpen(false); }}>Show payments</button>
          </>
        }
      >
        <div className="ops-form">
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="pf-status">Status</label>
            <select id="pf-status" className="ops-select" value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="">Any</option>
              {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="pf-method">Method</label>
            <select id="pf-method" className="ops-select" value={draft.method}
              onChange={(e) => setDraft({ ...draft, method: e.target.value })}>
              <option value="">Any</option>
              {PAYMENT_METHODS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="pf-currency">Currency</label>
            <input id="pf-currency" className="ops-select" maxLength={3} placeholder="e.g. INR" value={draft.currency}
              onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />
          </div>
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="pf-q">Gateway order id</label>
            <input id="pf-q" className="ops-select" value={draft.q} placeholder="Exact order or payment id"
              onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
          </div>
        </div>
      </Drawer>
    </>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <PaymentsInner />
    </Suspense>
  );
}
