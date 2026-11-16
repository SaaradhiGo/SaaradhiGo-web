'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { PageLink } from '@/components/console/PageLink';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  CATEGORY_LABEL, DEFAULT_SAFETY_FILTERS, SEVERITY_LABEL, SIGNAL_LABEL, STATUS_LABEL, TAB_KEYS,
  TAB_LABEL, ackState, ackText, activeSafetyFilterCount, canEditSafetyConfig, elapsed,
  canRespond, filtersFor, incidentsApiPath, minutesBetween, safetyFiltersFromSearch, safetyFiltersToQuery, signalSummary,
  signalsApiPath, tabCount, type IncidentPage, type IncidentRow, type SafetyFilters,
  type Signal, type SignalPage,
} from '@/lib/safety';
import { ButtonLink } from '@/components/sg/Button';
import { SeverityPill } from '@/components/console/safety/SeverityPill';
import { NewIncidentDrawer } from '@/components/console/safety/NewIncidentDrawer';
import { Drawer, Pill, Skeleton } from '@/components/console/ui';
import { ListPage, type FilterChip, type ListColumn } from '@/components/console/kit/ListPage';
import { RecordPanel } from '@/components/console/kit/RecordPanel';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { MoreFilters, RecordFacts } from '@/components/console/kit/ListBits';
import { SosActions } from '@/components/console/safety/SosActions';
import { SafetyBoard } from '@/components/console/safety/SafetyBoard';

/**
 * Safety: the live queue.
 *
 * Meant to be left open on a second monitor. SOS comes first, then severity,
 * then the oldest, because that is the order an operator should answer in;
 * the server sorts it and this page does not reorder it. It polls (the same
 * 15 seconds the SOS board always did) and keeps the last list that loaded
 * if a poll fails.
 *
 * THE TIMER IS THE COUNTRY'S. "Unacknowledged 3 min · 4 min left" reads the
 * incident's country configuration; a country with none says "no timer
 * configured" and shows no deadline. Severity is a word and a shape, never a
 * colour alone. Contact details never appear here: the incident page holds
 * the logged reveal.
 */
const POLL_MS = 15_000;
const TICK_MS = 30_000;

function SafetyInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const query = search.toString();
  const filters = useMemo(() => safetyFiltersFromSearch(new URLSearchParams(query)), [query]);

  const [page, setPage] = useState<IncidentPage | null>(null);
  const [signals, setSignals] = useState<SignalPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SafetyFilters>(filters);
  const [now, setNow] = useState(() => Date.now());
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dismissing, setDismissing] = useState<Signal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => setDraft(filters), [filters]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (first.current) { setPage(null); setSignals(null); }
    try {
      const scoped = (path: string) => (filters.scope ? path : withScope(path));
      if (filters.tab === 'signals') {
        const [s, counts] = await Promise.all([
          api.get<SignalPage>(scoped(signalsApiPath(filters))),
          api.get<IncidentPage>(scoped(incidentsApiPath({ ...filters, tab: 'incidents' }).replace('limit=100', 'limit=1'))),
        ]);
        setSignals(s);
        setPage(counts);
      } else {
        setPage(await api.get<IncidentPage>(scoped(incidentsApiPath(filters))));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the safety queue.');
      if (first.current) {
        setPage({ count: 0, limit: 0, offset: 0, counts: {}, timers: {}, results: [] });
        setSignals({ count: 0, results: [] });
      }
    } finally {
      first.current = false;
    }
  }, [filters]);

  useEffect(() => {
    first.current = true;
    void load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const go = (next: SafetyFilters) => {
    const q = safetyFiltersToQuery(next);
    router.push(q ? `/ops/safety-ops?${q}` : '/ops/safety-ops');
  };

  const counts = page?.counts;
  const timers = page?.timers;
  const rows = page?.results ?? [];
  const active = activeSafetyFilterCount(filters);
  const countries = Object.keys(timers ?? {});
  const mayRespond = canRespond(access);
  const applies = filtersFor(filters.tab);

  const clockText = (r: IncidentRow) => {
    if (filters.tab === 'closed') return r.outcome ? r.outcome.replace(/_/g, ' ') : '—';
    const ack = ackState(r, timers, now);
    if (ack.kind === 'none') {
      return r.sos.active
        ? <span>SOS acknowledged · raised {elapsed(minutesBetween(r.sos.oldest_active_at, now))} ago</span>
        : <span>Open {elapsed(minutesBetween(r.opened_at, now))}</span>;
    }
    return (
      <span className={ack.kind === 'overdue' ? 'ops-late' : undefined}>
        {ack.kind === 'overdue' ? <b>Overdue · </b> : null}{ackText(ack, r.country)}
      </span>
    );
  };

  const columns: ListColumn<IncidentRow>[] = [
    {
      key: 'id', label: 'Incident', primary: true,
      render: (r) => (
        <>
          <Link href={`/ops/safety-ops/incidents/${r.id}`} className="sg-num">{r.ref}</Link>{' '}
          <span title={r.title}>{r.title || CATEGORY_LABEL[r.category] || r.category}</span>
          {r.rider_reports_false_alarm ? <>{' '}<Pill tone="wait">Rider reports false alarm</Pill></> : null}
        </>
      ),
    },
    { key: 'severity', label: 'Severity', width: '7rem', render: (r) => <SeverityPill severity={r.severity} /> },
    {
      key: 'clock', label: filters.tab === 'closed' ? 'Outcome' : 'Clock', width: '17rem',
      render: clockText,
    },
    {
      key: 'assignee', label: 'Assignee', width: '8rem',
      render: (r) => (r.assignee ? r.assignee.label : <span className="muted">Unassigned</span>),
    },
    {
      key: 'city', label: 'City', width: '7.5rem',
      render: (r) => r.anchor.node_name ?? <span className="muted">Not placed</span>,
    },
    {
      key: 'status', label: 'Status', width: '8rem',
      render: (r) => <Pill tone={r.status === 'closed' ? 'good' : r.status === 'open' ? 'bad' : 'wait'}>{STATUS_LABEL[r.status]}</Pill>,
    },
    {
      // Closed cases come newest-closed first, so that tab shows the closing time.
      key: 'opened', label: filters.tab === 'closed' ? 'Closed' : 'Opened', width: '9rem', num: true,
      render: (r) => stamp(filters.tab === 'closed' ? (r.closed_at ?? r.opened_at) : r.opened_at,
        r.anchor.timezone ?? timeZoneFor(r.anchor.node)),
    },
    ...(filters.tab !== 'closed' ? [{
      key: 'act', label: mayRespond ? 'Respond' : 'Open', width: mayRespond ? '24rem' : '7rem',
      render: (r: IncidentRow) => (mayRespond
        ? <SosActions item={r} meId={access?.id} compact onDone={(m) => { setNotice(m); void load(); }} />
        : <Link href={`/ops/safety-ops/incidents/${r.id}`}>Open</Link>),
    }] : []),
  ];

  const signalColumns: ListColumn<Signal>[] = [
    { key: 'kind', label: 'Signal', width: '9rem', render: (s) => <Pill tone="wait">{SIGNAL_LABEL[s.kind] ?? s.kind}</Pill> },
    { key: 'trip', label: 'Trip', width: '7rem', render: (s) => <PageLink page="trips" href={`/ops/trips/${s.trip_id}`}>T-{s.trip_id}</PageLink> },
    { key: 'what', label: 'Measured', render: (s) => signalSummary(s) },
    { key: 'city', label: 'City', width: '8rem', render: (s) => s.anchor.node_name ?? <span className="muted">Not placed</span> },
    {
      key: 'inc', label: 'Incident', width: '10rem',
      render: (s) => (s.incident_id
        ? <Link href={`/ops/safety-ops/incidents/${s.incident_id}`}>Open case</Link>
        : <span className="muted">Waiting for review</span>),
    },
    {
      key: 'seen', label: 'First seen', width: '10rem', num: true,
      render: (s) => stamp(s.created_at, timeZoneFor(s.anchor.node)),
    },
    // Dismissing a signal is a write (safety.respond): not drawn for a caller who may only look.
    ...(mayRespond ? [{
      key: 'dismiss', label: 'Review', width: '8rem',
      render: (s: Signal) => (
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setDismissing(s)}>Dismiss</button>
      ),
    }] : []),
  ];

  const total = filters.tab === 'signals' ? signals?.count ?? null : page?.count ?? null;
  const loading = filters.tab === 'signals' ? signals === null : page === null;
  const empty = filters.tab === 'signals' ? (signals?.results.length ?? 0) === 0 : rows.length === 0;
  const shown = filters.tab === 'signals' ? signals?.results.length ?? 0 : rows.length;
  const summary = total === null ? null
    : `${total} ${filters.tab === 'signals' ? 'signal' : 'incident'}${total === 1 ? '' : 's'}${total > shown ? ` (latest ${shown} shown)` : ''} · refreshing every ${POLL_MS / 1000}s`;

  const emptyDetail: Record<string, string> = {
    sos: 'No active SOS. One raised during a trip appears here within a few seconds.',
    incidents: 'Nothing is open.',
    signals: 'No signals to review. Long stops, overruns and route deviations that need a look appear here.',
    closed: 'Closed incidents appear here with their outcome.',
  };

  const chipFor = (key: string, label: string, patch: Partial<SafetyFilters>): FilterChip => (
    { key, label, onRemove: () => go({ ...filters, ...patch }) });
  const chips: FilterChip[] = [];
  if (filters.q) chips.push(chipFor('q', `Find: ${filters.q}`, { q: '' }));
  if (filters.severity) chips.push(chipFor('severity', `Severity: ${(SEVERITY_LABEL as Record<string, string>)[filters.severity] ?? filters.severity}`, { severity: '' }));
  if (filters.category) chips.push(chipFor('category', `Category: ${(CATEGORY_LABEL as Record<string, string>)[filters.category] ?? filters.category}`, { category: '' }));
  if (filters.assigned) chips.push(chipFor('assigned', filters.assigned === 'me' ? 'Assigned to me' : 'Unassigned', { assigned: '' }));
  if (filters.country) chips.push(chipFor('country', `Country: ${filters.country}`, { country: '' }));

  const filterForm = (
    <MoreFilters count={active}>
      <form className="ops-form" aria-label="Filter incidents" onSubmit={(e) => { e.preventDefault(); go({ ...draft }); }}>
        <div className="ops-form__row">
          {/* Only the filters that apply to this tab: Signals is filtered by country alone. */}
          {applies.includes('q') ? (
            <>
              <label className="ops-form__label" htmlFor="sf-q">Find</label>
              <input id="sf-q" className="ops-select" value={draft.q} placeholder="Incident or trip number"
                onChange={(e) => setDraft({ ...draft, q: e.target.value })} size={22} />
            </>
          ) : null}
          {applies.includes('severity') ? (
            <>
              <label className="ops-form__label" htmlFor="sf-sev">Severity</label>
              <select id="sf-sev" className="ops-select" value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })}>
                <option value="">Any</option>
                {Object.entries(SEVERITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </>
          ) : null}
          {applies.includes('category') ? (
            <>
              <label className="ops-form__label" htmlFor="sf-cat">Category</label>
              <select id="sf-cat" className="ops-select" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                <option value="">Any</option>
                {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </>
          ) : null}
          {applies.includes('assigned') ? (
            <>
              <label className="ops-form__label" htmlFor="sf-asg">Assignee</label>
              <select id="sf-asg" className="ops-select" value={draft.assigned}
                onChange={(e) => setDraft({ ...draft, assigned: e.target.value as SafetyFilters['assigned'] })}>
                <option value="">Anyone</option>
                <option value="me">Me</option>
                <option value="none">Unassigned</option>
              </select>
            </>
          ) : null}
          {applies.includes('country') && countries.length > 1 ? (
            <>
              <label className="ops-form__label" htmlFor="sf-country">Country</label>
              <select id="sf-country" className="ops-select" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })}>
                <option value="">Any</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </>
          ) : null}
          <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm">Show</button>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={active === 0}
            onClick={() => go({ ...DEFAULT_SAFETY_FILTERS, tab: filters.tab })}>Clear</button>
        </div>
      </form>
    </MoreFilters>
  );

  const listError = error && empty && !loading
    ? `${error} This is not the same as there being nothing.`
    : null;
  const selectedRow = selectedId === null ? null : rows.find((r) => r.id === selectedId) ?? null;
  // One list component for both kinds of row: it is never remounted by a poll, only given new rows.
  const common = {
    pageKey: 'safety', title: 'Safety', summary,
    views: TAB_KEYS.map((t) => ({ key: t, label: TAB_LABEL[t], count: tabCount(t, counts) ?? null })),
    view: filters.tab, onView: (tab: string) => go({ ...filters, tab: tab as SafetyFilters['tab'] }),
    chips, filterSlot: filterForm,
    actionsSlot: (
      <>
        {mayRespond ? (
          <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setCreating(true)}>Open an incident</button>
        ) : null}
        <ButtonLink href="/ops/safety-ops/config" variant="ghost" size="sm">
          {canEditSafetyConfig(access) ? 'Safety settings' : 'Safety settings (read only)'}
        </ButtonLink>
      </>
    ),
    page: 1, pageSize: Math.max(shown, 1), onPage: () => undefined,
    loading, error: listError, empty: emptyDetail[filters.tab],
  };

  return (
    <>
      {notice && <div className="alert-success mb-4" role="status">{notice}</div>}
      {error && !empty && !loading ? (
        <div className="alert-error mb-4" role="alert">{error} Showing the last list that loaded.</div>
      ) : null}
      <div className={selectedRow && filters.tab !== 'signals' ? 'ops-split' : undefined}>
        {filters.tab === 'signals' ? (
          <ListPage<Signal> {...common} columns={signalColumns} rows={signals?.results ?? []} rowKey={(s) => s.id}
            total={signals?.results.length ?? null} />
        ) : (
          <ListPage<IncidentRow> {...common} columns={columns} rows={rows} rowKey={(r) => r.id}
            total={page ? rows.length : null} onRow={(r) => setSelectedId(r.id)} activeKey={selectedId} />
        )}
        {selectedRow && filters.tab !== 'signals' ? (
          <RecordPanel
            label="Incident"
            title={selectedRow.title || CATEGORY_LABEL[selectedRow.category] || selectedRow.category}
            refId={selectedRow.ref}
            subtitle={selectedRow.anchor.node_name ?? 'Not placed'}
            status={<><SeverityPill severity={selectedRow.severity} /> <StatusChip tone={selectedRow.status === 'closed' ? 'good' : selectedRow.status === 'open' ? 'critical' : 'info'}>{STATUS_LABEL[selectedRow.status]}</StatusChip></>}
            actions={<ButtonLink href={`/ops/safety-ops/incidents/${selectedRow.id}`} variant="secondary" size="sm">Open the full case</ButtonLink>}
            onClose={() => setSelectedId(null)}
            tabs={[{ key: 'overview', label: 'Overview', content: (
              <RecordFacts rows={[
                ['Clock', clockText(selectedRow)],
                ['Assignee', selectedRow.assignee ? selectedRow.assignee.label : 'Unassigned'],
                ['Opened', stamp(selectedRow.opened_at, selectedRow.anchor.timezone ?? timeZoneFor(selectedRow.anchor.node))],
                selectedRow.outcome ? ['Outcome', selectedRow.outcome.replace(/_/g, ' ')] : false,
                selectedRow.sos.active ? ['Active SOS', String(selectedRow.sos.active)] : false,
              ]} />
            ) }]}
          />
        ) : null}
      </div>

      {creating && (
        <NewIncidentDrawer
          onClose={() => setCreating(false)}
          onCreated={(id, created) => {
            setCreating(false);
            setNotice(created ? `INC-${id} opened.` : `That trip already has an open case: ${id}.`);
            router.push(`/ops/safety-ops/incidents/${id}`);
          }}
        />
      )}
      {dismissing && (
        <DismissDrawer
          signal={dismissing} onClose={() => setDismissing(null)}
          onDone={(m) => { setDismissing(null); setNotice(m); void load(); }}
        />
      )}
    </>
  );
}

