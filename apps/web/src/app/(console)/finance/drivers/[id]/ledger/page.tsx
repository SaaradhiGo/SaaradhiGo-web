'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  LEDGER_KIND, LEDGER_PURPOSE, cityName, formatMinor, isDate, rangeProblem, signedMoney,
} from '@/lib/finance';
import { canAdjustBalance } from '@/lib/financeActions';
import { AdjustBalanceDrawer } from '@/components/console/FinanceActionDrawers';
import { PageLink } from '@/components/console/PageLink';
import { FinanceNav, Pager, RangeBar } from '@/components/console/finance';
import {
  Column, DataTable, Empty, ErrorState, MetricTile, PageHeader, Panel, Skeleton, TableToolbar,
  TileGrid,
} from '@/components/console/ui';

/**
 * One driver's statement: opening balance, what moved, closing balance.
 *
 * The closing balance is the opening plus the movements, and when the range
 * ends now it is the driver's available balance. If the wallet holds money
 * the ledger cannot explain, the page says so in words rather than closing on
 * a different figure. Memo lines (a payout being paid, a fare adjustment)
 * are shown but move nothing in the wallet and are never in a sum.
 */
type Entry = {
  id: number; at: string; kind: string; purpose: string; label?: string; funded_by?: 'platform'; direction: 'credit' | 'debit';
  amount_minor: number; currency: string; running_balance_minor: number; status: string;
  trip_id: number | null; withdrawal_id: number | null;
  adjustment?: { approval_request_id: number; reason_code: string | null; note: string | null } | null;
  settlement?: { gross_fare_minor: number; commission_percent: string; commission_amount_minor: number;
    driver_net_minor: number; payment_method: string; version: number };
};
type Memo = {
  id: string; at: string; kind: string; amount_minor: number; currency: string; note: string;
  trip_id?: number; withdrawal_id?: number;
};
type Ledger = {
  driver: { id: number; driver_name: string; home_city: { code: string; name: string } | null };
  range: { from: string; to: string; timezone: string };
  has_wallet: boolean;
  currency: string | null;
  opening_minor?: number; credits_minor?: number; debits_minor?: number; closing_minor?: number;
  balance_minor?: number; unexplained_minor?: number; other_currency_rows?: number;
  entries: { count: number; page: number; page_size: number; results: Entry[] };
  memo: Memo[];
};

