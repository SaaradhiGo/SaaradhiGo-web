'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiError, api } from '@/lib/api';
import { canAny, useAdminAccess } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { stamp } from '@/lib/consoleTime';
import { messageOf } from '@/components/console/notifications';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { History, RecordPanel, type HistoryEntry } from '@/components/console/kit/RecordPanel';
import { StatusChip, type ChipTone } from '@/components/console/kit/StatusChip';
import { ActionNotice, RecordFacts, RecordFailed, RecordLoading, RecordSection } from '@/components/console/kit/ListBits';

/** Data requests: a person's export or erasure request, logged and answered within the due window. */
type Row = {
  id: number; ref: string; kind: 'export' | 'erasure'; kind_label: string; subject_id: number; subject_ref: string;
  subject_role: string; subject_name: string; subject_phone: string; country: string; channel: string; channel_label: string;
  reference: string; note: string; status: 'open' | 'waiting_approval' | 'completed' | 'refused'; status_label: string;
  received_at: string; due_at: string; closed_at: string | null; overdue: boolean; outcome: string;
  approval_request_id: number | null; created_by: string | null; handled_by: string | null;
};
type Detail = Row & { history: { id: number; action: string; actor: string | null; reason: string; at: string }[] };
type List = { count: number; results: Row[]; open: number; overdue: number; due_days: number };

const PAGE_SIZE = 25;
const VIEWS = [{ key: 'open', label: 'Open' }, { key: 'closed', label: 'Closed' }, { key: 'all', label: 'All' }];
const CHANNELS = [{ value: 'email', label: 'Email' }, { value: 'ticket', label: 'Support ticket' }, { value: 'other', label: 'Other' }];
const TONES: Record<Row['status'], ChipTone> = { open: 'info', waiting_approval: 'caution', completed: 'good', refused: 'neutral' };

function statusOf(r: Row) {
  return (
    <>
      <StatusChip tone={TONES[r.status] ?? 'neutral'}>{r.status_label}</StatusChip>
      {r.overdue ? <> <StatusChip tone="critical">Overdue</StatusChip></> : null}
    </>
  );
}

function personLink(r: Row) {
  const n = r.subject_ref.replace(/^D-/, '');
  const href = r.subject_ref.startsWith('D-') ? `/drivers/${n}` : `/riders/${r.subject_id}`;
  return <Link href={href} className="sg-link">{r.subject_ref}</Link>;
}

/** Hands the export to the browser as a file; the data is not kept anywhere else. */
function saveJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function LogForm({ onDone }: { onDone: (text: string) => void }) {
  const [subject, setSubject] = useState('');
  const [kind, setKind] = useState('export');
  const [channel, setChannel] = useState('email');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.post<Row>('/auth/admin/data-requests/', {
        subject: subject.trim(), kind, channel, reference: reference.trim(), ...(note.trim() ? { note: note.trim() } : {}),
      });
      onDone(`Logged ${r.ref}.`);
    } catch (err) {
      setError(messageOf(err, 'The request could not be logged.'));
    } finally { setBusy(false); }
  }
  return (
    <form className="ops-form" aria-label="Log a request" onSubmit={send}>
      <div className="ops-form__row">
        <label className="ops-form__label" htmlFor="dr-subject">Person (R-… or D-…)</label>
        <input id="dr-subject" className="ops-select" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        <label className="ops-form__label" htmlFor="dr-kind">Kind</label>
        <select id="dr-kind" className="ops-select" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="export">Data export</option>
          <option value="erasure">Erasure</option>
        </select>
        <label className="ops-form__label" htmlFor="dr-channel">How it arrived</label>
        <select id="dr-channel" className="ops-select" value={channel} onChange={(e) => setChannel(e.target.value)}>
          {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div className="ops-form__row">
        <label className="ops-form__label" htmlFor="dr-ref">Reference</label>
        <input id="dr-ref" className="ops-select" value={reference} onChange={(e) => setReference(e.target.value)} required />
        <label className="ops-form__label" htmlFor="dr-note">Note (optional)</label>
        <input id="dr-note" className="ops-select" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || !subject.trim() || !reference.trim()}>Log request</button>
      </div>
      {error ? <p className="alert-error" role="alert">{error}</p> : null}
    </form>
  );
}

