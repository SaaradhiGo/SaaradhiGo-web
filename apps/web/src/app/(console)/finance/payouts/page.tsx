'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { SELF_APPROVAL_LINE, SELF_APPROVAL_MIN_REASON } from '@/components/console/SelfApprovalNotice';
import { ApiError, api } from '@/lib/api';
import { currentScope, useAdminAccess, withScope } from '@/lib/adminScope';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  PAYOUT_LABEL, type ListFilters, ageLabel, apiPath, cityName, formatMinor, formatWhole, payoutTone,
} from '@/lib/finance';
import {
  NO_POLICY_WORDS, RETRY_NOTE, bulkApprovable, bulkCurrencyProblem, bulkRejectable, payoutActions,
} from '@/lib/financeActions';
import { interpretWrite } from '@/lib/trips';
import { todayIn, useViewCounts } from '@/lib/listViews';
import { useFinanceList } from '@/lib/useFinanceList';
import { PageLink } from '@/components/console/PageLink';
import { Revealable } from '@/components/console/Revealable';
import { ExportButton, FinanceNav, RangeBar } from '@/components/console/finance';
import { ListPage, type FilterChip, type ListColumn } from '@/components/console/kit/ListPage';
import { History, RecordPanel, RecordStat } from '@/components/console/kit/RecordPanel';
import { StatusChip } from '@/components/console/kit/StatusChip';
import {
  ActionNotice, MoreFilters, RecordFacts, RecordSection, chipTone,
} from '@/components/console/kit/ListBits';
import { Panel, Skeleton } from '@/components/console/ui';

/**
 * Payouts: every withdrawal, by status, with the Finance write actions, as a
 * list with the payout beside it (design board B).
 *
 *   * approve / reject / bulk  finance.payout. Approving is the MAKER half of
 *     maker-checker: it raises a request that a different finance admin
 *     decides (the answer says which happened, with its APR- link). A bulk
 *     approve is ONE request for the batch. A country with no approval policy
 *     is BLOCKED, and the record says "Blocked: no approval policy in this
 *     country." where the button would be. Rejecting needs a reason and
 *     returns the money.
 *   * retry a failed payout: only an already-approved payout that failed.
 *     No new approval (the money was approved), and the record says so.
 *   * mark under investigation: a note and a flag. No money moves.
 *
 * "Waiting for a second approver" lists the open payout requests themselves
 * (Approvals is where they are decided). Amounts are whole units in the list
 * and exact in the record and in every confirmation.
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

/** An open payout request, as Approvals answers it. */
type Request = {
  id: number; ref: string; title: string; amount: number | null; currency: string | null;
  scope: string | null; country: string; requested_at: string | null;
  maker: { label: string; email: string } | null;
  subjects: Array<{ ref: string; withdrawal_id: number; driver_id: number; driver_ref: string; driver_name: string; amount_minor: number; currency: string }>;
  blockers: string[];
};

type Act = 'approve' | 'reject' | 'retry' | 'investigate';
type Bulk = 'approve' | 'reject';
type Notice = { text: ReactNode; kind: 'pending' | 'done' };

const SECOND_PATH = '/approvals/admin/requests/?action=finance.payout&status=requested';

type ViewKey = 'pending' | 'failed_today' | 'second' | 'completed' | 'approved' | 'processed' | 'failed' | 'unresolved' | 'rejected';
const VIEWS: Array<{ key: ViewKey; label: string; status?: string }> = [
  { key: 'pending', label: 'Waiting', status: 'pending' },
  { key: 'failed_today', label: 'Failed today', status: 'failed' },
  { key: 'second', label: 'Waiting for a second approver' },
  { key: 'completed', label: 'Paid', status: 'completed' },
  { key: 'approved', label: 'Approved', status: 'approved' },
  { key: 'processed', label: 'Processing', status: 'processed' },
  { key: 'failed', label: 'All failed', status: 'failed' },
  { key: 'unresolved', label: 'Unresolved', status: 'unresolved' },
  { key: 'rejected', label: 'Rejected', status: 'rejected' },
];

