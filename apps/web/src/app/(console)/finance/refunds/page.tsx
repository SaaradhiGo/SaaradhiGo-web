'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import { cityName, filtersFromSearch, filtersToQuery, formatWhole } from '@/lib/finance';
import { useFinanceList } from '@/lib/useFinanceList';
import { PageLink } from '@/components/console/PageLink';
import { FinanceNav, RangeBar } from '@/components/console/finance';
import { ListPage, type ListColumn, type ListView } from '@/components/console/kit/ListPage';
import { StatusChip, type ChipTone } from '@/components/console/kit/StatusChip';
import { CurrencyTotals, financeChips, savedQuery } from '@/components/console/money/moneyKit';
import { Skeleton } from '@/components/console/ui';

/**
 * Refunds, read-only: money already returned to riders plus requests still
 * waiting for a second person. Deciding happens on the Approvals page.
 */
type RefundRow = {
  id: number;
  source: 'ledger' | 'approval';
  trip_id: number;
  amount_minor: number;
  currency: string;
  method: string;
  method_label: string;
  status: 'completed' | 'pending_gateway' | 'recorded' | 'waiting';
  reason: string;
  city: { code: string; name: string } | null;
  created_at: string;
  created_by: string | null;
  approval_request_id: number | null;
  expires_at?: string | null;
};
type Extra = {
  view: string;
  counts: { waiting: number; pending_gateway: number };
  totals: Array<{ currency: string; count: number; amount_minor: number }>;
};

const STATUS: Record<RefundRow['status'], { label: string; tone: ChipTone }> = {
  waiting: { label: 'Waiting', tone: 'info' },
  pending_gateway: { label: 'Not yet sent', tone: 'caution' },
  completed: { label: 'Completed', tone: 'good' },
  recorded: { label: 'Recorded', tone: 'neutral' },
};

function RefundsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const cur = filtersFromSearch(new URLSearchParams(search.toString()));
  const view = ['waiting', 'pending_gateway', 'done'].includes(cur.status) ? cur.status : 'all';
  const { filters, data, error, go } = useFinanceList<RefundRow, Extra>(
    '/payments/admin/refunds/', { view, ...(cur.q ? { trip: cur.q.replace(/^T-/i, '') } : {}) },
  );

  const columns: ListColumn<RefundRow>[] = [
    {
      key: 'trip', label: 'Trip', width: '7rem', primary: true,
      render: (r) => <PageLink page="trips" href={`/trips/${r.trip_id}`}>T-{r.trip_id}</PageLink>,
    },
    { key: 'amount', label: 'Amount', num: true, render: (r) => formatWhole(r.amount_minor, r.currency) },
    {
      key: 'status', label: 'Status',
      render: (r) => <StatusChip tone={STATUS[r.status]?.tone ?? 'neutral'}>{STATUS[r.status]?.label ?? r.status}</StatusChip>,
    },
    { key: 'how', label: 'How', render: (r) => r.method_label || 'Decided at approval' },
    { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
    { key: 'city', label: 'City', render: (r) => cityName(r.city) },
    { key: 'by', label: 'Requested by', render: (r) => r.created_by || '—' },
    { key: 'when', label: 'When', num: true, render: (r) => stamp(r.created_at, timeZoneFor(r.city?.code)) },
  ];

  const counts = data?.counts;
  const views: ListView[] = [
    { key: '', label: 'All', count: view === 'all' ? data?.count ?? null : undefined },
    { key: 'waiting', label: 'Waiting for approval', count: counts?.waiting },
    { key: 'pending_gateway', label: 'Not yet sent to provider', count: counts?.pending_gateway },
    { key: 'done', label: 'Done', count: view === 'done' ? data?.count ?? null : undefined },
  ];
  const query = savedQuery(filtersToQuery(filters));

  return (
    <>
      <FinanceNav />
      {view === 'pending_gateway' ? (
        <p className="ops-note">
          Gateway refunds are recorded but not yet sent to the payment provider; finance completes them outside the console for now.
        </p>
      ) : null}
      <ListPage<RefundRow>
        pageKey="finance-refunds"
        title="Refunds"
        summary={data ? <CurrencyTotals totals={data.totals ?? []} noun="refund" amount="amount_minor" /> : 'Refunds paid and refunds waiting for approval.'}
        views={views}
        view={view === 'all' ? '' : view}
        onView={(status) => go({ ...filters, status, page: 1 })}
        chips={financeChips(filters, go, { qLabel: 'Trip' })}
        filterSlot={(
          <>
            <RangeBar from={filters.from} to={filters.to} idPrefix="refunds"
              onApply={(r) => go({ ...filters, ...r, page: 1 })} />
            <input className="ops-select" aria-label="Trip id" placeholder="Trip id" defaultValue={filters.q}
              onKeyDown={(e) => { if (e.key === 'Enter') go({ ...filters, q: e.currentTarget.value.trim(), page: 1 }); }} />
            <input className="ops-select" aria-label="Currency" maxLength={3} placeholder="Currency" defaultValue={filters.currency}
              onKeyDown={(e) => { if (e.key === 'Enter') go({ ...filters, currency: e.currentTarget.value.trim().toUpperCase(), page: 1 }); }} />
          </>
        )}
        columns={columns}
        rows={data?.results ?? []}
        rowKey={(r) => `${r.source}-${r.id}`}
        total={data ? data.count : null}
        page={data?.page ?? filters.page}
        pageSize={data?.page_size ?? 25}
        onPage={(p) => go({ ...filters, page: p })}
        onRow={(r) => router.push(r.status === 'waiting' && r.approval_request_id
          ? `/approvals?id=${r.approval_request_id}` : `/trips/${r.trip_id}`)}
        loading={data === null && !error}
        error={error ? `Refunds could not be loaded. ${error} This is not the same as there being no refunds.` : null}
        empty="No refunds in your scope match these filters."
        currentQuery={query || undefined}
        onSavedView={(q) => go(filtersFromSearch(new URLSearchParams(q)))}
      />
    </>
  );
}

export default function RefundsPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <RefundsInner />
    </Suspense>
  );
}