function Reasoned({ label, confirm, help, onRun }: {
  label: string; confirm: string; help?: string; onRun: (reason: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setOpen(true)}>{label}</button>;
  }
  const run = async () => {
    setBusy(true);
    const msg = await onRun(reason.trim());
    setBusy(false);
    if (msg) setError(msg); else { setOpen(false); setReason(''); setError(null); }
  };
  return (
    <div className="ops-form" role="group" aria-label={label}>
      {help ? <p>{help}</p> : null}
      <label className="ops-form__label" htmlFor={`why-${confirm}`}>Reason</label>
      <textarea id={`why-${confirm}`} className="ops-select" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || reason.trim().length < 10} onClick={run}>{confirm}</button>
      <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setOpen(false)}>Cancel</button>
      {error ? <p className="alert-error" role="alert">{error}</p> : null}
    </div>
  );
}

const ERASE_HELP = 'Erasure anonymises the account. Financial records are kept for the legal retention period. '
  + 'It cannot be undone, and a second Super Admin must approve it in Approvals.';

function RequestRecord({ id, onChanged, onClose }: { id: number; onChanged: () => void; onClose: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setFailed(null);
    try { setData(await api.get<Detail>(`/auth/admin/data-requests/${id}/`)); }
    catch (err) { setFailed(messageOf(err, 'This request could not be loaded.')); }
  }, [id]);
  useEffect(() => { setData(null); void load(); }, [load]);
  const changed = () => { void load(); onChanged(); };

  const reasoned = (path: string) => async (reason: string): Promise<string | null> => {
    try {
      await api.post(`/auth/admin/data-requests/${id}/${path}/`, { reason });
      changed();
      return null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) return messageOf(err, 'This request cannot be changed now.');
      return messageOf(err, 'That did not go through.');
    }
  };
  async function download(r: Detail) {
    setError(null);
    try {
      const res = await api.post<{ request: Row; export: unknown }>(`/auth/admin/data-requests/${id}/export/`, {});
      saveJson(`${r.subject_ref}-export-${new Date().toISOString().slice(0, 10)}.json`, res.export);
      changed();
    } catch (err) {
      setError(messageOf(err, 'The export could not be made.'));
    }
  }

  if (failed) return <RecordFailed label="Data request" message={failed} onRetry={() => void load()} onClose={onClose} />;
  if (!data) return <RecordLoading label="Data request" />;
  const history: HistoryEntry[] = data.history.map((h) => ({
    at: stamp(h.at), text: `${h.action}${h.reason ? ` (${h.reason})` : ''}`, who: h.actor,
  }));
  return (
    <RecordPanel label="Data request" title={data.kind_label} refId={data.ref} onClose={onClose} status={statusOf(data)}
      subtitle={`${data.subject_name} · ${data.subject_ref}`}
      tabs={[
        {
          key: 'request', label: 'Request', content: (
            <>
              <RecordFacts rows={[
                ['Person', <>{personLink(data)} · {data.subject_name}</>], ['Phone', data.subject_phone || '—'],
                ['Country', data.country || '—'], ['How it arrived', data.channel_label], ['Reference', data.reference],
                !!data.note && ['Note', data.note], ['Received', stamp(data.received_at)], ['Due', stamp(data.due_at)],
                !!data.closed_at && ['Closed', stamp(data.closed_at)], !!data.outcome && ['Outcome', data.outcome],
                !!data.handled_by && ['Handled by', data.handled_by],
              ]} />
              {data.status === 'waiting_approval' && data.approval_request_id ? (
                <p>Waiting for a second Super Admin: <Link href={`/approvals?id=${data.approval_request_id}`} className="sg-link">open the approval</Link>.</p>
              ) : null}
              {data.status === 'open' ? (
                <RecordSection title="Actions">
                  {data.kind === 'export'
                    ? <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void download(data)}>Download export</button>
                    : <Reasoned label="Ask to erase…" confirm="Ask to erase" help={ERASE_HELP} onRun={reasoned('erase')} />}
                  <Reasoned label="Refuse…" confirm="Refuse" onRun={reasoned('refuse')} />
                  {error ? <p className="alert-error" role="alert">{error}</p> : null}
                </RecordSection>
              ) : null}
            </>
          ),
        },
        { key: 'history', label: 'History', content: <History entries={history} empty="No changes recorded." /> },
      ]} />
  );
}

