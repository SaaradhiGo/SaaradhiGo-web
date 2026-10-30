'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import { cityName, formatMinor, paymentTone } from '@/lib/finance';
import { PageLink } from '@/components/console/PageLink';
import { FinanceNav } from '@/components/console/finance';
import {
  Column, DataTable, Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * One payment: what was charged, how it was paid, what replaced it, what was
 * refunded, and what the gateway told us about it.
 *
 * The webhook list is a summary on purpose (type, when, outcome). The payload
 * behind it can hold bank or card data and is never sent to the console.
 */
type Detail = {
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
  switch_reason: string | null;
  created_at: string;
  updated_at: string;
  chain: Array<{ id: number; status: string; method: string; amount_minor: number; currency: string;
    switch_reason: string | null; created_at: string; current: boolean }>;
  refunds: Array<{ id: number; amount_minor: number; currency: string; method: string; status: string;
    created_at: string; approval_request_id: number | null }>;
  webhooks: Array<{ id: number; event_type: string; received_at: string; processed_at: string | null; result: string }>;
};

export default function PaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      setData(await api.get<Detail>(`/payments/admin/payments/${id}/`));
    } catch (err) {
      setError(err instanceof ApiError
        ? { status: err.status, message: err.fromServer ? err.message : 'We could not load this payment.' }
        : { status: 0, message: 'We could not load this payment.' });
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const tz = timeZoneFor(data?.city?.code);

  const chainColumns: Column<Detail['chain'][number]>[] = [
    { key: 'id', label: 'Payment', width: '6.5rem',
      render: (p) => (p.current ? <b>#{p.id} (this)</b> : <Link href={`/finance/payments/${p.id}`}>#{p.id}</Link>) },
    { key: 'method', label: 'Method', render: (p) => p.method },
    { key: 'status', label: 'Status', render: (p) => <Pill tone={paymentTone(p.status)}>{p.status}</Pill> },
    { key: 'amount', label: 'Amount', num: true, render: (p) => formatMinor(p.amount_minor, p.currency) },
    { key: 'why', label: 'Why it changed', render: (p) => (p.switch_reason ? p.switch_reason.replace(/_/g, ' ') : '—') },
    { key: 'at', label: 'Created', num: true, render: (p) => stamp(p.created_at, tz) },
  ];
  const refundColumns: Column<Detail['refunds'][number]>[] = [
    { key: 'id', label: 'Refund', width: '6rem', render: (r) => `#${r.id}` },
    { key: 'amount', label: 'Amount', num: true, render: (r) => formatMinor(r.amount_minor, r.currency) },
    { key: 'method', label: 'Paid back to', render: (r) => r.method.replace(/_/g, ' ') },
    { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'completed' ? 'good' : 'wait'}>{r.status.replace(/_/g, ' ')}</Pill> },
    { key: 'at', label: 'When', num: true, render: (r) => stamp(r.created_at, tz) },
  ];
  const hookColumns: Column<Detail['webhooks'][number]>[] = [
    { key: 'type', label: 'Event', render: (w) => w.event_type || '—' },
    { key: 'received', label: 'Received', num: true, render: (w) => stamp(w.received_at, tz) },
    { key: 'result', label: 'Result', render: (w) => <Pill tone={w.result === 'processed' ? 'good' : w.result === 'error' ? 'bad' : 'wait'}>{w.result}</Pill> },
    { key: 'processed', label: 'Processed', num: true, render: (w) => (w.processed_at ? stamp(w.processed_at, tz) : '—') },
  ];

  return (
    <>
      <PageHeader title={data ? `Payment #${data.id}` : 'Payment'} subtitle="A rider charge and everything attached to it." />
      <FinanceNav />
      {data === null && !error ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the payment</span>
          <Skeleton kind="row" count={5} />
        </div>
      ) : error ? (
        error.status === 404 ? (
          <Empty title="Payment not found" detail="It does not exist, or it is not in a place you can see." />
        ) : error.status === 403 ? (
          <Empty error title="You cannot open this payment" detail={error.message} />
        ) : (
          <ErrorState title="The payment could not be loaded" detail={error.message} onRetry={() => void load()} />
        )
      ) : data ? (
        <div className="grid gap-4">
          <Panel title="Charge">
            <Facts>
              <Fact label="Amount"><b>{formatMinor(data.amount_minor, data.currency)}</b> <span className="muted">{data.currency}</span></Fact>
              <Fact label="Status"><Pill tone={paymentTone(data.status)}>{data.status}</Pill></Fact>
              <Fact label="Method">{data.method}</Fact>
              <Fact label="Trip"><PageLink page="trips" href={`/trips/${data.trip_id}`}>Trip #{data.trip_id}</PageLink></Fact>
              <Fact label="City">{cityName(data.city)}</Fact>
              <Fact label="Rider">{data.rider_name || '—'}</Fact>
              <Fact label="Gateway">{data.gateway}</Fact>
              <Fact label="Order reference">{data.gateway_order_id || '—'}</Fact>
              <Fact label="Payment reference">{data.gateway_payment_id || '—'}</Fact>
              <Fact label="Created">{stamp(data.created_at, tz)}</Fact>
            </Facts>
          </Panel>

          <Panel title="Switch and retry chain" flush>
            {data.chain.length <= 1
              ? <Empty title="No switch or retry" detail="This charge was never replaced by another." />
              : <DataTable caption="Switch and retry chain" rows={data.chain} columns={chainColumns} rowKey={(p) => p.id} density="compact" maxHeight={false} />}
          </Panel>

          <Panel title="Refunds on this trip" flush>
            {data.refunds.length === 0
              ? <Empty title="No refunds" detail="Nothing has been refunded on this trip." />
              : <DataTable caption="Refunds" rows={data.refunds} columns={refundColumns} rowKey={(r) => r.id} density="compact" maxHeight={false} />}
          </Panel>

          <Panel title="Gateway webhooks (summary)" flush>
            {data.webhooks.length === 0
              ? <Empty title="No webhook recorded" detail="The gateway has not told us about this order. Reconciliation raises this if the payment is captured." />
              : <DataTable caption="Gateway webhooks" rows={data.webhooks} columns={hookColumns} rowKey={(w) => w.id} density="compact" maxHeight={false} />}
          </Panel>
        </div>
      ) : null}
    </>
  );
}
