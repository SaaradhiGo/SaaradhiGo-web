'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  PAYOUT_LABEL, type ListFilters, ageLabel, apiPath, cityName, formatMinor, payoutTone,
} from '@/lib/finance';
import {
  NO_POLICY_WORDS, RETRY_NOTE, bulkApprovable, bulkCurrencyProblem, bulkRejectable, payoutActions,
} from '@/lib/financeActions';
import { interpretWrite } from '@/lib/trips';
import { useFinanceList } from '@/lib/useFinanceList';
import { PageLink } from '@/components/console/PageLink';
import { Revealable } from '@/components/console/Revealable';
import { ExportButton, FinanceNav, Pager, RangeBar } from '@/components/console/finance';
import {
  Column, DataTable, Drawer, Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton,
  TableToolbar,
} from '@/components/console/ui';

/**
 * Payouts: every withdrawal, by status, with the Finance write actions.
 *
 *   * approve / reject / bulk  finance.payout. Approving is the MAKER half of
 *     maker-checker: it raises a request that a different finance admin
 *     decides (the answer says which happened). A bulk approve is ONE request
 *     for the batch. A country with no approval policy is BLOCKED, and the
 *     page says "Blocked: no approval policy in this country." where the
 *     button would be. Rejecting needs a reason and returns the money.
 *   * retry a failed payout: only an already-approved payout that failed.
 *     No new approval (the money was approved), and the drawer says so.
 *   * mark under investigation: a note and a flag. No money moves.
 *
 * Counts on the tabs are the server's, for the filters on screen (a tab never
 * counts across currencies: its amounts are listed per currency).
 */
type Approval = {
  id: number; status: string; requested_at: string; expires_at: string; decided_at: string | null;
  maker: { id: number; label: string; role: string };
  checker: { id: number; label: string; role: string } | null;
  batch?: boolean;
} | null;

type Row = {
  id: number;
  driver_id: number;
  driver_name: string;
  city: { code: string; name: string } | null;
  amount_minor: number;
  currency: string;
  status: string;
  status_label: string;
  payout_method: string;
  upi_id?: string | null;
  bank_account?: string | null;
  payout_reference: string | null;
  failure_count: number;
  failure_reason: string | null;
  requested_at: string;
  processed_at: string | null;
  age_seconds: number | null;
  approval?: Approval;
  fee_minor?: number;
  origin?: string;
  under_investigation?: boolean;
  investigation_note?: string;
  retryable?: boolean;
  approval_blocked?: boolean;
  approval_blocked_reason?: string | null;
  // Approved in a currency with no payout rail: held, nothing is sent (module 8).
  awaiting_rail?: boolean;
  rail_note?: string | null;
};
type Detail = Row & {
  driver_phone: string;
  payout_status: string | null;
  last_failure_at: string | null;
  admin_notes: string | null;
  transactions: Array<{ id: number; status: string | null; txn_type: string; created_at: string;
    amount_minor: number; currency: string; gateway_transaction_id: string | null }>;
  history: Array<{ id: number; action: string; at: string; by: string; reason: string }>;
};
type Tab = { status: string; label: string; count: number; amounts: Array<{ currency: string; amount_minor: number }> };
type Extra = { tabs: Tab[]; rail_notices?: Array<{ currency: string; note: string }> };

type Act = 'approve' | 'reject' | 'retry' | 'investigate';
type Bulk = 'approve' | 'reject';

const ACT_TITLE: Record<Act, string> = {
  approve: 'Ask to release', reject: 'Reject', retry: 'Retry the payout', investigate: 'Mark under investigation',
};

function failureText(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.fromServer) {
    return /threshold|policy/i.test(err.message) ? `${NO_POLICY_WORDS} ${err.message}` : err.message;
  }
  return fallback;
}

