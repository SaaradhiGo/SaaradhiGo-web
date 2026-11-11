'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { withScope } from '@/lib/adminScope';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import { formatMinor, formatWhole } from '@/lib/trips';
import { downloadCsv, fetchAllPages, toCsv, useViewCounts } from '@/lib/listViews';
import { PageLink } from '@/components/console/PageLink';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { History, RecordPanel, RecordStat, type HistoryEntry } from '@/components/console/kit/RecordPanel';
import { StatusChip, type ChipTone } from '@/components/console/kit/StatusChip';
import { ActionNotice, RecordFacts, RecordFailed, RecordLoading, RecordSection } from '@/components/console/kit/ListBits';
import { Skeleton } from '@/components/console/ui';
import { SELF_APPROVAL_LINE, SELF_APPROVAL_MIN_REASON } from '@/components/console/SelfApprovalNotice';

/**
 * Approvals: everything waiting for a second person (owner, 2026-11-03), as a
 * list with the request beside it (design board B).
 *
 * Every open request is one row, and its record has Approve and Reject (with
 * a reason) for anyone the server says may decide it: a checker who holds
 * `approval.check` and the action's own capability where the request sits,
 * and who is not the maker. The server answers that question per request
 * (`can_decide`, and `cannot_decide_reason` when not); the buttons are drawn
 * from its answer and the server re-checks on the click. The maker may
 * withdraw their own open request. `?id=` opens one request (from Needs
 * action, an alert, a notification or a payout's APR- link).
 *
 * The one exception (owner, 2026-11-03): while APPROVALS_SOLO_SUPER_ADMIN is
 * on and nobody else could check it, the sole Super Admin may decide their
 * own request. The server says so per request (`self_approval`); the record
 * then says it will be recorded as self-approved and a reason is required.
 */

type Person = { id: number; email: string; label: string; role: string } | null;
type Subject = {
  ref: string; withdrawal_id: number; driver_id: number; driver_ref: string;
  driver_name: string; amount_minor: number; currency: string; status: string;
};
type ApprovalRow = {
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
  /** What the request would change, as the server shows it (personal data masked). */
  payload?: Record<string, unknown> | null;
  can_decide: boolean;
  cannot_decide_reason: string | null;
  can_cancel: boolean;
  /** The caller may decide only as the maker, under the sole-Super-Admin exception. */
  self_approval?: boolean;
  /** Decided by its own maker under that exception. */
  self_approved?: boolean;
};
type Page = { count: number; total_pages?: number; results: ApprovalRow[]; self_approval_on?: boolean };

type View = 'waiting' | 'mine' | 'open' | 'executed' | 'rejected' | 'self';
const VIEWS: ReadonlyArray<{ key: View; label: string; query: string }> = [
  { key: 'waiting', label: 'Waiting for me', query: 'pending_for_me=1' },
  { key: 'mine', label: 'Raised by me', query: 'mine=1' },
  { key: 'open', label: 'All open', query: 'status=requested' },
  { key: 'executed', label: 'Done', query: 'status=executed' },
  { key: 'rejected', label: 'Rejected', query: 'status=rejected' },
  { key: 'self', label: 'Self-approved', query: 'self_approved=1' },
];
const PAGE_SIZE = 50;

const STATUS_WORDS: Record<string, string> = {
  requested: 'Waiting', approved: 'Running', executed: 'Done', rejected: 'Rejected',
  failed: 'Approved, failed', cancelled: 'Withdrawn', expired: 'Expired',
};

