'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import { PRIORITY_LABEL, canEditSla, formatMinutes, priorityTone } from '@/lib/supportDesk';
import { ButtonLink } from '@/components/sg/Button';
import {
  Column, DataTable, Drawer, ErrorState, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * The SLA policy: how long a ticket may wait for its first reply and for
 * resolution, per country and priority.
 *
 * Everyone who reads tickets can read this table. Changing a row needs
 * `support.sla` (Super Admin by default) and is audited with the old and
 * new minutes. A change applies to tickets opened from then on, and to any
 * ticket whose priority is changed afterwards; it does not move deadlines
 * already set. The clock does not pause while a ticket waits on the user.
 */
type Row = {
  country: string; priority: string; first_response_minutes: number; resolution_minutes: number;
  source: 'policy' | 'default'; updated_at: string | null; updated_by?: { label?: string } | null;
};

const COUNTRY: Record<string, string> = { IN: 'India', US: 'United States' };

const failure = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.fromServer ? err.message : fallback;

export default function SlaPage() {
  const access = useAdminAccess();
  const may = canEditSla(access);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const r = await api.get<{ results: Row[] }>('/support/admin/sla/');
      setRows(r.results ?? []);
    } catch (err) {
      setError(failure(err, 'We could not load the SLA policy.'));
      setRows([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<Row>[] = [
    { key: 'country', label: 'Country', width: '10rem', render: (r) => COUNTRY[r.country] ?? r.country },
    {
      key: 'priority', label: 'Priority', width: '8rem',
      render: (r) => <Pill tone={priorityTone(r.priority)}>{PRIORITY_LABEL[r.priority] ?? r.priority}</Pill>,
    },
    { key: 'first', label: 'First reply within', width: '11rem', num: true, render: (r) => formatMinutes(r.first_response_minutes) },
    { key: 'resolve', label: 'Resolved within', width: '11rem', num: true, render: (r) => formatMinutes(r.resolution_minutes) },
    {
      key: 'source', label: 'Source', width: '10rem',
      render: (r) => (r.source === 'policy' ? 'Set in the console' : <span className="muted">Platform default</span>),
    },
    {
      key: 'updated', label: 'Last changed', num: true, hideBelow: 1100,
      render: (r) => (r.updated_at ? `${stamp(r.updated_at)}${r.updated_by?.label ? ` · ${r.updated_by.label}` : ''}` : <span className="muted">—</span>),
    },
    ...(may ? [{
      key: 'edit', label: 'Change', width: '7rem',
      render: (r: Row) => (
        <button type="button" className="ops-linkbtn" onClick={() => setEditing(r)}>
          Edit<span className="sr-only"> {COUNTRY[r.country] ?? r.country} {PRIORITY_LABEL[r.priority]}</span>
        </button>
      ),
    }] : []),
  ];

  return (
    <>
      <PageHeader
        title="SLA policy"
        subtitle="Minutes from the moment a ticket is opened. The clock does not pause while a ticket waits on the user."
        actions={<ButtonLink href="/support" variant="ghost" size="sm">All tickets</ButtonLink>}
      />
      {notice && <div className="alert-success mb-5" role="status"><b>{notice}</b></div>}
      {!may ? <p className="help">This table is read only. Changing it needs the support.sla permission.</p> : null}

      <Panel flush>
        {rows === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the SLA policy</span>
            <Skeleton kind="row" count={8} />
          </div>
        ) : error ? (
          <div className="p-4"><ErrorState title="The policy could not be loaded" detail={error} onRetry={() => void load()} /></div>
        ) : (
          <DataTable caption="SLA policy" rows={rows} columns={columns} rowKey={(r) => `${r.country}:${r.priority}`} density="comfortable" />
        )}
      </Panel>

      {editing ? (
        <EditDrawer
          row={editing}
          onClose={() => setEditing(null)}
          onDone={(text) => { setEditing(null); setNotice(text); void load(); }}
        />
      ) : null}
    </>
  );
}

function EditDrawer({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: (text: string) => void }) {
  const [first, setFirst] = useState(String(row.first_response_minutes));
  const [resolve, setResolve] = useState(String(row.resolution_minutes));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const f = Number(first);
  const r = Number(resolve);
  const valid = /^\d+$/.test(first) && /^\d+$/.test(resolve) && f >= 1 && r >= f;

  async function save() {
    setBusy(true); setError(null);
    try {
      const out = await api.put<{ changed?: boolean }>(
        `/support/admin/sla/${row.country}/${row.priority}/`,
        { first_response_minutes: f, resolution_minutes: r, reason },
      );
      onDone(out?.changed === false ? 'Nothing changed: those were already the minutes.' : 'SLA policy saved. It applies to tickets opened from now on.');
    } catch (err) {
      setError(failure(err, 'The policy was not saved.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      title={`${COUNTRY[row.country] ?? row.country} · ${PRIORITY_LABEL[row.priority] ?? row.priority}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void save()} disabled={busy || !valid}>
            {busy ? 'Saving…' : 'Save policy'}
          </button>
        </>
      }
    >
      <div className="ops-form">
        <label className="ops-form__label" htmlFor="sla-first">First reply within (minutes)</label>
        <input id="sla-first" className="input" inputMode="numeric" value={first} onChange={(e) => setFirst(e.target.value)} />
        <label className="ops-form__label" htmlFor="sla-resolve">Resolved within (minutes)</label>
        <input id="sla-resolve" className="input" inputMode="numeric" value={resolve} onChange={(e) => setResolve(e.target.value)} />
        {valid ? <p className="help m-0">That is {formatMinutes(f)} for the first reply and {formatMinutes(r)} to resolve.</p> : (
          <p className="help m-0">Whole minutes, at least 1, and resolution no shorter than the first reply.</p>
        )}
        <label className="ops-form__label" htmlFor="sla-reason">Reason (kept in the audit trail)</label>
        <textarea id="sla-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="ops-confirm">
          <b>Applies from now on</b>
          <span>Tickets already open keep the deadlines they were given, until their priority is changed.</span>
        </div>
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