function PayoutsInner() {
  const access = useAdminAccess();
  const search = useSearchParams();
  // The tab is the status filter; no status in the URL means the pending queue.
  const status = search.get('status') || 'pending';
  const { filters, data, error, reload, go } = useFinanceList<Row, Extra>(
    '/payments/admin/payouts/', { status });
  const [density, setDensity] = useDensity();

  const [selected, setSelected] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [acting, setActing] = useState<Act | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'pending' | 'done' } | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [bulk, setBulk] = useState<Bulk | null>(null);
  const [bulkNote, setBulkNote] = useState('');

  const rows = useMemo(() => data?.results ?? [], [data]);
  const tabs = data?.tabs ?? [];

  // A tick means nothing once the page of rows it was on has changed.
  useEffect(() => { setPicked(new Set()); setBulk(null); }, [status, data?.page]);

  const open = useCallback(async (row: Row) => {
    setSelected(row);
    setDetail(null);
    setDetailError(null);
    setActing(null);
    setNote('');
    setActionError(null);
    try {
      setDetail(await api.get<Detail>(`/payments/admin/payouts/${row.id}/`));
    } catch (err) {
      setDetailError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this payout.');
    }
  }, []);

  const current = detail ?? selected;
  const can = current ? payoutActions(current, access) : null;

  async function send(kind: Act) {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    const amount = formatMinor(selected.amount_minor, selected.currency);
    const who = selected.driver_name || `driver #${selected.driver_id}`;
    const base = `/payments/admin/payouts/${selected.id}`;
    try {
      let message: string;
      let kindOut: 'pending' | 'done' = 'done';
      if (kind === 'investigate') {
        await api.post(`${base}/investigation/`, { note: note.trim() });
        message = `${who}'s payout is marked under investigation. No money moved.`;
      } else if (kind === 'retry') {
        await api.post(`${base}/retry/`, { reason: note.trim() });
        message = `Sent ${amount} to ${who} again. The money was approved already, so no new approval was needed.`;
      } else {
        const body = await api.post<{ approval_request?: { id: number; status?: string } | null }>(
          `${base}/${kind}/`, { reason: note.trim() });
        const outcome = interpretWrite(body as never, kind === 'approve'
          ? `Released ${amount} to ${who}.`
          : `Rejected ${amount}; the amount went back to the driver's balance.`);
        message = outcome.message;
        kindOut = outcome.kind;
      }
      setNotice({ text: message, kind: kindOut });
      setSelected(null);
      setActing(null);
      setNote('');
      await reload();
    } catch (err) {
      setActionError(failureText(err, 'That did not go through. Nothing was changed.'));
    } finally {
      setBusy(false);
    }
  }

  async function sendBulk(kind: Bulk) {
    const ids = kind === 'approve' ? bulkApprovable(rows, picked, access) : bulkRejectable(rows, picked, access);
    setBusy(true);
    setActionError(null);
    try {
      const body = await api.post<{
        approval_request?: { id: number } | null; updated_count?: number; skipped_count?: number;
        requested_count?: number;
      }>('/payments/admin/payouts/bulk-action/', { action: kind, withdrawal_ids: ids, reason: bulkNote.trim() });
      const request = body?.approval_request;
      setNotice(request
        ? { kind: 'pending', text: `Sent for approval · request #${request.id} for ${body?.requested_count ?? ids.length} payouts. Nothing is released until a second finance admin decides it.` }
        : { kind: 'done', text: `${body?.updated_count ?? ids.length} payout${(body?.updated_count ?? ids.length) === 1 ? '' : 's'} ${kind === 'reject' ? 'rejected' : 'released'}${body?.skipped_count ? `; ${body.skipped_count} skipped` : ''}.` });
      setPicked(new Set());
      setBulk(null);
      setBulkNote('');
      await reload();
    } catch (err) {
      setActionError(failureText(err, 'The bulk action did not go through. Nothing was changed.'));
    } finally {
      setBusy(false);
    }
  }

  const hasDates = Boolean(filters.from && filters.to);
  const showPick = status === 'pending' && rows.some((r) => payoutActions(r, access).reject);
  const toApprove = bulkApprovable(rows, picked, access);
  const toReject = bulkRejectable(rows, picked, access);
  const mixProblem = bulkCurrencyProblem(rows, [...picked]);

  const toggle = (id: number) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const columns: Column<Row>[] = [
    ...(showPick ? [{
      key: 'pick', label: 'Pick', width: '3.5rem',
      render: (w: Row) => (payoutActions(w, access).reject ? (
        <input type="checkbox" checked={picked.has(w.id)} onChange={() => toggle(w.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Pick the ${formatMinor(w.amount_minor, w.currency)} payout for ${w.driver_name || `driver ${w.driver_id}`}`} />
      ) : null),
    } satisfies Column<Row>] : []),
    {
      key: 'driver', label: 'Driver', sortValue: (w) => w.driver_name,
      render: (w) => <PageLink page="drivers" href={`/drivers/${w.driver_id}`}>{w.driver_name || `Driver #${w.driver_id}`}</PageLink>,
    },
    { key: 'city', label: 'City', hideBelow: 1280, render: (w) => cityName(w.city) },
    {
      key: 'handle', label: 'Pays to', width: '12rem', hideBelow: 1280,
      render: (w) => w.upi_id || w.bank_account || <span className="muted">Nothing on file</span>,
    },
    { key: 'amount', label: 'Amount', num: true, width: '9rem', sortValue: (w) => w.amount_minor, render: (w) => formatMinor(w.amount_minor, w.currency) },
    {
      key: 'status', label: 'Status', width: '11rem',
      render: (w) => (
        <>
          <Pill tone={payoutTone(w.status)}>{PAYOUT_LABEL[w.status] ?? w.status}</Pill>
          {w.under_investigation ? <> <Pill tone="wait">investigating</Pill></> : null}
          {w.awaiting_rail ? <> <Pill tone="wait">waiting for a rail</Pill></> : null}
        </>
      ),
    },
    {
      key: 'approval', label: 'Approval', width: '12rem', hideBelow: 1500,
      render: (w) => {
        if (w.status === 'pending' && w.approval_blocked) return <Pill tone="bad">Blocked: no policy</Pill>;
        if (w.approval) return `${w.approval.batch ? 'Run ' : ''}${w.approval.status}`;
        return <span className="muted">None</span>;
      },
    },
    {
      key: 'failures', label: 'Failures', num: true, width: '6rem', hideBelow: 1500,
      sortValue: (w) => w.failure_count, render: (w) => w.failure_count || '—',
    },
    {
      key: 'age', label: 'Waiting', num: true, width: '8rem', sortValue: (w) => w.age_seconds ?? -1,
      render: (w) => ageLabel(w.age_seconds),
    },
    {
      key: 'when', label: 'Requested', num: true, width: '9.5rem', sortValue: (w) => w.requested_at,
      render: (w) => stamp(w.requested_at, timeZoneFor(w.city?.code)),
    },
  ];

  const tzOf = (r: Row | null) => timeZoneFor(r?.city?.code);
  const amountOf = (r: Row) => formatMinor(r.amount_minor, r.currency);
  const setTab = (s: string) => go({ ...filters, status: s === 'pending' ? '' : s, page: 1 } as ListFilters);

  const noteLabel = acting === 'investigate' ? 'Note (required)'
    : acting === 'approve' ? 'Note for the audit log (optional)' : 'Reason (required)';
  const noteReady = acting === 'approve' || note.trim().length >= 5;

  return (
    <>
      <PageHeader title="Finance" subtitle="Money leaving the platform. Releasing a payout dispatches it for real." />
      <FinanceNav />
      {notice && (
        <div className={notice.kind === 'pending' ? 'ops-confirm mb-4' : 'alert-success mb-4'} role="status">
          <b>{notice.text}</b>
        </div>
      )}

      {(data?.rail_notices ?? []).map((n) => (
        <div key={n.currency} className="ops-note ops-note--warn mb-4" role="status">
          <b>{n.note}</b>
        </div>
      ))}

      <Panel flush>
        <div className="ops-tabs" role="tablist" aria-label="Payout status">
          {(tabs.length ? tabs : []).map((t) => (
            <button key={t.status} type="button" role="tab" id={`tab-${t.status}`}
              className="ops-tab" aria-selected={status === t.status}
              aria-controls="payouts-panel" onClick={() => setTab(t.status)}>
              {t.label}
              <span className="ops-tab__n" aria-label={`${t.count} payouts`}>{t.count}</span>
            </button>
          ))}
        </div>
        <RangeBar from={filters.from} to={filters.to} idPrefix="payouts"
          onApply={(r) => go({ ...filters, ...r, page: 1 })} />
        <TableToolbar
          summary={data ? `${data.count} ${PAYOUT_LABEL[status]?.toLowerCase() ?? status}${hasDates ? ` · ${filters.from} to ${filters.to}` : ''}` : null}
          density={density}
          onDensity={setDensity}
        >
          {hasDates && (
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
              onClick={() => go({ ...filters, from: '', to: '', page: 1 })}>All dates</button>
          )}
          <ExportButton path={apiPath('/payments/admin/export/payouts/', { ...filters, page: 1 }, { status })} />
        </TableToolbar>

        {picked.size > 0 && (
          <div className="ops-bulkbar" role="region" aria-label="Picked payouts">
            <b>{picked.size} picked</b>
            {mixProblem ? <span className="muted">{mixProblem}</span> : null}
            <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm"
              disabled={busy || toApprove.length === 0 || mixProblem !== null}
              onClick={() => { setBulk('approve'); setBulkNote(''); setActionError(null); }}>
              Ask to release {toApprove.length}
            </button>
            <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm"
              disabled={busy || toReject.length === 0}
              onClick={() => { setBulk('reject'); setBulkNote(''); setActionError(null); }}>
              Reject {toReject.length}
            </button>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
        )}
        {bulk && (
          <div className="ops-confirm m-4">
            <b>{bulk === 'approve' ? `Ask to release ${toApprove.length} payouts as one run` : `Reject ${toReject.length} payouts`}</b>
            <span>
              {bulk === 'approve'
                ? 'This raises ONE request for the whole batch. Nothing is released until a different finance admin approves it. A country with no approval policy is blocked.'
                : 'Each amount goes back to its driver\'s balance. The reason is kept in the audit log.'}
            </span>
            <label className="sr-only" htmlFor="bulk-note">{bulk === 'reject' ? 'Reason for rejecting' : 'Note for the audit log'}</label>
            <textarea id="bulk-note" className="input" rows={2} value={bulkNote} onChange={(e) => setBulkNote(e.target.value)}
              placeholder={bulk === 'reject' ? 'Why are these being rejected? (required)' : 'Note for the audit log (optional)'} />
            {actionError && <div className="alert-error" role="alert">{actionError}</div>}
            <div>
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy} onClick={() => setBulk(null)}>Back</button>{' '}
              <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
                disabled={busy || (bulk === 'reject' && bulkNote.trim().length < 5)}
                onClick={() => void sendBulk(bulk)}>
                {busy ? 'Working…' : bulk === 'approve' ? 'Send for approval' : 'Reject them'}
              </button>
            </div>
          </div>
        )}

        <div id="payouts-panel" role="tabpanel" aria-labelledby={`tab-${status}`}>
          {data === null && !error ? (
            <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
              <span className="sr-only">Loading payouts</span>
              <Skeleton kind="row" count={6} />
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorState title="The payouts could not be loaded"
                detail={`${error} This is not the same as there being nothing to pay.`} onRetry={() => void reload()} />
            </div>
          ) : rows.length === 0 ? (
            <Empty title={`Nothing ${PAYOUT_LABEL[status]?.toLowerCase() ?? status}`}
              detail={status === 'pending' ? 'No driver in your scope is waiting to be paid.' : undefined} />
          ) : (
            <>
              <DataTable caption="Payouts" rows={rows} columns={columns} rowKey={(w) => w.id}
                density={density} onRow={(w) => void open(w)} selectedKey={selected?.id ?? null} />
              <div className="ops-totals" aria-label="Amounts on this tab, per currency">
                {(tabs.find((t) => t.status === status)?.amounts ?? []).map((a) => (
                  <div className="ops-totals__group" key={a.currency}>
                    <b>{formatMinor(a.amount_minor, a.currency)}</b>
                    <span>{a.currency} · {PAYOUT_LABEL[status]?.toLowerCase() ?? status}</span>
                  </div>
                ))}
              </div>
              <Pager page={data?.page ?? 1} totalPages={data?.total_pages ?? 1}
                onPage={(p) => go({ ...filters, page: p })} />
            </>
          )}
        </div>
      </Panel>

      <div className="mt-4">
        <Panel title="Payout rules">
          <p className="help m-0">
            The fee, the minimum, when a payout counts as stuck and the weekly schedule are set per country in{' '}
            <PageLink page="finance" href="/finance/payout-settings">Payout settings</PageLink>.
          </p>
        </Panel>
      </div>

      <Drawer
        open={selected !== null}
        title={selected ? `${amountOf(selected)} · ${selected.driver_name || `Driver #${selected.driver_id}`}` : ''}
        onClose={() => setSelected(null)}
        footer={selected && can && (can.approve || can.reject || can.retry || can.investigate) ? (
          acting === null ? (
            <>
              {can.investigate && (
                <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy}
                  onClick={() => { setActing('investigate'); setNote(current?.investigation_note ?? ''); }}>
                  {current?.under_investigation ? 'Update investigation note' : 'Mark under investigation'}
                </button>
              )}
              {can.retry && (
                <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy}
                  onClick={() => { setActing('retry'); setNote(''); }}>Retry payout…</button>
              )}
              {can.reject && (
                <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy}
                  onClick={() => { setActing('reject'); setNote(''); }}>Reject</button>
              )}
              {can.approve && (
                <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy}
                  onClick={() => { setActing('approve'); setNote(''); }}>Ask to release…</button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy}
                onClick={() => { setActing(null); setNote(''); }}>Back</button>
              <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
                disabled={busy || !noteReady}
                onClick={() => void send(acting)}>
                {busy ? 'Working…' : acting === 'approve' ? `Ask to release ${amountOf(selected)}`
                  : acting === 'reject' ? 'Reject with this reason'
                    : acting === 'retry' ? `Retry ${amountOf(selected)}` : 'Save the note'}
              </button>
            </>
          )
        ) : undefined}
      >
        {selected && (
          <div className="grid gap-4">
            {detailError && <div className="alert-error" role="alert">{detailError}</div>}
            {can?.blocked && (
              <div className="ops-note ops-note--warn" role="status"><b>{can.blocked}</b>{' '}
                This payout cannot be released from the console until the owner configures an approval policy
                for this country. You can still reject it, which returns the amount to the driver.</div>
            )}
            {can?.awaitingChecker && (
              <div className="ops-confirm" role="status"><b>Waiting for a second finance admin.</b>{' '}
                The request is open; nothing has been released.</div>
            )}
            <Facts>
              <Fact label="Driver"><PageLink page="drivers" href={`/drivers/${selected.driver_id}`}>{selected.driver_name || `Driver #${selected.driver_id}`}</PageLink></Fact>
              <Fact label="Phone">
                {detail
                  ? <Revealable value={detail.driver_phone || '—'} label="driver phone"
                      target={{ type: 'withdrawal', id: selected.id }} field="driver_phone" />
                  : '—'}
              </Fact>
              <Fact label="Pays to">
                {selected.payout_method === 'bank'
                  ? (selected.bank_account || 'No bank account on file')
                  : selected.upi_id
                    ? <Revealable value={selected.upi_id} label="UPI handle"
                        target={{ type: 'withdrawal', id: selected.id }} field="upi_id" />
                    : 'No UPI on file'}
              </Fact>
              <Fact label="Amount"><b>{amountOf(selected)}</b> <span className="muted">{selected.currency}</span></Fact>
              {current?.fee_minor ? (
                <Fact label="Transfer fee">{formatMinor(current.fee_minor, selected.currency)}{' '}
                  <span className="muted">taken from the payout</span></Fact>
              ) : null}
              <Fact label="Status"><Pill tone={payoutTone(selected.status)}>{PAYOUT_LABEL[selected.status] ?? selected.status}</Pill></Fact>
              {current?.origin === 'scheduled' ? <Fact label="Created by">The weekly payout run</Fact> : null}
              {current?.awaiting_rail && current.rail_note ? <Fact label="Payout rail">{current.rail_note}</Fact> : null}
              <Fact label="Requested">{stamp(selected.requested_at, tzOf(selected))}</Fact>
              {selected.processed_at ? <Fact label="Processed">{stamp(selected.processed_at, tzOf(selected))}</Fact> : null}
              <Fact label="Waiting">{ageLabel(selected.age_seconds)}</Fact>
              {selected.payout_reference ? <Fact label="Payout reference">{selected.payout_reference}</Fact> : null}
              {selected.failure_count > 0 ? (
                <Fact label="Failures">{selected.failure_count}{selected.failure_reason ? ` · ${selected.failure_reason}` : ''}</Fact>
              ) : null}
              {current?.under_investigation ? (
                <Fact label="Investigation">{current.investigation_note || 'Marked under investigation'}</Fact>
              ) : null}
              {selected.approval ? (
                <Fact label="Approval">
                  {selected.approval.batch ? 'Payout run · ' : ''}Request #{selected.approval.id} · {selected.approval.status}
                  {' '}· asked by {selected.approval.maker.label || 'an operator'}
                  {selected.approval.checker ? ` · checked by ${selected.approval.checker.label || 'an operator'}` : ''}
                </Fact>
              ) : <Fact label="Approval">None raised</Fact>}
              {detail?.admin_notes ? <Fact label="Notes">{detail.admin_notes}</Fact> : null}
            </Facts>

            {detail && detail.transactions.length > 0 && (
              <Panel title="Gateway records" flush>
                <DataTable caption="Gateway records for this payout" rows={detail.transactions}
                  rowKey={(t) => t.id} density="compact" maxHeight={false}
                  columns={[
                    { key: 'at', label: 'When', render: (t) => stamp(t.created_at, tzOf(selected)) },
                    { key: 'status', label: 'Status', render: (t) => t.status || '—' },
                    { key: 'ref', label: 'Reference', render: (t) => t.gateway_transaction_id || '—' },
                    { key: 'amt', label: 'Amount', num: true, render: (t) => formatMinor(t.amount_minor, t.currency) },
                  ]} />
              </Panel>
            )}
            {detail && detail.history.length > 0 && (
              <Panel title="History" flush>
                <DataTable caption="History of this payout" rows={detail.history}
                  rowKey={(h) => h.id} density="compact" maxHeight={false}
                  columns={[
                    { key: 'at', label: 'When', render: (h) => stamp(h.at, tzOf(selected)) },
                    { key: 'what', label: 'What', render: (h) => h.action.replace(/_/g, ' ') },
                    { key: 'by', label: 'By', render: (h) => h.by || '—' },
                  ]} />
              </Panel>
            )}

            {acting && (
              <div className="ops-confirm">
                <b>
                  {acting === 'approve' ? `Ask to release ${amountOf(selected)} to ${selected.driver_name || `driver #${selected.driver_id}`}`
                    : acting === 'reject' ? `Reject ${amountOf(selected)} for ${selected.driver_name || `driver #${selected.driver_id}`}`
                      : acting === 'retry' ? `Retry the ${amountOf(selected)} payout`
                        : 'Mark this payout under investigation'}
                </b>
                <span>
                  {acting === 'approve'
                    ? 'This raises a request. A different finance admin decides it; only then is the payout dispatched for real. A country with no approval policy is blocked.'
                    : acting === 'reject'
                      ? 'The amount goes back to the driver\'s balance, once. The reason is kept in the audit log.'
                      : acting === 'retry'
                        ? RETRY_NOTE
                        : 'A note and a flag for the team. No money moves and the payout is not stopped.'}
                </span>
                <label className="sr-only" htmlFor="payout-note">{noteLabel}</label>
                <textarea id="payout-note" className="input" rows={3} value={note}
                  onChange={(e) => setNote(e.target.value)} placeholder={noteLabel} />
                {actionError && <div className="alert-error" role="alert">{actionError}</div>}
              </div>
            )}
            {!acting && actionError && <div className="alert-error" role="alert">{actionError}</div>}
          </div>
        )}
      </Drawer>
    </>
  );
}

export default function PayoutsPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <PayoutsInner />
    </Suspense>
  );
}