function statusTone(status: string): ChipTone {
  if (status === 'executed') return 'good';
  if (status === 'rejected' || status === 'failed') return 'caution';
  if (status === 'requested' || status === 'approved') return 'info';
  return 'neutral';
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

/** Column sorts the server accepts (`?ordering=`); anything else falls back to newest first. */
const SORTABLE = /^-?(id|requested|decided|amount|status|action|maker)$/;
const DEFAULT_ORDERING = '-requested';

const listPath = (view: View, page: number, size = PAGE_SIZE, ordering = DEFAULT_ORDERING) =>
  withScope(`/approvals/admin/requests/?${VIEWS.find((v) => v.key === view)?.query ?? ''}&ordering=${ordering}&page=${page}&page_size=${size}`);

function ApprovalsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const view: View = (VIEWS.find((v) => v.key === params.get('view'))?.key) ?? 'waiting';
  const pageNo = Math.max(1, Number(params.get('page')) || 1);
  const openId = /^\d+$/.test(params.get('id') ?? '') ? Number(params.get('id')) : null;
  const ordering = SORTABLE.test(params.get('ordering') ?? '') ? (params.get('ordering') as string) : DEFAULT_ORDERING;

  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'pending' | 'done' } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reloads, setReloads] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await api.get<Page>(listPath(view, pageNo, PAGE_SIZE, ordering)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Approvals could not be loaded.');
    }
  }, [view, pageNo, ordering]);
  useEffect(() => { void load(); }, [load]);

  const countPaths = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.key, listPath(v.key, 1, 1)])), []);
  const counts = useViewCounts(countPaths, reloads);

  /** The list's own state in the URL, with or without an open request. */
  const href = (next: { view?: View; page?: number; id?: number | null; ordering?: string }) => {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    if (v !== 'waiting') q.set('view', v);
    const o = next.ordering ?? ordering;
    if (o !== DEFAULT_ORDERING) q.set('ordering', o);
    const p = next.page ?? pageNo;
    if (p > 1) q.set('page', String(p));
    const id = next.id === undefined ? openId : next.id;
    if (id) q.set('id', String(id));
    const s = q.toString();
    return s ? `/approvals?${s}` : '/approvals';
  };

  const columns: ListColumn<ApprovalRow>[] = [
    { key: 'ref', label: 'Request', primary: true, sortKey: 'id', render: (r) => <span className="sg-num">{r.ref}</span> },
    {
      key: 'title', label: 'What', sortKey: 'action', render: (r) => (
        <span title={r.title} className="ops-chips">
          {r.title}
          {r.blockers.length ? <StatusChip tone="caution">Blocked</StatusChip> : null}
        </span>
      ),
    },
    { key: 'amount', label: 'Amount', num: true, sortKey: 'amount', render: (r) => amountOf(r) },
    { key: 'place', label: 'Place', render: (r) => r.scope ?? r.country },
    { key: 'maker', label: 'Raised by', sortKey: 'maker', render: (r) => <span title={r.maker?.email}>{r.maker?.label || r.maker?.email || '—'}</span> },
    { key: 'age', label: 'Waiting', num: true, render: (r) => (r.status === 'requested' ? waitingFor(r.requested_at) : '—') },
    {
      key: 'status', label: 'Status', sortKey: 'status', render: (r) => (
        <span className="ops-chips">
          <StatusChip tone={statusTone(r.status)}>{STATUS_WORDS[r.status] ?? r.status}</StatusChip>
          {r.self_approved ? <StatusChip tone="caution">Self-approved</StatusChip> : null}
        </span>
      ),
    },
  ];

  async function exportView() {
    setExporting(true);
    try {
      const { rows, truncated } = await fetchAllPages<ApprovalRow>((p, size) => listPath(view, p, size, ordering));
      const header = ['Request', 'What', 'Amount', 'Currency', 'Place', 'Raised by', 'Raised', 'Status', 'Decided by', 'Decision reason'];
      const body = rows.map((r) => [
        r.ref, r.title, amountOf(r), r.currency ?? '', r.scope ?? r.country, r.maker?.label || r.maker?.email || '',
        stamp(r.requested_at, timeZoneFor(r.scope)), STATUS_WORDS[r.status] ?? r.status,
        r.checker?.label || r.checker?.email || '', r.decision_reason,
      ]);
      downloadCsv(`approvals-${view}.csv`, toCsv(header, body));
      if (truncated) setNotice({ kind: 'done', text: `Exported the first ${rows.length.toLocaleString('en-IN')} requests.` });
    } catch (err) {
      setNotice({ kind: 'done', text: err instanceof ApiError && err.fromServer ? err.message : 'The export did not complete.' });
    } finally {
      setExporting(false);
    }
  }

  const rows = data?.results ?? [];
  return (
    <>
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
      <div className={openId ? 'ops-split' : undefined}>
        <ListPage<ApprovalRow>
          pageKey="approvals"
          title="Approvals"
          summary={data?.self_approval_on
            ? 'Everything waiting for a second person. Until someone else can check, the one Super Admin decides their own requests, recorded as self-approved.'
            : 'Everything waiting for a second person. The person who raised a request cannot decide it.'}
          views={VIEWS.map((v) => ({ key: v.key, label: v.label, count: counts[v.key] ?? null }))}
          view={view}
          onView={(key) => router.push(href({ view: key as View, page: 1, id: null }))}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          total={data ? data.count : null}
          page={pageNo}
          pageSize={PAGE_SIZE}
          onPage={(p) => router.push(href({ page: p }))}
          onExport={exporting ? undefined : () => void exportView()}
          onRow={(r) => router.replace(href({ id: r.id }))}
          ordering={ordering}
          onOrdering={(o) => router.push(href({ ordering: o, page: 1 }))}
          activeKey={openId}
          loading={data === null && !error}
          error={error}
          empty={view === 'waiting' ? 'Nothing is waiting for you.' : 'No requests here.'}
          currentQuery={view === 'waiting' ? '' : `view=${view}`}
          onSavedView={(q) => router.push(q ? `/approvals?${q}` : '/approvals')}
        />
        {openId ? (
          <RequestRecord
            key={openId}
            id={openId}
            initial={rows.find((r) => r.id === openId) ?? null}
            onClose={() => router.replace(href({ id: null }))}
            onDecided={(text) => { setNotice({ text, kind: 'done' }); setReloads((n) => n + 1); void load(); }}
          />
        ) : null}
      </div>
    </>
  );
}