function LedgerInner() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const search = useSearchParams();
  const from = isDate(search.get('from')) ? (search.get('from') as string) : '';
  const to = isDate(search.get('to')) ? (search.get('to') as string) : '';
  const page = Math.max(1, Number(search.get('page')) || 1);

  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const [adjusting, setAdjusting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; kind: 'pending' | 'done' } | null>(null);
  const [data, setData] = useState<Ledger | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    if (from && to) {
      const problem = rangeProblem(from, to);
      if (problem) { setError({ status: 400, message: problem }); return; }
    }
    const q = new URLSearchParams();
    if (from && to) { q.set('from', from); q.set('to', to); }
    if (page > 1) q.set('page', String(page));
    try {
      setData(await api.get<Ledger>(`/payments/admin/drivers/${id}/ledger/${q.toString() ? `?${q}` : ''}`));
    } catch (err) {
      setError(err instanceof ApiError
        ? { status: err.status, message: err.fromServer ? err.message : 'We could not load this statement.' }
        : { status: 0, message: 'We could not load this statement.' });
    }
  }, [id, from, to, page]);

  useEffect(() => { void load(); }, [load]);

  const go = (next: { from?: string; to?: string; page?: number }) => {
    const q = new URLSearchParams();
    const f = next.from ?? from;
    const t = next.to ?? to;
    if (f && t) { q.set('from', f); q.set('to', t); }
    if ((next.page ?? 1) > 1) q.set('page', String(next.page));
    router.push(`/finance/drivers/${id}/ledger${q.toString() ? `?${q}` : ''}`);
  };

  const tz = timeZoneFor(data?.driver.home_city?.code);
  const cur = data?.currency ?? '';
  const entries = data?.entries.results ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.entries.count / data.entries.page_size)) : 1;

  const columns: Column<Entry>[] = [
    { key: 'at', label: 'When', width: '9.5rem', num: true, render: (e) => stamp(e.at, tz) },
    {
      key: 'kind', label: 'Entry',
      render: (e) => (
        <>
          {e.label ?? LEDGER_PURPOSE[e.purpose] ?? LEDGER_KIND[e.kind] ?? e.kind.replace(/_/g, ' ')}
          {e.trip_id ? <> · <PageLink page="trips" href={`/trips/${e.trip_id}`}>trip #{e.trip_id}</PageLink></> : null}
          {e.adjustment ? (
            <span className="muted">
              {' '}· {(e.adjustment.reason_code ?? '').replace(/_/g, ' ')}{e.adjustment.note ? `: ${e.adjustment.note}` : ''} · request #{e.adjustment.approval_request_id}
            </span>
          ) : null}
          {e.settlement ? (
            <span className="muted">
              {' '}· gross {formatMinor(e.settlement.gross_fare_minor, e.currency)} at {Number(e.settlement.commission_percent)}% commission
            </span>
          ) : null}
        </>
      ),
    },
    { key: 'status', label: 'Status', width: '7rem', hideBelow: 1100, render: (e) => e.status },
    { key: 'amount', label: 'Amount', num: true, width: '9rem', render: (e) => signedMoney(e.amount_minor, e.currency) },
    { key: 'running', label: 'Balance', num: true, width: '9rem', render: (e) => formatMinor(e.running_balance_minor, e.currency) },
  ];
  const memoColumns: Column<Memo>[] = [
    { key: 'at', label: 'When', width: '9.5rem', num: true, render: (m) => stamp(m.at, tz) },
    { key: 'kind', label: 'Event', render: (m) => LEDGER_KIND[m.kind] ?? m.kind.replace(/_/g, ' ') },
    { key: 'amount', label: 'Amount', num: true, width: '9rem', render: (m) => formatMinor(m.amount_minor, m.currency) },
    { key: 'note', label: 'Note', hideBelow: 1100, render: (m) => m.note },
  ];

  return (
    <>
      <PageHeader
        title={data ? `Ledger · ${data.driver.driver_name || `Driver #${data.driver.id}`}` : 'Ledger'}
        subtitle={data ? (
          <>
            {cityName(data.driver.home_city)} · days are {data.range.timezone} days ·{' '}
            <PageLink page="drivers" href={`/drivers/${data.driver.id}`}>Driver record</PageLink>
          </>
        ) : 'A driver statement.'}
        actions={data && data.has_wallet && cur && canAdjustBalance(access) ? (
          <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setAdjusting(true)}>
            Adjust balance
          </button>
        ) : undefined}
      />
      <FinanceNav />
      {notice && (
        <div className={notice.kind === 'pending' ? 'ops-confirm mb-4' : 'alert-success mb-4'} role="status">
          <b>{notice.text}</b>
        </div>
      )}

      {data && data.has_wallet && cur && (
        <TileGrid>
          <MetricTile label={`Opening · ${cur}`} value={formatMinor(data.opening_minor, cur)} />
          <MetricTile label="Credits" tone="good" value={formatMinor(data.credits_minor, cur)} />
          <MetricTile label="Debits" value={formatMinor(data.debits_minor, cur)} />
          <MetricTile label={`Closing · ${cur}`} tone="money" value={formatMinor(data.closing_minor, cur)}
            note={`Available balance now ${formatMinor(data.balance_minor, cur)}`} />
        </TileGrid>
      )}
      {data && data.has_wallet && (data.unexplained_minor ?? 0) !== 0 && (
        <div className="ops-note ops-note--warn mb-4" role="alert">
          <b>The wallet and the ledger disagree.</b> The wallet holds {formatMinor(data.unexplained_minor, cur)}{' '}
          that no ledger row explains. The closing balance above is what the ledger adds up to;
          the available balance is what the wallet holds. Neither has been changed.
        </div>
      )}
      {data && (data.other_currency_rows ?? 0) > 0 && (
        <div className="ops-note ops-note--warn mb-4" role="alert">
          {data.other_currency_rows} ledger row{data.other_currency_rows === 1 ? ' is' : 's are'} in another
          currency than this wallet and {data.other_currency_rows === 1 ? 'is' : 'are'} not included here.
        </div>
      )}

      <Panel flush>
        <RangeBar from={data?.range.from ?? from} to={data?.range.to ?? to} idPrefix="ledger"
          onApply={(r) => go({ ...r, page: 1 })} />
        <TableToolbar
          summary={data && data.has_wallet ? `${data.entries.count} movement${data.entries.count === 1 ? '' : 's'}` : null}
          density={density}
          onDensity={setDensity}
        />
        {data === null && !error ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the statement</span>
            <Skeleton kind="row" count={6} />
          </div>
        ) : error ? (
          error.status === 404 ? (
            <Empty title="Driver not found" detail="They do not exist, or they are not in a place you can see." />
          ) : error.status === 403 ? (
            <Empty error title="You cannot open this statement" detail={error.message} />
          ) : (
            <div className="p-4">
              <ErrorState title="The statement could not be loaded"
                detail={`${error.message} This is not the same as there being no movements.`}
                onRetry={() => void load()} />
            </div>
          )
        ) : data && !data.has_wallet ? (
          <Empty title="No driver wallet" detail="This driver has no settlement wallet yet, so there is nothing to show." />
        ) : entries.length === 0 ? (
          <Empty title="No movements in this range"
            detail="The opening and closing balances above are equal; nothing moved." />
        ) : (
          <>
            <DataTable caption="Ledger entries" rows={entries} columns={columns} rowKey={(e) => e.id} density={density} />
            <Pager page={data?.entries.page ?? 1} totalPages={totalPages} onPage={(p) => go({ page: p })} />
          </>
        )}
      </Panel>

      {data && data.memo.length > 0 && (
        <div className="mt-4">
          <Panel title="Also in this range (moves no money in the wallet)" flush>
            <DataTable caption="Memo lines" rows={data.memo} columns={memoColumns} rowKey={(m) => m.id}
              density="compact" maxHeight={false} />
          </Panel>
        </div>
      )}
      {adjusting && data && cur ? (
        <AdjustBalanceDrawer
          driverId={data.driver.id} driverName={data.driver.driver_name || `Driver #${data.driver.id}`}
          currency={cur} balanceMinor={data.balance_minor ?? null}
          onClose={() => setAdjusting(false)}
          onDone={(text, kind) => { setNotice({ text, kind }); void load(); }}
        />
      ) : null}
    </>
  );
}

export default function DriverLedgerPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <LedgerInner />
    </Suspense>
  );
}