function DismissDrawer({ signal, onClose, onDone }: {
  signal: Signal; onClose: () => void; onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/safety/admin/signals/${signal.id}/dismiss/`, { reason: reason.trim() });
      onDone(`${SIGNAL_LABEL[signal.kind] ?? 'Signal'} on T-${signal.trip_id} dismissed.`);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      title={`Dismiss ${SIGNAL_LABEL[signal.kind] ?? 'signal'} · T-${signal.trip_id}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || reason.trim() === ''} onClick={() => void submit()}>
            {busy ? 'Working…' : 'Dismiss signal'}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        <div className="ops-confirm">
          <b>{signalSummary(signal)}</b>
          <span>Say why this is nothing to worry about. It is recorded with your name, and the same signal is not raised again for this trip.</span>
        </div>
        <label className="ops-form__label" htmlFor="dismiss-reason">Reason (required)</label>
        <textarea id="dismiss-reason" className="input" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}

/** The board (design board F) unless a list tab was asked for (?tab=incidents|closed|signals|sos). */
function SafetyRoute() {
  const search = useSearchParams();
  const access = useAdminAccess();
  return search.get('tab') ? <SafetyInner /> : <SafetyBoard access={access} />;
}

export default function SafetyPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <SafetyRoute />
    </Suspense>
  );
}
