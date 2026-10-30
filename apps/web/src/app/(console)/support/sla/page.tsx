'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { stamp } from '@/lib/consoleTime';
import {
  type CountryConfig, type PendingChange, PRIORITY_LABEL, configSentence, formatMinutes,
  pendingFor, pendingSummary, priorityTone,
} from '@/lib/supportDesk';
import { ButtonLink } from '@/components/sg/Button';
import {
  Column, DataTable, Drawer, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * The SLA policy: how long a ticket may wait for its first reply and for
 * resolution, per country and priority, plus each country's support settings
 * (reminder and auto-close for tickets waiting on the user, and the refund
 * review time the rider is told).
 *
 * Everyone who reads tickets can read this page. CHANGING A VALUE IS A
 * REQUEST: the form sends it for a second person to approve (the server
 * answers 202 and nothing changes yet), and the page lists every change still
 * waiting. Only countries you hold support.sla for have an Edit button; the
 * server checks again. A change applies to tickets opened from then on, and
 * to any whose priority is changed afterwards; it does not move deadlines
 * already set. Waiting on the user pauses only the resolution clock.
 *
 * A country with no settings row says "Not configured": there is no default
 * and no fallback to another country.
 */
type Row = {
  country: string; priority: string; first_response_minutes: number; resolution_minutes: number;
  source: 'policy' | 'default'; updated_at: string | null; updated_by?: { label?: string } | null;
};

type SlaData = {
  results: Row[];
  config: CountryConfig[];
  pending: PendingChange[];
  may_edit: boolean;
  editable_countries: string[];
};

type Editing =
  | { kind: 'policy'; row: Row }
  | { kind: 'config'; config: CountryConfig };

const COUNTRY: Record<string, string> = { IN: 'India', US: 'United States' };

const failure = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.fromServer ? err.message : fallback;

export default function SlaPage() {
  const [data, setData] = useState<SlaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      const r = await api.get<SlaData>('/support/admin/sla/');
      setData({
        results: r.results ?? [], config: r.config ?? [], pending: r.pending ?? [],
        may_edit: Boolean(r.may_edit), editable_countries: r.editable_countries ?? [],
      });
    } catch (err) {
      setError(failure(err, 'We could not load the SLA policy.'));
      setData({ results: [], config: [], pending: [], may_edit: false, editable_countries: [] });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const editable = (country: string) => data?.editable_countries.includes(country) ?? false;
  const pending = data?.pending ?? [];

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
    ...(data?.may_edit ? [{
      key: 'edit', label: 'Change', width: '11rem',
      render: (r: Row) => {
        if (pendingFor(pending, r.country, r.priority)) return <Pill tone="wait">Change pending</Pill>;
        if (!editable(r.country)) return <span className="muted">Not in your scope</span>;
        return (
          <button type="button" className="ops-linkbtn" onClick={() => setEditing({ kind: 'policy', row: r })}>
            Request change<span className="sr-only"> {COUNTRY[r.country] ?? r.country} {PRIORITY_LABEL[r.priority]}</span>
          </button>
        );
      },
    }] : []),
  ];

  const configColumns: Column<CountryConfig>[] = [
    { key: 'country', label: 'Country', width: '10rem', render: (c) => COUNTRY[c.country] ?? c.country },
    {
      key: 'state', label: 'Settings',
      render: (c) => (c.configured ? configSentence(c) : <Pill>Not configured</Pill>),
    },
    ...(data?.may_edit ? [{
      key: 'edit', label: 'Change', width: '11rem',
      render: (c: CountryConfig) => {
        if (pendingFor(pending, c.country, null)) return <Pill tone="wait">Change pending</Pill>;
        if (!editable(c.country)) return <span className="muted">Not in your scope</span>;
        return (
          <button type="button" className="ops-linkbtn" onClick={() => setEditing({ kind: 'config', config: c })}>
            Request change<span className="sr-only"> {COUNTRY[c.country] ?? c.country} settings</span>
          </button>
        );
      },
    }] : []),
  ];

  const pendingColumns: Column<PendingChange>[] = [
    { key: 'country', label: 'Country', width: '9rem', render: (p) => COUNTRY[p.country] ?? p.country },
    { key: 'what', label: 'Asked for', render: (p) => pendingSummary(p) },
    { key: 'who', label: 'Asked by', width: '10rem', render: (p) => p.maker_label || `Operator #${p.maker_id}` },
    { key: 'when', label: 'Asked', width: '10rem', num: true, hideBelow: 1100, render: (p) => stamp(p.requested_at) },
    {
      key: 'state', label: 'State', width: '9rem',
      render: () => <Pill tone="wait">Waiting for a checker</Pill>,
    },
  ];

  return (
    <>
      <PageHeader
        title="SLA policy"
        subtitle="Minutes from the moment a ticket is opened. Waiting on the user pauses only the resolution clock."
        actions={<ButtonLink href="/support" variant="ghost" size="sm">All tickets</ButtonLink>}
      />
      {notice && <div className="alert-success mb-5" role="status"><b>{notice}</b></div>}
      {data && !data.may_edit ? (
        <p className="help">This page is read only. Asking for a change needs the support.sla permission.</p>
      ) : (
        <p className="help">A change is a request: a second person approves it before it applies.</p>
      )}

      {pending.length > 0 ? (
        <Panel title="Changes waiting for approval" flush>
          <DataTable caption="Pending SLA changes" rows={pending} columns={pendingColumns} rowKey={(p) => p.id} density="comfortable" maxHeight={false} />
        </Panel>
      ) : null}

      <Panel title="Response and resolution times" flush>
        {data === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the SLA policy</span>
            <Skeleton kind="row" count={8} />
          </div>
        ) : error ? (
          <div className="p-4"><ErrorState title="The policy could not be loaded" detail={error} onRetry={() => void load()} /></div>
        ) : data.results.length === 0 ? (
          <Empty title="No policy rows" detail="The platform defaults apply." />
        ) : (
          <DataTable caption="SLA policy" rows={data.results} columns={columns} rowKey={(r) => `${r.country}:${r.priority}`} density="comfortable" maxHeight={false} />
        )}
      </Panel>

      {data && !error ? (
        <Panel title="Country settings" flush>
          <DataTable caption="Support settings by country" rows={data.config} columns={configColumns} rowKey={(c) => c.country} density="comfortable" maxHeight={false} />
        </Panel>
      ) : null}

      {editing ? (
        <EditDrawer
          editing={editing}
          onClose={() => setEditing(null)}
          onDone={(text) => { setEditing(null); setNotice(text); void load(); }}
        />
      ) : null}
    </>
  );
}

