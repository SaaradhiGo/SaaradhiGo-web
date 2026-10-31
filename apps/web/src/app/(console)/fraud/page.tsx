'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { useDensity } from '@/lib/consolePrefs';
import {
  KIND_WORDS, SEVERITY_ORDER, SEVERITY_WORDS, ageWords, canReadFraud, evidenceSummary, filtersFromParams,
  queueQuery, type Flag, type Queue, type QueueFilters,
} from '@/lib/fraud';
import { messageOf } from '@/components/console/notifications';
import { FraudNav, NoFraudAccess, SeverityPill, StatusPill } from '@/components/console/fraud/parts';
import {
  DataTable, Empty, ErrorState, PageHeader, Panel, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Fraud & Risk: the review queue.
 *
 * Flags raised by the detection rules (and by a blocked referral reward), worst first and then the
 * ones that have waited longest. A flag names the person by a masked reference and says in words
 * what the rule saw; open one to see the evidence, the linked accounts and the timeline, and to
 * review it. Marketing can read the queue; assigning, dismissing and confirming need fraud.review.
 * Nothing here tells the person they were flagged or moves any money.
 */
const STATUS_OPTIONS = [
  { value: 'active', label: 'Open and in review' }, { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In review' }, { value: 'confirmed', label: 'Confirmed' },
  { value: 'dismissed', label: 'Dismissed' }, { value: '', label: 'Any status' },
];
const AGE_OPTIONS = [
  { value: '', label: 'Any age' }, { value: '24', label: 'Over 24 hours' },
  { value: '48', label: 'Over 48 hours' }, { value: '168', label: 'Over a week' },
];
const KINDS = Object.entries(KIND_WORDS);

function QueueInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const [filters, setFilters] = useState<QueueFilters>(() => filtersFromParams((k) => search.get(k)));
  const [data, setData] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const may = canReadFraud(access);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<Queue>(withScope(`/fraud/admin/flags/?${queueQuery(filters)}`)));
    } catch (err) {
      setData(null);
      setError(messageOf(err, 'The flags could not be loaded.'));
    }
  }, [filters]);
  useEffect(() => { if (may) void load(); }, [load, may]);

  const set = (patch: Partial<QueueFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const rows = data?.results ?? null;
  const severityCounts = data?.facets.severity ?? {};

  const columns = useMemo(() => [
    { key: 'sev', label: 'Severity', width: '7rem', render: (f: Flag) => <SeverityPill severity={f.severity} /> },
    { key: 'flag', label: 'Flag', width: '8rem',
      render: (f: Flag) => <Link href={`/fraud/${f.id}`} className="fr-open"><b>{f.subject.ref}</b><span className="muted"> #{f.id}</span></Link> },
    { key: 'kind', label: 'Kind', width: '11rem', render: (f: Flag) => KIND_WORDS[f.kind] ?? f.kind },
    { key: 'what', label: 'What the rule saw', render: (f: Flag) => <span className="pm-wrap">{evidenceSummary(f)}</span> },
    { key: 'where', label: 'City', width: '9rem', hideBelow: 1100 as const, render: (f: Flag) => f.scope_name ?? 'Unplaced' },
    { key: 'status', label: 'Status', width: '8rem', render: (f: Flag) => <StatusPill status={f.status} /> },
    { key: 'who', label: 'Assigned', width: '9rem', hideBelow: 1280 as const,
      render: (f: Flag) => f.assigned_to ? f.assigned_to.label : <span className="muted">Unassigned</span> },
    { key: 'age', label: 'Waiting', width: '6rem', num: true, render: (f: Flag) => ageWords(f.age_hours) },
  ], []);

  if (!canOpen(access, 'fraud') || !may) {
    return (<><PageHeader title="Fraud & Risk" /><NoFraudAccess /></>);
  }

  const total = Object.values(data?.facets.status ?? {}).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader title="Fraud & Risk"
        subtitle="Flags raised by the detection rules, worst first. Open one to see the evidence and review it. The people are never told." />
      <FraudNav />

      <Panel title="Review queue" flush>
        <div className="fr-sev" role="group" aria-label="Filter by severity">
          <button type="button" className="ops-filter" aria-pressed={filters.severity === ''} onClick={() => set({ severity: '' })}>
            All severities
          </button>
          {SEVERITY_ORDER.map((s) => (
            <button key={s} type="button" className="ops-filter" aria-pressed={filters.severity === s}
              onClick={() => set({ severity: filters.severity === s ? '' : s })}>
              {SEVERITY_WORDS[s]} <span className="sg-num">{severityCounts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <TableToolbar
          summary={data ? `${rows?.length ?? 0} of ${data.count} flag${data.count === 1 ? '' : 's'}${total ? ` · ${total} in your scope` : ''}` : null}
          density={density} onDensity={setDensity}>
          <div className="nf-filters">
            <label className="sr-only" htmlFor="fq-status">Status</label>
            <select id="fq-status" className="ops-select" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
              {STATUS_OPTIONS.map((o) => <option key={o.value || 'any'} value={o.value}>{o.label}</option>)}
            </select>
            <label className="sr-only" htmlFor="fq-kind">Kind</label>
            <select id="fq-kind" className="ops-select" value={filters.kind} onChange={(e) => set({ kind: e.target.value })}>
              <option value="">Any kind</option>
              {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <label className="sr-only" htmlFor="fq-age">Age</label>
            <select id="fq-age" className="ops-select" value={filters.olderThanHours} onChange={(e) => set({ olderThanHours: e.target.value })}>
              {AGE_OPTIONS.map((o) => <option key={o.value || 'any'} value={o.value}>{o.label}</option>)}
            </select>
            <label className="sr-only" htmlFor="fq-who">Assigned to</label>
            <select id="fq-who" className="ops-select" value={filters.assigned} onChange={(e) => set({ assigned: e.target.value })}>
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
        </TableToolbar>
        {error ? (
          <ErrorState title="The flags could not be loaded" detail={error} onRetry={() => void load()} />
        ) : rows === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the flags</span>
            <Skeleton kind="row" count={5} />
          </div>
        ) : rows.length === 0 ? (
          <Empty title={filters.severity || filters.kind || filters.assigned || filters.olderThanHours || filters.status !== 'active' ? 'No flags match' : 'The queue is clear'}
            detail="Nothing matches these filters in your scope. Rules check for new activity every 15 minutes." />
        ) : (
          <DataTable caption="Fraud flags, worst first" rows={rows} columns={columns} rowKey={(f) => f.id}
            density={density} maxHeight={false} onRow={(f) => router.push(`/fraud/${f.id}`)} />
        )}
      </Panel>
    </>
  );
}

export default function FraudQueuePage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <QueueInner />
    </Suspense>
  );
}