function failureText(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.fromServer) {
    return /threshold|policy/i.test(err.message) ? `${NO_POLICY_WORDS} ${err.message}` : err.message;
  }
  return fallback;
}

function waitedFor(iso: string | null): string {
  if (!iso) return '—';
  return ageLabel(Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)));
}

const whoOf = (r: Row) => r.driver_name || `Driver #${r.driver_id}`;
const exact = (r: Row) => formatMinor(r.amount_minor, r.currency);

function aprNotice(id: number, tail: string): ReactNode {
  return (
    <>
      Sent for approval · <PageLink page="approvals" href={`/approvals?id=${id}`}>APR-{id}</PageLink>. {tail}
    </>
  );
}

function PayoutStatus({ w }: { w: Row }) {
  return (
    <span className="ops-chips">
      <StatusChip tone={w.status === 'failed' || w.status === 'unresolved' ? 'caution' : chipTone(payoutTone(w.status))}>{PAYOUT_LABEL[w.status] ?? w.status_label ?? w.status}</StatusChip>
      {w.status === 'pending' && w.approval_blocked ? <StatusChip tone="caution">Blocked: no policy</StatusChip> : null}
      {w.approval?.status === 'requested' ? <StatusChip tone="info">Second approver</StatusChip> : null}
      {w.under_investigation ? <StatusChip tone="caution">Investigating</StatusChip> : null}
      {w.awaiting_rail ? <StatusChip tone="info">Waiting for a rail</StatusChip> : null}
    </span>
  );
}

