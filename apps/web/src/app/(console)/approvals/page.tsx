'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useDensity } from '@/lib/consolePrefs';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import { formatMinor, formatWhole } from '@/lib/trips';
import { PageLink } from '@/components/console/PageLink';
import { Pager } from '@/components/console/finance';
import {
  Column, DataTable, Drawer, Empty, ErrorState, Fact, Facts, Filters, PageHeader, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * Approvals: everything waiting for a second person (owner, 2026-11-03).
 *
 * The maker-checker API existed; nothing in the console called it, so a payout
 * request could be raised and never decided. Here every open request is one
 * row, and its drawer has Approve and Reject (with a reason) for anyone the
 * server says may decide it: a checker who holds `approval.check` and the
 * action's own capability where the request sits, and who is not the maker.
 * The server answers that question per request (`can_decide`); the buttons are
 * drawn from its answer and the server re-checks on the click.
 */

type Person = { id: number; email: string; label: string; role: string } | null;
type Subject = {
  ref: string; withdrawal_id: number; driver_id: number; driver_ref: string;
  driver_name: string; amount_minor: number; currency: string; status: string;
};
export type ApprovalRow = {
  id: number;
  ref: string;
  title: string;
  action_key: string;
  country: string;
  scope: string | null;
  amount: number | null;
  currency: string | null;
  target_type: string;
  target_id: string;
  request_reason: string;
  maker: Person;
  checker: Person;
  status: string;
  requested_at: string | null;
  expires_at: string | null;
  decided_at: string | null;
  decision_reason: string;
  error: string;
  subjects: Subject[];
  blockers: string[];
  can_decide: boolean;
  cannot_decide_reason: string | null;
  can_cancel: boolean;
};
type Page = { count: number; total_pages?: number; results: ApprovalRow[] };

type View = 'waiting' | 'mine' | 'open' | 'executed' | 'rejected';
const VIEWS: ReadonlyArray<{ key: View; label: string; query: string }> = [
  { key: 'waiting', label: 'Waiting for me', query: 'pending_for_me=1' },
  { key: 'mine', label: 'Raised by me', query: 'mine=1' },
  { key: 'open', label: 'All open', query: 'status=requested' },
  { key: 'executed', label: 'Done', query: 'status=executed' },
  { key: 'rejected', label: 'Rejected', query: 'status=rejected' },
];

const STATUS_WORDS: Record<string, string> = {
  requested: 'Waiting', approved: 'Running', executed: 'Done', rejected: 'Rejected',
  failed: 'Approved, failed', cancelled: 'Withdrawn', expired: 'Expired',
};

function statusTone(status: string) {
  if (status === 'executed') return 'good' as const;
  if (status === 'rejected' || status === 'failed') return 'bad' as const;
  if (status === 'requested' || status === 'approved') return 'wait' as const;
  return 'neutral' as const;
}

function waitingFor(iso: string | null): string {
  if (!iso) return '—';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function amountOf(row: ApprovalRow, exact = false): string {
  if (row.amount === null || row.amount === undefined || !row.currency) return '—';
  return exact ? formatMinor(row.amount, row.currency) : formatWhole(row.amount, row.currency);
}

function ApprovalsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<View>((params.get('view') as View) || 'waiting');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApprovalRow | null>(null);
  const [density] = useDensity();

  const load = useCallback(async () => {
    setError(null);
    const q = VIEWS.find((v) => v.key === view)?.query ?? '';
    try {
      setData(await api.get<Page>(`/approvals/admin/requests/?${q}&page=${page}&page_size=50`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Approvals could not be loaded.');
    }
  }, [view, page]);

  useEffect(() => { void load(); }, [load]);

  // A deep link (from Needs action, an alert or a notification) opens the request.
  useEffect(() => {
    const id = params.get('id');
    if (!id) return;
    void api.get<ApprovalRow>(`/approvals/admin/requests/${id}/`)
      .then(setSelected).catch(() => setError(`Request APR-${id} could not be opened.`));
  }, [params]);

  const close = () => {
    setSelected(null);
    if (params.get('id')) router.replace('/approvals');
  };

  const columns: Column<ApprovalRow>[] = [
    { key: 'ref', label: 'Request', width: '7rem', sortValue: (r) => r.id,
      render: (r) => <span className="sg-num">{r.ref}</span> },
    { key: 'title', label: 'What', sortValue: (r) => r.title,
      render: (r) => (
        <span title={r.title}>
          {r.title}
          {r.blockers.length ? <> {' '}<Pill tone="wait">Blocked</Pill></> : null}
        </span>
      ) },
    { key: 'amount', label: 'Amount', num: true, width: '9rem', sortValue: (r) => r.amount,
      render: (r) => amountOf(r) },
    { key: 'place', label: 'Place', width: '9rem', sortValue: (r) => r.scope,
      render: (r) => r.scope ?? r.country },
    { key: 'maker', label: 'Raised by', width: '12rem', sortValue: (r) => r.maker?.label,
      render: (r) => <span title={r.maker?.email}>{r.maker?.label || r.maker?.email || '—'}</span> },
    { key: 'age', label: 'Waiting', num: true, width: '6rem',
      sortValue: (r) => (r.requested_at ? -new Date(r.requested_at).getTime() : null),
      render: (r) => (r.status === 'requested' ? waitingFor(r.requested_at) : '—') },
    { key: 'status', label: 'Status', width: '9rem', sortValue: (r) => r.status,
      render: (r) => <Pill tone={statusTone(r.status)}>{STATUS_WORDS[r.status] ?? r.status}</Pill> },
  ];

  const rows = data?.results ?? [];
  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Everything waiting for a second person. The person who raised a request cannot decide it."
      />
      <Filters value={view} options={VIEWS} onChange={(v) => { setView(v); setPage(1); }} />
      {error ? <ErrorState title={error} onRetry={() => void load()} /> : null}
      {!data && !error ? <Skeleton kind="row" count={6} /> : null}
      {data && rows.length === 0 ? (
        <Empty title={view === 'waiting' ? 'Nothing is waiting for you' : 'No requests here'} />
      ) : null}
      {data && rows.length > 0 ? (
        <>
          <DataTable
            caption="Approval requests"
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            onRow={setSelected}
            selectedKey={selected?.id ?? null}
            density={density}
          />
          <Pager page={page} totalPages={data.total_pages ?? Math.ceil(data.count / 50)} onPage={setPage} />
        </>
      ) : null}
      {selected ? (
        <RequestDrawer
          row={selected}
          onClose={close}
          onDecided={(next) => { setSelected(next); void load(); }}
        />
      ) : null}
    </>
  );
}

function RequestDrawer({
  row, onClose, onDecided,
}: { row: ApprovalRow; onClose: () => void; onDecided: (row: ApprovalRow) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | 'cancel' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const tz = timeZoneFor(row.scope);
  const open = row.status === 'requested';

  useEffect(() => { setReason(''); setProblem(null); }, [row.id]);

  async function act(kind: 'approve' | 'reject' | 'cancel') {
    if (kind === 'reject' && !reason.trim()) {
      setProblem('Say why you are rejecting it. The person who raised it will see this.');
      return;
    }
    setBusy(kind);
    setProblem(null);
    try {
      const next = await api.post<ApprovalRow>(
        `/approvals/admin/requests/${row.id}/${kind}/`, { reason: reason.trim() });
      onDecided(next);
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const footer = open ? (
    <div>
      {row.can_decide ? (
        <>
          <button type="button" className="sg-btn sg-btn--primary" disabled={!!busy || row.blockers.length > 0}
            onClick={() => void act('approve')}>
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          {' '}
          <button type="button" className="sg-btn sg-btn--ghost" disabled={!!busy}
            onClick={() => void act('reject')}>
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
        </>
      ) : null}
      {row.can_cancel ? (
        <button type="button" className="sg-btn sg-btn--ghost" disabled={!!busy}
          onClick={() => void act('cancel')}>
          {busy === 'cancel' ? 'Withdrawing…' : 'Withdraw my request'}
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <Drawer open title={`${row.ref} · ${row.title}`} onClose={onClose} footer={footer}>
      {row.blockers.length ? (
        <div className="ops-note ops-note--warn mb-4" role="alert">
          <b>This cannot be approved.</b>{' '}
          {row.blockers.map((b) => <span key={b}>{b}. Reject it with that reason. </span>)}
        </div>
      ) : null}
      <Facts>
        <Fact label="Status"><Pill tone={statusTone(row.status)}>{STATUS_WORDS[row.status] ?? row.status}</Pill></Fact>
        <Fact label="Amount">{amountOf(row, true)}</Fact>
        <Fact label="Place">{row.scope ?? row.country}</Fact>
        <Fact label="Raised by">{row.maker?.label || row.maker?.email || '—'}</Fact>
        <Fact label="Raised">{stamp(row.requested_at, tz)}</Fact>
        {row.expires_at ? <Fact label="Expires">{stamp(row.expires_at, tz)}</Fact> : null}
        <Fact label="Their reason">{row.request_reason || '—'}</Fact>
        {row.checker ? <Fact label="Decided by">{row.checker.label || row.checker.email}</Fact> : null}
        {row.decided_at ? <Fact label="Decided">{stamp(row.decided_at, tz)}</Fact> : null}
        {row.decision_reason ? <Fact label="Decision reason">{row.decision_reason}</Fact> : null}
        {row.error ? <Fact label="What went wrong">{row.error}</Fact> : null}
      </Facts>
      {row.subjects.length ? (
        <section className="mt-4" aria-label="What this releases">
          <h3 className="ops-subhead">What this releases</h3>
          <ul>
            {row.subjects.map((s) => (
              <li key={s.ref}>
                <span className="sg-num">{s.ref}</span>{' · '}
                <PageLink href={`/drivers/${s.driver_id}`} page="drivers">{s.driver_name}</PageLink>
                {' '}<span className="sg-num">({s.driver_ref})</span>
                {' · '}{formatMinor(s.amount_minor, s.currency)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {open ? (
        <section className="ops-confirm mt-4" aria-label="Decision">
          {row.can_decide || row.can_cancel ? (
            <>
              <label htmlFor={`reason-${row.id}`}><b>Reason</b>{row.can_decide ? ' (needed to reject; the person who raised it sees it)' : ''}</label>
              <textarea id={`reason-${row.id}`} className="input" rows={3} value={reason}
                onChange={(e) => setReason(e.target.value)} maxLength={2000} />
            </>
          ) : null}
          {!row.can_decide && row.cannot_decide_reason ? <span>{row.cannot_decide_reason}</span> : null}
          {problem ? <div className="alert-error" role="alert">{problem}</div> : null}
        </section>
      ) : null}
    </Drawer>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton kind="row" count={6} />}>
      <ApprovalsPage />
    </Suspense>
  );
}