function RequestRecord({ id, initial, onClose, onDecided }: {
  id: number; initial: ApprovalRow | null; onClose: () => void; onDecided: (text: string) => void;
}) {
  const [row, setRow] = useState<ApprovalRow | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | 'cancel' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Always the server's own answer for this one request (can_decide is per request).
  const load = useCallback(async () => {
    setError(null);
    try {
      setRow(await api.get<ApprovalRow>(`/approvals/admin/requests/${id}/`));
    } catch {
      setError(`Request APR-${id} could not be opened.`);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error && !row) return <RecordFailed label="Approval request" message={error} onRetry={() => void load()} onClose={onClose} />;
  if (!row) return <RecordLoading label="Approval request" />;

  const tz = timeZoneFor(row.scope);
  const open = row.status === 'requested';

  async function act(kind: 'approve' | 'reject' | 'cancel') {
    if (!row) return;
    if (kind !== 'cancel' && row.self_approval && reason.trim().length < SELF_APPROVAL_MIN_REASON) {
      setProblem(`Give a reason of at least ${SELF_APPROVAL_MIN_REASON} characters. No one else checks this, so the reason is the record.`);
      return;
    }
    if (kind === 'reject' && !reason.trim()) {
      setProblem('Say why you are rejecting it. The person who raised it will see this.');
      return;
    }
    setBusy(kind);
    setProblem(null);
    try {
      const next = await api.post<ApprovalRow>(`/approvals/admin/requests/${row.id}/${kind}/`, { reason: reason.trim() });
      setRow(next);
      setReason('');
      onDecided(`${row.ref} ${kind === 'approve' ? 'approved' : kind === 'reject' ? 'rejected' : 'withdrawn'}${row.self_approval && kind !== 'cancel' ? ', recorded as self-approved' : ''}.`);
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const history = ([
    row.decided_at ? {
      at: stamp(row.decided_at, tz),
      text: <>{STATUS_WORDS[row.status] ?? row.status}{row.decision_reason ? ` · ${row.decision_reason}` : ''}{row.error ? ` · ${row.error}` : ''}</>,
      who: row.checker?.label || row.checker?.email || null,
    } : null,
    row.requested_at ? {
      at: stamp(row.requested_at, tz),
      text: <>Raised{row.request_reason ? ` · ${row.request_reason}` : ''}</>,
      who: row.maker?.label || row.maker?.email || null,
    } : null,
  ] as Array<HistoryEntry | null>).filter((e): e is HistoryEntry => e !== null);

  return (
    <RecordPanel
      label="Approval request"
      title={row.title}
      refId={row.ref}
      onClose={onClose}
      subtitle={<>{row.scope ?? row.country} · raised by {row.maker?.label || row.maker?.email || '—'}</>}
      status={(
        <>
          <StatusChip tone={statusTone(row.status)}>{STATUS_WORDS[row.status] ?? row.status}</StatusChip>
          {row.blockers.length ? <StatusChip tone="caution">Cannot be approved</StatusChip> : null}
          {row.self_approved ? <StatusChip tone="caution">Self-approved</StatusChip> : null}
        </>
      )}
      actions={open && (row.can_decide || row.can_cancel) ? (
        <>
          {row.can_decide ? (
            <>
              {row.self_approval ? <p className="ops-note ops-record__note">{SELF_APPROVAL_LINE}</p> : null}
              <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={!!busy || row.blockers.length > 0}
                onClick={() => void act('approve')}>{busy === 'approve' ? 'Approving…' : 'Approve'}</button>
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={!!busy}
                onClick={() => void act('reject')}>{busy === 'reject' ? 'Rejecting…' : 'Reject'}</button>
            </>
          ) : null}
          {row.can_cancel ? (
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={!!busy}
              onClick={() => void act('cancel')}>{busy === 'cancel' ? 'Withdrawing…' : 'Withdraw my request'}</button>
          ) : null}
        </>
      ) : null}
      tabs={[
        {
          key: 'overview', label: 'Overview', content: (
            <>
              {row.blockers.length ? (
                <div className="ops-note ops-note--warn" role="alert">
                  <b>This cannot be approved.</b>{' '}
                  {row.blockers.map((b) => <span key={b}>{b}. Reject it with that reason. </span>)}
                </div>
              ) : null}
              <WhatChanges payload={row.payload} />
              {open ? (
                <section className="ops-confirm" aria-label="Decision">
                  {row.can_decide || row.can_cancel ? (
                    <>
                      <label htmlFor={`reason-${row.id}`}><b>Reason</b>{row.can_decide && row.self_approval
                        ? ` (required, at least ${SELF_APPROVAL_MIN_REASON} characters; kept with the self-approval)`
                        : row.can_decide ? ' (needed to reject; the person who raised it sees it)' : ''}</label>
                      <textarea id={`reason-${row.id}`} className="input" rows={3} value={reason}
                        onChange={(e) => setReason(e.target.value)} maxLength={2000} />
                    </>
                  ) : null}
                  {!row.can_decide && row.cannot_decide_reason ? <span>{row.cannot_decide_reason}</span> : null}
                  {problem ? <div className="alert-error" role="alert">{problem}</div> : null}
                </section>
              ) : null}
              <div className="ops-recstats">
                <RecordStat label="Amount" value={amountOf(row, true)} />
                {open ? <RecordStat label="Waiting" value={waitingFor(row.requested_at)} /> : null}
              </div>
              <RecordFacts rows={[
                ['Place', row.scope ?? row.country],
                ['Raised by', row.maker?.label || row.maker?.email || '—'],
                ['Raised', stamp(row.requested_at, tz)],
                row.expires_at ? ['Expires', stamp(row.expires_at, tz)] : null,
                ['Their reason', row.request_reason || '—'],
                row.checker ? ['Decided by', row.checker.label || row.checker.email] : null,
                row.decided_at ? ['Decided', stamp(row.decided_at, tz)] : null,
                row.decision_reason ? ['Decision reason', row.decision_reason] : null,
                row.error ? ['What went wrong', row.error] : null,
              ]} />
            </>
          ),
        },
        ...(row.subjects.length ? [{
          key: 'subjects', label: 'What this releases', content: (
            <RecordSection title={`${row.subjects.length} payout${row.subjects.length === 1 ? '' : 's'}`}>
              <ul className="ops-reclist">
                {row.subjects.map((s) => (
                  <li key={s.ref}>
                    <span className="sg-num">{s.ref}</span>
                    <PageLink href={`/drivers/${s.driver_id}`} page="drivers">{s.driver_name}</PageLink>
                    <span className="ops-ref sg-num">{s.driver_ref}</span>
                    <b className="sg-num">{formatMinor(s.amount_minor, s.currency)}</b>
                  </li>
                ))}
              </ul>
            </RecordSection>
          ),
        }] : []),
        { key: 'history', label: 'History', content: <History entries={history} /> },
      ]}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton kind="row" count={6} />}>
      <ApprovalsPage />
    </Suspense>
  );
}


const HIDDEN_KEYS = /(^|_)(id|ids|key|idempotency_key|version)$/;

/** "base_fare_minor" -> "Base fare minor"; nested objects one level down. */
function changeLines(payload: Record<string, unknown> | null | undefined): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const word = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const text = (v: unknown): string => (v === null || v === undefined ? '—'
    : typeof v === 'object' ? JSON.stringify(v).slice(0, 160) : String(v));
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (HIDDEN_KEYS.test(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (!HIDDEN_KEYS.test(k2)) out.push([`${word(k)} · ${word(k2).toLowerCase()}`, text(v2)]);
      }
    } else {
      out.push([word(k), text(v)]);
    }
  }
  return out.slice(0, 40);
}

/** The change itself, so a checker never approves blind (owner's new-hire run). */
function WhatChanges({ payload }: { payload?: Record<string, unknown> | null }) {
  const lines = changeLines(payload);
  if (lines.length === 0) return null;
  return (
    <section aria-label="What changes">
      <h3 className="ops-subhead">What changes</h3>
      <dl className="ops-kv">
        {lines.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="sg-num">{v}</dd></div>)}
      </dl>
    </section>
  );
}