function PayoutsInner() {
  const access = useAdminAccess();
  const router = useRouter();
  const search = useSearchParams();
  const second = search.get('view') === 'second';
  // The view is the status filter; no status in the URL means the waiting queue.
  const status = search.get('status') || 'pending';
  const { filters, data, error, reload, go } = useFinanceList<Row, Extra>(
    '/payments/admin/payouts/', { status });
  const scopeTz = timeZoneFor(filters.scope || currentScope(access)?.code);
  const today = todayIn(scopeTz);
  const view: ViewKey = second ? 'second'
    : status === 'failed' && filters.from === today && filters.to === today ? 'failed_today'
      : (VIEWS.find((v) => v.key === status)?.key ?? 'pending');

  const [open, setOpen] = useState<Row | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [bulk, setBulk] = useState<Bulk | null>(null);
  const [bulkNote, setBulkNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [requests, setRequests] = useState<{ count: number; results: Request[] } | null>(null);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [requestPage, setRequestPage] = useState(1);
  const [reloads, setReloads] = useState(0);

  const rows = useMemo(() => data?.results ?? [], [data]);
  const tabs = data?.tabs ?? [];
  const scoped = useCallback((path: string) => (filters.scope ? `${path}${path.includes('?') ? '&' : '?'}scope=${encodeURIComponent(filters.scope)}` : withScope(path)), [filters.scope]);

  // A tick means nothing once the page of rows it was on has changed.
  useEffect(() => { setPicked([]); setBulk(null); }, [status, data?.page]);

  // The open payout requests: the "second approver" view's own list.
  useEffect(() => {
    if (!second) return undefined;
    let live = true;
    setRequests(null);
    setRequestsError(null);
    api.get<{ count: number; results: Request[] }>(scoped(`${SECOND_PATH}&page=${requestPage}&page_size=50`))
      .then((body) => { if (live) setRequests(body); })
      .catch((err) => { if (live) setRequestsError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the requests.'); });
    return () => { live = false; };
  }, [second, requestPage, scoped, reloads]);

  // Counts: one undated call answers every status; two more for the dated and approval views.
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    api.get<{ tabs?: Tab[] }>(scoped('/payments/admin/payouts/?page_size=1'))
      .then((body) => { if (live) setStatusCounts(Object.fromEntries((body?.tabs ?? []).map((t) => [t.status, t.count]))); })
      .catch(() => { if (live) setStatusCounts({}); });
    return () => { live = false; };
  }, [scoped, reloads]);
  const extraCounts = useViewCounts(useMemo(() => ({
    failed_today: scoped(`/payments/admin/payouts/?status=failed&from=${today}&to=${today}`),
    second: scoped(SECOND_PATH),
  }), [scoped, today]), reloads);
  const countOf = (v: ViewKey): number | null => {
    if (v === 'failed_today' || v === 'second') return extraCounts[v] ?? null;
    const s = VIEWS.find((x) => x.key === v)?.status;
    return s && typeof statusCounts[s] === 'number' ? statusCounts[s] : null;
  };

  const refresh = async () => { setReloads((n) => n + 1); await reload(); };
  const setView = (key: string) => {
    if (key === 'second') { setRequestPage(1); router.push('/finance/payouts?view=second'); return; }
    const v = VIEWS.find((x) => x.key === key);
    const s = v?.status ?? 'pending';
    const dated = key === 'failed_today' ? { from: today, to: today } : { from: '', to: '' };
    go({ ...filters, ...dated, status: s === 'pending' ? '' : s, page: 1 } as ListFilters);
  };

  const toApprove = bulkApprovable(rows, new Set(picked), access);
  const toReject = bulkRejectable(rows, new Set(picked), access);
  const mixProblem = bulkCurrencyProblem(rows, picked);
  const showPick = !second && status === 'pending' && rows.some((r) => payoutActions(r, access).reject);

  async function sendBulk(kind: Bulk) {
    const ids = kind === 'approve' ? toApprove : toReject;
    setBusy(true);
    setBulkError(null);
    try {
      const body = await api.post<{
        approval_request?: { id: number } | null; updated_count?: number; skipped_count?: number;
        requested_count?: number;
      }>('/payments/admin/payouts/bulk-action/', { action: kind, withdrawal_ids: ids, reason: bulkNote.trim() });
      const request = body?.approval_request;
      setNotice(request
        ? { kind: 'pending', text: aprNotice(request.id, `${body?.requested_count ?? ids.length} payouts as one run. Nothing is released until a second finance admin decides it.`) }
        : { kind: 'done', text: `${body?.updated_count ?? ids.length} payout${(body?.updated_count ?? ids.length) === 1 ? '' : 's'} ${kind === 'reject' ? 'rejected' : 'released'}${body?.skipped_count ? `; ${body.skipped_count} skipped` : ''}.` });
      setPicked([]);
      setBulk(null);
      setBulkNote('');
      await refresh();
    } catch (err) {
      setBulkError(failureText(err, 'The bulk action did not go through. Nothing was changed.'));
    } finally {
      setBusy(false);
    }
  }

  const chips: FilterChip[] = [];
  if (!second && filters.from && filters.to && view !== 'failed_today') {
    chips.push({ key: 'dates', label: `${filters.from} to ${filters.to}`, onRemove: () => go({ ...filters, from: '', to: '', page: 1 }) });
  }
  if (filters.scope) chips.push({ key: 'scope', label: `Place: ${filters.scope}`, onRemove: () => go({ ...filters, scope: '', page: 1 }) });
  if (filters.currency) chips.push({ key: 'cur', label: filters.currency, onRemove: () => go({ ...filters, currency: '', page: 1 }) });
  if (filters.method) chips.push({ key: 'method', label: `Paid by ${filters.method}`, onRemove: () => go({ ...filters, method: '', page: 1 }) });

  const columns: ListColumn<Row>[] = [
    { key: 'id', label: 'Payout', primary: true, sortKey: 'id', render: (w) => <span className="sg-num">PO-{w.id}</span> },
    { key: 'driver', label: 'Driver', sortKey: 'driver', render: (w) => <span>{whoOf(w)} <span className="ops-ref sg-num">D-{w.driver_id}</span></span> },
    { key: 'amount', label: 'Amount', num: true, sortKey: 'amount', render: (w) => formatWhole(w.amount_minor, w.currency) },
    { key: 'status', label: 'Status', render: (w) => <PayoutStatus w={w} /> },
    {
      key: 'details', label: 'Payout details',
      render: (w) => (w.upi_id || w.bank_account ? <StatusChip tone="good">On file</StatusChip> : <StatusChip tone="caution">Missing</StatusChip>),
    },
    { key: 'city', label: 'City', sortKey: 'city', render: (w) => cityName(w.city) },
    { key: 'age', label: 'Waiting', num: true, render: (w) => ageLabel(w.age_seconds) },
    { key: 'when', label: 'Requested', num: true, sortKey: 'requested', render: (w) => stamp(w.requested_at, timeZoneFor(w.city?.code)) },
  ];
  const requestColumns: ListColumn<Request>[] = [
    { key: 'ref', label: 'Request', primary: true, render: (r) => <span className="sg-num">{r.ref}</span> },
    { key: 'what', label: 'What', render: (r) => r.title },
    {
      key: 'payouts', label: 'Payouts',
      render: (r) => (r.subjects.length === 1
        ? <span>{r.subjects[0].ref} · {r.subjects[0].driver_name} <span className="ops-ref sg-num">{r.subjects[0].driver_ref}</span></span>
        : `${r.subjects.length} payouts`),
    },
    { key: 'amount', label: 'Amount', num: true, render: (r) => (r.amount != null && r.currency ? formatWhole(r.amount, r.currency) : '—') },
    { key: 'blocked', label: 'Can be approved', render: (r) => (r.blockers.length ? <StatusChip tone="caution">Blocked</StatusChip> : <StatusChip tone="info">Waiting</StatusChip>) },
    { key: 'maker', label: 'Raised by', render: (r) => r.maker?.label || r.maker?.email || '—' },
    { key: 'age', label: 'Waiting', num: true, render: (r) => waitedFor(r.requested_at) },
  ];

  const viewTabs = VIEWS.map((v) => ({ key: v.key, label: v.label, count: countOf(v.key) }));
  const currentQuery = (() => {
    if (second) return 'view=second';
    const s = new URLSearchParams(search.toString());
    s.delete('page');
    return s.toString();
  })();
  const onSaved = (q: string) => router.push(q ? `/finance/payouts?${q}` : '/finance/payouts');
  const totals = tabs.find((t) => t.status === status)?.amounts ?? [];

  return (
    <>
      <FinanceNav />
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
      {(data?.rail_notices ?? []).map((n) => (
        <div key={n.currency} className="ops-note ops-note--warn mb-4" role="status"><b>{n.note}</b></div>
      ))}

      {bulk && (
        <div className="ops-confirm mb-4" role="region" aria-label="Confirm the bulk action">
          <b>{bulk === 'approve' ? `Ask to release ${toApprove.length} payouts as one run` : `Reject ${toReject.length} payouts`}</b>
          <span>
            {bulk === 'approve'
              ? 'This raises ONE request for the whole batch. Nothing is released until a different finance admin approves it. A country with no approval policy is blocked.'
              : 'Each amount goes back to its driver\'s balance. The reason is kept in the audit log.'}
          </span>
          {bulk === 'approve' && mixProblem ? <span className="ops-confirm__warn">{mixProblem}</span> : null}
          <ul className="ops-reclist">
            {rows.filter((r) => (bulk === 'approve' ? toApprove : toReject).includes(r.id)).map((r) => (
              <li key={r.id}><span className="sg-num">PO-{r.id}</span> {whoOf(r)} <b className="sg-num">{exact(r)}</b></li>
            ))}
          </ul>
          <label className="sr-only" htmlFor="bulk-note">{bulk === 'reject' ? 'Reason for rejecting' : 'Note for the audit log'}</label>
          <textarea id="bulk-note" className="input" rows={2} value={bulkNote} onChange={(e) => setBulkNote(e.target.value)}
            placeholder={bulk === 'reject' ? 'Why are these being rejected? (required)' : 'Note for the audit log (optional)'} />
          {bulkError && <div className="alert-error" role="alert">{bulkError}</div>}
          <div>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy} onClick={() => setBulk(null)}>Back</button>{' '}
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
              disabled={busy || (bulk === 'reject' && bulkNote.trim().length < 5) || (bulk === 'approve' && (mixProblem !== null || toApprove.length === 0))}
              onClick={() => void sendBulk(bulk)}>
              {busy ? 'Working…' : bulk === 'approve' ? 'Send for approval' : 'Reject them'}
            </button>
          </div>
        </div>
      )}

      {second ? (
        <ListPage<Request>
          pageKey="payouts"
          title="Payouts"
          summary="Money leaving the platform. A payout request is decided in Approvals by a second finance admin."
          views={viewTabs}
          view={view}
          onView={setView}
          chips={chips}
          columns={requestColumns}
          rows={requests?.results ?? []}
          rowKey={(r) => r.id}
          total={requests?.count ?? null}
          page={requestPage}
          pageSize={50}
          onPage={setRequestPage}
          onRow={(r) => router.push(`/approvals?id=${r.id}`)}
          loading={requests === null && !requestsError}
          error={requestsError}
          empty="No payout is waiting for a second approver."
          currentQuery={currentQuery}
          onSavedView={onSaved}
        />
      ) : (
        <div className={open ? 'ops-split' : undefined}>
          <div className="ops-list-stack">
            <ListPage<Row>
              pageKey="payouts"
              title="Payouts"
              summary="Money leaving the platform. Releasing a payout dispatches it for real."
              actionsSlot={<ExportButton path={apiPath('/payments/admin/export/payouts/', { ...filters, page: 1 }, { status })} />}
              views={viewTabs}
              view={view}
              onView={setView}
              chips={chips}
              filterSlot={view === 'failed_today' ? null : (
                <MoreFilters count={filters.from && filters.to ? 1 : 0}>
                  <RangeBar from={filters.from} to={filters.to} idPrefix="payouts"
                    onApply={(r) => go({ ...filters, ...r, page: 1 })} />
                </MoreFilters>
              )}
              columns={columns}
              rows={rows}
              rowKey={(w) => w.id}
              total={data ? data.count : null}
              page={data?.page ?? filters.page}
              pageSize={data?.page_size ?? 25}
              onPage={(p) => go({ ...filters, page: p })}
              selectable={showPick}
              selected={picked}
              onSelected={(keys) => setPicked(keys.map(Number))}
              bulkActions={showPick ? [
                { key: 'approve', label: `Ask to release ${toApprove.length}`, onRun: () => { setBulk('approve'); setBulkNote(''); setBulkError(null); } },
                { key: 'reject', label: `Reject ${toReject.length}`, tone: 'danger', onRun: () => { setBulk('reject'); setBulkNote(''); setBulkError(null); } },
              ] : []}
              onRow={setOpen}
              ordering={filters.ordering || '-requested'}
              onOrdering={(o) => go({ ...filters, ordering: o, page: 1 })}
              activeKey={open?.id ?? null}
              loading={data === null && !error}
              error={error ? `${error} This is not the same as there being nothing to pay.` : null}
              empty={status === 'pending' ? 'No driver in your scope is waiting to be paid.' : `Nothing ${PAYOUT_LABEL[status]?.toLowerCase() ?? status}.`}
              currentQuery={currentQuery}
              onSavedView={onSaved}
            />
            {totals.length ? (
              <div className="ops-totals" aria-label="Amounts in this view, per currency">
                {totals.map((a) => (
                  <div className="ops-totals__group" key={a.currency}>
                    <b>{formatWhole(a.amount_minor, a.currency)}</b>
                    <span>{a.currency} · {PAYOUT_LABEL[status]?.toLowerCase() ?? status}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <Panel title="Payout rules">
              <p className="help m-0">
                The fee, the minimum, when a payout counts as stuck and the weekly schedule are set per country in{' '}
                <PageLink page="finance" href="/finance/payout-settings">Payout settings</PageLink>.
              </p>
            </Panel>
          </div>
          {open ? (
            <PayoutRecord
              key={open.id}
              row={open}
              onClose={() => setOpen(null)}
              onChanged={async (n) => { setNotice(n); setOpen(null); await refresh(); }}
            />
          ) : null}
        </div>
      )}
    </>
  );
}

/** The parts of an approval request the drawer needs to offer "Approve now". */
type SelfCheck = { id: number; status: string; can_decide: boolean; self_approval?: boolean; blockers: string[]; error?: string };

/** Open and decidable by this operator: a second checker, or the maker under the sole-Super-Admin exception. */
function decidable(req: SelfCheck | null): req is SelfCheck {
  return !!req && req.status === 'requested' && req.can_decide;
}

function PayoutRecord({ row, onClose, onChanged }: {
  row: Row; onClose: () => void; onChanged: (notice: Notice) => Promise<void>;
}) {
  const access = useAdminAccess();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [acting, setActing] = useState<Act | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // The open request this operator may approve here; `own` needs the self-approval reason.
  const [selfId, setSelfId] = useState<number | null>(null);
  const [own, setOwn] = useState(false);
  const [selfReason, setSelfReason] = useState('');
  const [blockedBy, setBlockedBy] = useState<{ id: number; blockers: string[] } | null>(null);

  async function offerSelfApproval(requestId: number): Promise<boolean> {
    const req = await api.get<SelfCheck>(`/approvals/admin/requests/${requestId}/`).catch(() => null);
    if (!decidable(req)) return false;
    if (req.blockers.length > 0) {
      setBlockedBy({ id: requestId, blockers: req.blockers });
      return false;
    }
    setOwn(!!req.self_approval);
    setSelfId(requestId);
    return true;
  }

  useEffect(() => {
    let live = true;
    api.get<Detail>(`/payments/admin/payouts/${row.id}/`)
      .then((d) => {
        if (!live) return;
        setDetail(d);
        if (d.approval && d.approval.status === 'requested') void offerSelfApproval(d.approval.id);
      })
      .catch((err) => { if (live) setDetailError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this payout.'); });
    return () => { live = false; };
  }, [row.id]);

  const current: Row = detail ?? row;
  const can = payoutActions(current, access);
  const tz = timeZoneFor(row.city?.code);
  const amount = exact(row);
  const who = row.driver_name || `driver #${row.driver_id}`;

  async function send(kind: Act) {
    setBusy(true);
    setActionError(null);
    const base = `/payments/admin/payouts/${row.id}`;
    try {
      if (kind === 'investigate') {
        await api.post(`${base}/investigation/`, { note: note.trim() });
        await onChanged({ kind: 'done', text: `${who}'s payout is marked under investigation. No money moved.` });
      } else if (kind === 'retry') {
        await api.post(`${base}/retry/`, { reason: note.trim() });
        await onChanged({ kind: 'done', text: `Sent ${amount} to ${who} again. The money was approved already, so no new approval was needed.` });
      } else {
        const body = await api.post<{ approval_request?: { id: number; status?: string } | null }>(
          `${base}/${kind}/`, { reason: note.trim() });
        const outcome = interpretWrite(body as never, kind === 'approve'
          ? `Released ${amount} to ${who}.`
          : `Rejected ${amount}; the amount went back to the driver's balance.`);
        if (outcome.kind === 'pending' && kind === 'approve' && await offerSelfApproval(outcome.requestId)) {
          setActing(null);
          setNote('');
          return;
        }
        await onChanged(outcome.kind === 'pending'
          ? { kind: 'pending', text: aprNotice(outcome.requestId, `${amount} to ${who}. Nothing is released until a second finance admin decides it.`) }
          : { kind: 'done', text: outcome.message });
      }
    } catch (err) {
      setActionError(failureText(err, 'That did not go through. Nothing was changed.'));
    } finally {
      setBusy(false);
    }
  }

  async function approveNow() {
    if (selfId === null) return;
    setBusy(true);
    setActionError(null);
    try {
      const done = await api.post<SelfCheck>(`/approvals/admin/requests/${selfId}/approve/`, { reason: selfReason.trim() });
      await onChanged(done.status === 'executed'
        ? { kind: 'done', text: `Released ${amount} to ${who}.${own ? ` Recorded as self-approved (APR-${selfId}).` : ` APR-${selfId} approved.`}` }
        : { kind: 'done', text: `APR-${selfId} was approved, but the payout did not go out${done.error ? `: ${done.error}` : '.'}` });
    } catch (err) {
      setActionError(failureText(err, 'That did not go through. Nothing was released.'));
    } finally {
      setBusy(false);
    }
  }

  const noteLabel = acting === 'investigate' ? 'Note (required)'
    : acting === 'approve' ? 'Note for the audit log (optional)' : 'Reason (required)';
  const noteReady = acting === 'approve' || note.trim().length >= 5;
  const target = { type: 'withdrawal', id: row.id } as const;

  return (
    <RecordPanel
      label="Payout"
      title={whoOf(row)}
      refId={`PO-${row.id}`}
      onClose={onClose}
      subtitle={<>D-{row.driver_id} · {cityName(row.city)}</>}
      status={<PayoutStatus w={current} />}
      actions={acting === null && selfId === null ? (
        <>
          {can.approve && (
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy}
              onClick={() => { setActing('approve'); setNote(''); }}>Ask to release…</button>
          )}
          {can.reject && (
            <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy}
              onClick={() => { setActing('reject'); setNote(''); }}>Reject…</button>
          )}
          {can.retry && (
            <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy}
              onClick={() => { setActing('retry'); setNote(''); }}>Retry payout…</button>
          )}
          {can.investigate && (
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy}
              onClick={() => { setActing('investigate'); setNote(current.investigation_note ?? ''); }}>
              {current.under_investigation ? 'Update investigation note' : 'Mark under investigation'}
            </button>
          )}
        </>
      ) : null}
      tabs={[
        {
          key: 'overview', label: 'Overview', content: (
            <>
              {detailError && <div className="alert-error" role="alert">{detailError}</div>}
              {can.blocked && (
                <div className="ops-note ops-note--warn" role="status"><b>{can.blocked}</b>{' '}
                  This payout cannot be released from the console until the owner configures an approval policy
                  for this country. You can still reject it, which returns the amount to the driver.</div>
              )}
              {selfId !== null && (
                <div className="ops-confirm">
                  <b>Approve now: release {amount} to {who}</b>
                  <span>{own ? SELF_APPROVAL_LINE : `APR-${selfId} is waiting for a checker. Approving it releases the money now.`}</span>
                  <label className="sr-only" htmlFor="payout-self-reason">{own ? 'Reason (required)' : 'Note (optional)'}</label>
                  <textarea id="payout-self-reason" className="input" rows={3} value={selfReason}
                    onChange={(e) => setSelfReason(e.target.value)}
                    placeholder={own ? `Reason (required, at least ${SELF_APPROVAL_MIN_REASON} characters)` : 'Note for the audit log (optional)'} />
                  {actionError && <div className="alert-error" role="alert">{actionError}</div>}
                  <div>
                    <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy}
                      onClick={() => void onChanged({ kind: 'pending', text: aprNotice(selfId, `${amount} to ${who}. Nothing is released until it is approved.`) })}>
                      Not now
                    </button>{' '}
                    <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
                      disabled={busy || (own && selfReason.trim().length < SELF_APPROVAL_MIN_REASON)}
                      onClick={() => void approveNow()}>{busy ? 'Working…' : 'Approve now'}</button>
                  </div>
                </div>
              )}
              {blockedBy && selfId === null && (
                <div className="ops-note ops-note--warn" role="status">
                  <b>APR-{blockedBy.id} cannot be approved yet: {blockedBy.blockers.join('; ')}.</b>{' '}
                  Add the payout details first, or reject the payout to return the amount to the driver.</div>
              )}
              {can.awaitingChecker && selfId === null && !blockedBy && (
                <div className="ops-confirm" role="status"><b>Waiting for a second finance admin.</b>{' '}
                  The request is open; nothing has been released.</div>
              )}
              {acting && (
                <div className="ops-confirm">
                  <b>
                    {acting === 'approve' ? `Ask to release ${amount} to ${who}`
                      : acting === 'reject' ? `Reject ${amount} for ${who}`
                        : acting === 'retry' ? `Retry the ${amount} payout`
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
                  <div>
                    <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy}
                      onClick={() => { setActing(null); setNote(''); setActionError(null); }}>Back</button>{' '}
                    <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || !noteReady}
                      onClick={() => void send(acting)}>
                      {busy ? 'Working…' : acting === 'approve' ? `Ask to release ${amount}`
                        : acting === 'reject' ? 'Reject with this reason'
                          : acting === 'retry' ? `Retry ${amount}` : 'Save the note'}
                    </button>
                  </div>
                </div>
              )}
              <div className="ops-recstats">
                <RecordStat label="Amount" value={amount} note={row.currency} />
                {current.fee_minor ? <RecordStat label="Transfer fee" value={formatMinor(current.fee_minor, row.currency)} note="taken from the payout" /> : null}
                <RecordStat label="Waiting" value={ageLabel(row.age_seconds)} />
              </div>
              <RecordFacts rows={[
                ['Driver', <PageLink key="d" page="drivers" href={`/drivers/${row.driver_id}`}>{whoOf(row)} (D-{row.driver_id})</PageLink>],
                ['Phone', detail ? <Revealable key="p" value={detail.driver_phone || '—'} label="driver phone" target={target} field="driver_phone" /> : '—'],
                ['Pays to', row.payout_method === 'bank'
                  ? (row.bank_account || 'No bank account on file')
                  : row.upi_id
                    ? <Revealable key="u" value={row.upi_id} label="UPI handle" target={target} field="upi_id" />
                    : 'No UPI on file'],
                current.origin === 'scheduled' ? ['Created by', 'The weekly payout run'] : null,
                current.awaiting_rail && current.rail_note ? ['Payout rail', current.rail_note] : null,
                ['Requested', stamp(row.requested_at, tz)],
                row.processed_at ? ['Processed', stamp(row.processed_at, tz)] : null,
                row.payout_reference ? ['Payout reference', row.payout_reference] : null,
                row.failure_count > 0 ? ['Failures', `${row.failure_count}${row.failure_reason ? ` · ${row.failure_reason}` : ''}`] : null,
                current.under_investigation ? ['Investigation', current.investigation_note || 'Marked under investigation'] : null,
                ['Approval', current.approval ? (
                  <span key="a">
                    {current.approval.batch ? 'Payout run · ' : ''}
                    <PageLink page="approvals" href={`/approvals?id=${current.approval.id}`}>APR-{current.approval.id}</PageLink>
                    {' '}· {current.approval.status} · asked by {current.approval.maker.label || 'an operator'}
                    {current.approval.checker ? ` · checked by ${current.approval.checker.label || 'an operator'}` : ''}
                  </span>
                ) : 'None raised'],
                detail?.admin_notes ? ['Notes', detail.admin_notes] : null,
              ]} />
            </>
          ),
        },
        {
          key: 'gateway', label: 'Money', content: !detail ? <p className="ops-record__empty">Loading…</p>
            : detail.transactions.length === 0 ? <p className="ops-record__empty">No gateway records yet.</p> : (
              <RecordSection title="Gateway records">
                <ul className="ops-reclist">
                  {detail.transactions.map((t) => (
                    <li key={t.id}>
                      <span className="muted">{stamp(t.created_at, tz)}</span>
                      <span>{t.status || '—'}</span>
                      <span>{t.gateway_transaction_id || '—'}</span>
                      <b className="sg-num">{formatMinor(t.amount_minor, t.currency)}</b>
                    </li>
                  ))}
                </ul>
              </RecordSection>
            ),
        },
        {
          key: 'history', label: 'History', content: (
            <History
              entries={(detail?.history ?? []).map((h) => ({ at: stamp(h.at, tz), text: <>{h.action.replace(/_/g, ' ')}{h.reason ? ` · ${h.reason}` : ''}</>, who: h.by || null }))}
              empty={detail ? 'Nothing recorded yet.' : 'Loading…'}
            />
          ),
        },
      ]}
    />
  );
}

export default function PayoutsPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <PayoutsInner />
    </Suspense>
  );
}