export default function DataRequestsPage() {
  const access = useAdminAccess();
  const allowed = canAny(access, ['privacy.manage']) && canOpen(access, 'dataRequests');
  const [view, setView] = useState('open');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [counts, setCounts] = useState<{ open: number; overdue: number; due: number } | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [logging, setLogging] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'done'; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    const s = new URLSearchParams({ status: view, page: String(page) });
    if (kind) s.set('kind', kind);
    setLoading(true);
    api.get<List>(`/auth/admin/data-requests/?${s}`)
      .then((r) => {
        setRows(r.results); setTotal(r.count); setCounts({ open: r.open, overdue: r.overdue, due: r.due_days }); setError(null);
      })
      .catch((err) => setError(messageOf(err, 'The data requests could not be loaded.')))
      .finally(() => setLoading(false));
  }, [allowed, view, kind, page, tick]);

  const columns = useMemo<ListColumn<Row>[]>(() => [
    { key: 'request', label: 'Request', primary: true, render: (r) => <span><span className="ops-ref sg-num">{r.ref}</span> {r.kind_label}</span> },
    { key: 'person', label: 'Person', render: (r) => <span>{personLink(r)} {r.subject_name}</span> },
    { key: 'channel', label: 'Channel', render: (r) => r.channel_label },
    { key: 'status', label: 'Status', render: statusOf },
    { key: 'received', label: 'Received', render: (r) => stamp(r.received_at) },
    { key: 'due', label: 'Due', render: (r) => stamp(r.due_at) },
  ], []);

  if (!allowed) return <p className="alert-error" role="alert">Data requests is for Super Admins.</p>;
  return (
    <>
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
      <div className={openId !== null ? 'ops-split' : undefined}>
        <ListPage<Row>
          pageKey="data-requests" title="Data requests"
          summary={counts ? `${counts.open} open · ${counts.overdue} overdue · due within ${counts.due} days` : undefined}
          views={VIEWS} view={view} onView={(v) => { setView(v); setPage(1); }}
          actionsSlot={<button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setLogging((v) => !v)}>Log a request…</button>}
          filterSlot={(
            <>
              <label className="sr-only" htmlFor="dr-filter-kind">Kind</label>
              <select id="dr-filter-kind" className="ops-select" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
                <option value="">Any kind</option>
                <option value="export">Data export</option>
                <option value="erasure">Erasure</option>
              </select>
              {logging ? <LogForm onDone={(text) => { setLogging(false); setNotice({ kind: 'done', text }); setTick((t) => t + 1); }} /> : null}
            </>
          )}
          columns={columns} rows={rows} rowKey={(r) => r.id} total={total} page={page} pageSize={PAGE_SIZE} onPage={setPage}
          onRow={(r) => setOpenId(r.id)} activeKey={openId} loading={loading} error={error} empty="No requests in this view." />
        {openId !== null ? (
          <RequestRecord id={openId} onChanged={() => setTick((t) => t + 1)} onClose={() => setOpenId(null)} />
        ) : null}
      </div>
    </>
  );
}