const SENT = 'Sent for approval. Nothing changes until a second person approves it.';

function EditDrawer({ editing, onClose, onDone }: { editing: Editing; onClose: () => void; onDone: (text: string) => void }) {
  const isPolicy = editing.kind === 'policy';
  const row = isPolicy ? editing.row : null;
  const config = !isPolicy ? editing.config : null;
  const country = row?.country ?? config?.country ?? '';

  const [first, setFirst] = useState(String(row?.first_response_minutes ?? ''));
  const [resolve, setResolve] = useState(String(row?.resolution_minutes ?? ''));
  const [reminder, setReminder] = useState(String(config?.waiting_reminder_days ?? ''));
  const [autoclose, setAutoclose] = useState(String(config?.waiting_autoclose_days ?? ''));
  const [hours, setHours] = useState(String(config?.refund_review_hours ?? ''));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const whole = (v: string) => /^\d+$/.test(v);
  const f = Number(first);
  const r = Number(resolve);
  const policyValid = whole(first) && whole(resolve) && f >= 1 && r >= f;
  const rd = Number(reminder);
  const ac = Number(autoclose);
  const rh = Number(hours);
  const configValid = whole(reminder) && whole(autoclose) && whole(hours)
    && rd >= 1 && ac > rd && rh >= 1 && rh <= 1440;
  const valid = isPolicy ? policyValid : configValid;

  async function save() {
    setBusy(true); setError(null);
    try {
      const out = isPolicy
        ? await api.put<{ changed?: boolean; state?: string }>(
          `/support/admin/sla/${row!.country}/${row!.priority}/`,
          { first_response_minutes: f, resolution_minutes: r, reason },
        )
        : await api.put<{ changed?: boolean; state?: string }>(
          `/support/admin/sla/config/${country}/`,
          { waiting_reminder_days: rd, waiting_autoclose_days: ac, refund_review_hours: rh, reason },
        );
      onDone(out?.changed === false ? 'Nothing changed: those were already the values.' : SENT);
    } catch (err) {
      setError(failure(err, 'The request was not sent.'));
    } finally {
      setBusy(false);
    }
  }

  const title = isPolicy
    ? `${COUNTRY[country] ?? country} · ${PRIORITY_LABEL[row!.priority] ?? row!.priority}`
    : `${COUNTRY[country] ?? country} · country settings`;

  return (
    <Drawer
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void save()} disabled={busy || !valid}>
            {busy ? 'Sending…' : 'Send for approval'}
          </button>
        </>
      }
    >
      <div className="ops-form">
        {isPolicy ? (
          <>
            <label className="ops-form__label" htmlFor="sla-first">First reply within (minutes)</label>
            <input id="sla-first" className="input" inputMode="numeric" value={first} onChange={(e) => setFirst(e.target.value)} />
            <label className="ops-form__label" htmlFor="sla-resolve">Resolved within (minutes)</label>
            <input id="sla-resolve" className="input" inputMode="numeric" value={resolve} onChange={(e) => setResolve(e.target.value)} />
            {policyValid ? <p className="help m-0">That is {formatMinutes(f)} for the first reply and {formatMinutes(r)} to resolve.</p> : (
              <p className="help m-0">Whole minutes, at least 1, and resolution no shorter than the first reply.</p>
            )}
          </>
        ) : (
          <>
            <label className="ops-form__label" htmlFor="cfg-reminder">Remind a waiting user after (days)</label>
            <input id="cfg-reminder" className="input" inputMode="numeric" value={reminder} onChange={(e) => setReminder(e.target.value)} />
            <label className="ops-form__label" htmlFor="cfg-close">Close a ticket still waiting after (days)</label>
            <input id="cfg-close" className="input" inputMode="numeric" value={autoclose} onChange={(e) => setAutoclose(e.target.value)} />
            <label className="ops-form__label" htmlFor="cfg-hours">Tell riders a refund is reviewed within (hours)</label>
            <input id="cfg-hours" className="input" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
            <p className="help m-0">
              Whole numbers. Auto-close must come after the reminder. The rider sees
              {' '}{configValid && rh >= 48 ? `${Math.ceil(rh / 24)} days` : configValid ? `${rh} hour${rh === 1 ? '' : 's'}` : 'the time you give'}.
              Safety tickets are never reminded or closed.
            </p>
          </>
        )}
        <label className="ops-form__label" htmlFor="sla-reason">Reason (kept in the audit trail)</label>
        <textarea id="sla-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="ops-confirm">
          <b>Needs a second person</b>
          <span>This sends a request. Nothing changes until someone else approves it, and then it applies from that moment on.</span>
        </div>
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
