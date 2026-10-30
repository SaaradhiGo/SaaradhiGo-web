'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  PAYOUT_LABEL, type ListFilters, ageLabel, apiPath, canActOnPayouts, cityName, formatMinor,
  payoutTone,
} from '@/lib/finance';
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
 * Payouts: every withdrawal, by status, read-only, with the maker-checker
 * approve and reject actions the old Withdrawals page had.
 *
 * Part A of the Finance module only READS. The two actions in the drawer are
 * the existing ones (`/driver/admin/withdrawals/<id>/approve|reject`): approving
 * asks the maker-checker framework, so for a payout it is usually "sent to a
 * checker", and the page says which happened. They are drawn only for
 * `finance.payout`. Part B replaces this queue.
 *
 * Counts on the tabs are the server's, for the filters on screen (a tab never
 * counts across currencies: its amounts are listed per currency).
 */
type Approval = {
  id: number; status: string; requested_at: string; expires_at: string; decided_at: string | null;
  maker: { id: number; label: string; role: string };
  checker: { id: number; label: string; role: string } | null;
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
type Extra = { tabs: Tab[] };

type Config = { countries: Array<{
  country: string; name: string; currency: string; configured: boolean; message: string | null;
  config: { fee_percent: string; minimum_withdrawal_minor: number; stuck_payout_hours: number | null } | null;
}> };

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
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    void api.get<Config>(withScope('/payments/admin/payout-config/')).then(setConfig).catch(() => setConfig(null));
  }, []);

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

  async function send(kind: 'approve' | 'reject') {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    const amount = formatMinor(selected.amount_minor, selected.currency);
    try {
      const body = await api.post<{ approval_request?: { id: number; status?: string } | null }>(
        `/driver/admin/withdrawals/${selected.id}/${kind}/`, { admin_notes: note.trim() });
      const outcome = interpretWrite(body as never, kind === 'approve'
        ? `Released ${amount} to ${selected.driver_name || `driver #${selected.driver_id}`}.`
        : `Rejected ${amount}; the driver can read your reason.`);
      setNotice(outcome.message);
      setSelected(null);
      setActing(null);
      setNote('');
      await reload();
    } catch (err) {
      setActionError(err instanceof ApiError && err.fromServer
        ? err.message : `The ${kind === 'approve' ? 'release' : 'rejection'} did not go through.`);
    } finally {
      setBusy(false);
    }
  }

  const tabs = data?.tabs ?? [];
  const rows = data?.results ?? [];
  const hasDates = Boolean(filters.from && filters.to);
  const showActions = canActOnPayouts(access);

  const columns: Column<Row>[] = [
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
      render: (w) => <Pill tone={payoutTone(w.status)}>{PAYOUT_LABEL[w.status] ?? w.status}</Pill>,
    },
    {
      key: 'approval', label: 'Approval', width: '8rem', hideBelow: 1500,
      render: (w) => (w.approval ? w.approval.status : <span className="muted">None</span>),
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

  return (
    <>
      <PageHeader title="Finance" subtitle="Money leaving the platform. Releasing a payout dispatches it for real." />
      <FinanceNav />
      {notice && <div className="alert-success mb-4" role="status">{notice}</div>}

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
        <Panel title="Payout rules by country (read only)">
          {config === null ? (
            <p className="muted">The payout rules could not be loaded.</p>
          ) : (
            <ul className="grid gap-2">
              {config.countries.map((c) => (
                <li key={c.country} className="ops-note">
                  <b>{c.name}</b>{' '}
                  {c.config ? (
                    <>
                      · fee {Number(c.config.fee_percent)}% · minimum {formatMinor(c.config.minimum_withdrawal_minor, c.currency)}
                      {' '}· {c.config.stuck_payout_hours
                        ? `a payout is stuck after ${c.config.stuck_payout_hours} h`
                        : 'stuck-payout check not configured'}
                    </>
                  ) : (
                    <>· <span>Not configured. Drivers here cannot withdraw until the owner sets the fee and the minimum.</span></>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Drawer
        open={selected !== null}
        title={selected ? `${amountOf(selected)} · ${selected.driver_name || `Driver #${selected.driver_id}`}` : ''}
        onClose={() => setSelected(null)}
        footer={selected && selected.status === 'pending' && showActions ? (
          acting === null ? (
            <>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy}
                onClick={() => { setActing('reject'); setNote(''); }}>Reject</button>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy}
                onClick={() => { setActing('approve'); setNote(''); }}>Release…</button>
            </>
          ) : (
            <>
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy}
                onClick={() => { setActing(null); setNote(''); }}>Back</button>
              <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
                disabled={busy || (acting === 'reject' && note.trim().length < 5)}
                onClick={() => void send(acting)}>
                {busy ? 'Working…' : acting === 'approve' ? `Release ${amountOf(selected)}` : 'Reject with this reason'}
              </button>
            </>
          )
        ) : undefined}
      >
        {selected && (
          <div className="grid gap-4">
            {detailError && <div className="alert-error" role="alert">{detailError}</div>}
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
              <Fact label="Status"><Pill tone={payoutTone(selected.status)}>{PAYOUT_LABEL[selected.status] ?? selected.status}</Pill></Fact>
              <Fact label="Requested">{stamp(selected.requested_at, tzOf(selected))}</Fact>
              {selected.processed_at ? <Fact label="Processed">{stamp(selected.processed_at, tzOf(selected))}</Fact> : null}
              <Fact label="Waiting">{ageLabel(selected.age_seconds)}</Fact>
              {selected.payout_reference ? <Fact label="Payout reference">{selected.payout_reference}</Fact> : null}
              {selected.failure_count > 0 ? (
                <Fact label="Failures">{selected.failure_count}{selected.failure_reason ? ` · ${selected.failure_reason}` : ''}</Fact>
              ) : null}
              {selected.approval ? (
                <Fact label="Approval">
                  Request #{selected.approval.id} · {selected.approval.status}
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
                  {acting === 'approve'
                    ? `Release ${amountOf(selected)} to ${selected.driver_name || `driver #${selected.driver_id}`}`
                    : `Reject ${amountOf(selected)} for ${selected.driver_name || `driver #${selected.driver_id}`}`}
                </b>
                <span>
                  {acting === 'approve'
                    ? 'A payout above the maker limit goes to a second approver first; the answer says which happened. Once released it dispatches a real payout.'
                    : 'The reason you write is shown to the driver.'}
                </span>
                <label className="sr-only" htmlFor="payout-note">{acting === 'approve' ? 'Note for the audit log' : 'Reason for rejecting'}</label>
                <textarea id="payout-note" className="input" rows={3} value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={acting === 'approve' ? 'Note for the audit log (optional)' : 'Why is this being rejected? At least a few words.'} />
                {actionError && <div className="alert-error" role="alert">{actionError}</div>}
              </div>
            )}
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
