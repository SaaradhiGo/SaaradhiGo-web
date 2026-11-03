'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import { cityName, formatMinor } from '@/lib/finance';
import { PageButtonLink, PageLink } from '@/components/console/PageLink';
import { History, RecordPanel, RecordStat, type HistoryEntry } from '@/components/console/kit/RecordPanel';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { Fact, Facts } from '@/components/console/ui';
import { paymentChipTone, words } from './moneyKit';

/**
 * One payment beside the list (or on its own page from a link): what was
 * charged, how, what replaced it, what was refunded, and what the gateway told
 * us. The webhook list is a summary on purpose (type, when, outcome): the
 * payload can hold bank or card data and never reaches the console.
 */
export type PaymentDetail = {
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

function historyOf(d: PaymentDetail, tz: string | undefined): HistoryEntry[] {
  const rows: Array<{ iso: string; text: string }> = [];
  for (const p of d.chain) {
    rows.push({ iso: p.created_at, text: `Charge #${p.id} created: ${words(p.method)}, ${formatMinor(p.amount_minor, p.currency)}${p.switch_reason ? ` (${words(p.switch_reason)})` : ''}` });
  }
  for (const r of d.refunds) {
    rows.push({ iso: r.created_at, text: `Refund #${r.id} of ${formatMinor(r.amount_minor, r.currency)} to ${words(r.method)}: ${words(r.status)}` });
  }
  for (const w of d.webhooks) {
    rows.push({ iso: w.received_at, text: `Gateway said ${w.event_type || 'an event'}: ${w.result}` });
  }
  return rows
    .sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0))
    .map((r) => ({ at: stamp(r.iso, tz), text: r.text }));
}

export function PaymentRecord({ id, onClose }: { id: number | string; onClose?: () => void }) {
  const [data, setData] = useState<PaymentDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      setData(await api.get<PaymentDetail>(`/payments/admin/payments/${id}/`));
    } catch (err) {
      setError(err instanceof ApiError
        ? { status: err.status, message: err.fromServer ? err.message : 'We could not load this payment.' }
        : { status: 0, message: 'We could not load this payment.' });
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (!data) {
    const message = !error ? 'Loading the payment…'
      : error.status === 404 ? 'Payment not found. It does not exist, or it is not in a place you can see.'
        : error.status === 403 ? `You cannot open this payment. ${error.message}`
          : error.message;
    return (
      <RecordPanel label="Payment" title="Payment" refId={`#${id}`} onClose={onClose}
        tabs={[{ key: 'summary', label: 'Summary', content: (
          <div>
            <p className={error ? 'alert-error' : 'ops-record__empty'} role={error ? 'alert' : undefined} aria-busy={!error || undefined}>{message}</p>
            {error && error.status !== 404 && error.status !== 403 ? (
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => void load()}>Try again</button>
            ) : null}
          </div>
        ) }]} />
    );
  }

  const tz = timeZoneFor(data.city?.code);
  return (
    <RecordPanel
      label="Payment"
      title={data.rider_name || 'Rider charge'}
      refId={`#${data.id}`}
      subtitle={<>{cityName(data.city)} · {stamp(data.created_at, tz)}</>}
      status={<StatusChip tone={paymentChipTone(data.status)}>{words(data.status)}</StatusChip>}
      onClose={onClose}
      actions={<PageButtonLink page="trips" href={`/trips/${data.trip_id}`} variant="ghost">Open trip T-{data.trip_id}</PageButtonLink>}
      tabs={[
        {
          key: 'summary', label: 'Money', content: (
            <div className="grid gap-3">
              <RecordStat label="Charged" value={formatMinor(data.amount_minor, data.currency)} note={`${data.currency} · ${words(data.method)}`} />
              <Facts>
                <Fact label="Trip"><PageLink page="trips" href={`/trips/${data.trip_id}`}>T-{data.trip_id}</PageLink></Fact>
                <Fact label="City">{cityName(data.city)}</Fact>
                <Fact label="Gateway">{data.gateway}</Fact>
                <Fact label="Order reference">{data.gateway_order_id || '—'}</Fact>
                <Fact label="Payment reference">{data.gateway_payment_id || '—'}</Fact>
                <Fact label="Created">{stamp(data.created_at, tz)}</Fact>
              </Facts>
              {data.chain.length > 1 ? (
                <table className="ops-table ops-table--compact">
                  <caption className="ops-record__caption">Switch and retry chain</caption>
                  <thead><tr><th scope="col">Payment</th><th scope="col">Method</th><th scope="col">Status</th><th scope="col" className="num">Amount</th><th scope="col">Why it changed</th></tr></thead>
                  <tbody>
                    {data.chain.map((p) => (
                      <tr key={p.id}>
                        <td>{p.current ? <b>#{p.id} (this)</b> : <Link href={`/finance/payments/${p.id}`}>#{p.id}</Link>}</td>
                        <td>{words(p.method)}</td>
                        <td><StatusChip tone={paymentChipTone(p.status)}>{words(p.status)}</StatusChip></td>
                        <td className="num">{formatMinor(p.amount_minor, p.currency)}</td>
                        <td>{p.switch_reason ? words(p.switch_reason) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="ops-record__empty">This charge was never replaced by another.</p>}
            </div>
          ),
        },
        {
          key: 'refunds', label: `Refunds${data.refunds.length ? ` (${data.refunds.length})` : ''}`, content: data.refunds.length === 0
            ? <p className="ops-record__empty">Nothing has been refunded on this trip.</p>
            : (
              <table className="ops-table ops-table--compact">
                <caption className="sr-only">Refunds on this trip</caption>
                <thead><tr><th scope="col">Refund</th><th scope="col" className="num">Amount</th><th scope="col">Paid back to</th><th scope="col">Status</th><th scope="col">When</th></tr></thead>
                <tbody>
                  {data.refunds.map((r) => (
                    <tr key={r.id}>
                      <td>#{r.id}{r.approval_request_id ? <> · <PageLink page="approvals" href={`/approvals?id=${r.approval_request_id}`}>APR-{r.approval_request_id}</PageLink></> : null}</td>
                      <td className="num">{formatMinor(r.amount_minor, r.currency)}</td>
                      <td>{words(r.method)}</td>
                      <td><StatusChip tone={r.status === 'completed' ? 'good' : 'info'}>{words(r.status)}</StatusChip></td>
                      <td>{stamp(r.created_at, tz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ),
        },
        {
          key: 'gateway', label: 'Gateway', content: data.webhooks.length === 0
            ? <p className="ops-record__empty">The gateway has not told us about this order. Reconciliation raises this if the payment is captured.</p>
            : (
              <table className="ops-table ops-table--compact">
                <caption className="sr-only">Gateway webhooks (summary)</caption>
                <thead><tr><th scope="col">Event</th><th scope="col">Received</th><th scope="col">Result</th><th scope="col">Processed</th></tr></thead>
                <tbody>
                  {data.webhooks.map((w) => (
                    <tr key={w.id}>
                      <td>{w.event_type || '—'}</td>
                      <td>{stamp(w.received_at, tz)}</td>
                      <td><StatusChip tone={w.result === 'processed' ? 'good' : w.result === 'error' ? 'caution' : 'info'}>{words(w.result)}</StatusChip></td>
                      <td>{w.processed_at ? stamp(w.processed_at, tz) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ),
        },
        { key: 'history', label: 'History', content: <History entries={historyOf(data, tz)} /> },
      ]}
    />
  );
}
