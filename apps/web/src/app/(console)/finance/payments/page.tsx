'use client';

import { Suspense, useEffect, useState } from 'react';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  PAYMENT_METHODS, PAYMENT_STATUSES, type ListFilters, apiPath, cityName, filtersFromSearch,
  filtersToQuery, formatWhole,
} from '@/lib/finance';
import { useFinanceList } from '@/lib/useFinanceList';
import { PageLink } from '@/components/console/PageLink';
import { ExportButton, FinanceNav, RangeBar } from '@/components/console/finance';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { CurrencyTotals, financeChips, paymentChipTone, savedQuery, statusViews, words } from '@/components/console/money/moneyKit';
import { PaymentRecord } from '@/components/console/money/PaymentRecord';
import { Drawer, Skeleton } from '@/components/console/ui';

/**
 * Rider charges, newest first, with the charge opened beside the list.
 *
 * A payment is anchored at the trip's city. The gateway ids are shown by
 * reference only, and nothing the gateway sent is shown here: no signature,
 * no customer details, no raw webhook.
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
  const { filters, data, error, go } = useFinanceList<PaymentRow, Totals>('/payments/admin/payments/');
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ListFilters>(filters);
  useEffect(() => setDraft(filters), [filters.status, filters.method, filters.currency, filters.q]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: ListColumn<PaymentRow>[] = [
    { key: 'id', label: 'Payment', width: '6rem', primary: true, render: (p) => `#${p.id}` },
    {
      key: 'trip', label: 'Trip', width: '7rem',
      render: (p) => <PageLink page="trips" href={`/trips/${p.trip_id}`}>T-{p.trip_id}</PageLink>,
    },
    { key: 'city', label: 'City', render: (p) => cityName(p.city) },
    { key: 'rider', label: 'Rider', render: (p) => p.rider_name || '—' },
    { key: 'amount', label: 'Amount', num: true, render: (p) => formatWhole(p.amount_minor, p.currency) },
    { key: 'method', label: 'Method', render: (p) => words(p.method) },
    { key: 'status', label: 'Status', render: (p) => <StatusChip tone={paymentChipTone(p.status)}>{words(p.status)}</StatusChip> },
    { key: 'gateway', label: 'Gateway ref', render: (p) => p.gateway_order_id || '—' },
    { key: 'when', label: 'Created', num: true, render: (p) => stamp(p.created_at, timeZoneFor(p.city?.code)) },
  ];

  const rows = data?.results ?? [];
  const exportPath = apiPath('/payments/admin/export/payments/', { ...filters, page: 1 });
  const query = savedQuery(filtersToQuery(filters));

  return (
    <>
      <FinanceNav />
      <div className={openId !== null ? 'ops-split' : undefined}>
        <ListPage<PaymentRow>
          pageKey="finance-payments"
          title="Payments"
          summary={data ? <CurrencyTotals totals={data.totals ?? []} noun="payment" amount="amount_minor" /> : 'Rider charges, with their gateway and any refunds.'}
          views={statusViews(PAYMENT_STATUSES, filters.status, data?.count)}
          view={filters.status}
          onView={(status) => go({ ...filters, status, page: 1 })}
          chips={financeChips(filters, go, { qLabel: 'Gateway id' })}
          filterSlot={(
            <>
              <RangeBar from={filters.from} to={filters.to} idPrefix="payments"
                onApply={(r) => go({ ...filters, ...r, page: 1 })} />
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setOpen(true)}>More filters</button>
              <ExportButton path={exportPath} />
            </>
          )}
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          total={data ? data.count : null}
          page={data?.page ?? filters.page}
          pageSize={data?.page_size ?? 25}
          onPage={(p) => go({ ...filters, page: p })}
          onRow={(p) => setOpenId(p.id)}
          activeKey={openId}
          loading={data === null && !error}
          error={error ? `Payments could not be loaded. ${error} This is not the same as there being no payments.` : null}
          empty="No payments in your scope match these filters."
          currentQuery={query || undefined}
          onSavedView={(q) => go(filtersFromSearch(new URLSearchParams(q)))}
        />
        {openId !== null ? <PaymentRecord id={openId} onClose={() => setOpenId(null)} /> : null}
      </div>

      <Drawer open={open} title="Filter payments" onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
              onClick={() => setDraft({ ...draft, method: '', currency: '', q: '' })}>Reset</button>
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
              onClick={() => { go({ ...draft, page: 1 }); setOpen(false); }}>Show payments</button>
          </>
        }
      >
        <div className="ops-form">
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="pf-method">Method</label>
            <select id="pf-method" className="ops-select" value={draft.method}
              onChange={(e) => setDraft({ ...draft, method: e.target.value })}>
              <option value="">Any</option>
              {PAYMENT_METHODS.map((s) => <option key={s} value={s}>{words(s)}</option>)}
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
