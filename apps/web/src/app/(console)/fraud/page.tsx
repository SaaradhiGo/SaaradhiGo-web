'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  KIND_WORDS, SEVERITY_ORDER, SEVERITY_WORDS, STATUS_WORDS, ageWords, canReadFraud, evidenceSummary, filtersFromParams,
  queueQuery, type Flag, type Queue, type QueueFilters, type Severity, type Status,
} from '@/lib/fraud';
import { messageOf } from '@/components/console/notifications';
import { FraudNav, NoFraudAccess } from '@/components/console/fraud/parts';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip, type ChipTone } from '@/components/console/kit/StatusChip';
import { PageHeader, Skeleton } from '@/components/console/ui';

/**
 * Fraud & Risk: the review queue, paged on the server.
 *
 * Flags raised by the detection rules (and by a blocked referral reward), worst first and then the
 * ones that have waited longest. A flag names the person by a masked reference and says in words
 * what the rule saw; open one to see the evidence, the linked accounts and the timeline, and to
 * review it. Marketing can read the queue; assigning, dismissing and confirming need fraud.review.
 * Nothing here tells the person they were flagged or moves any money.
 */
const VIEWS: Array<{ key: string; label: string }> = [
  { key: 'active', label: 'Open and in review' }, { key: 'open', label: 'Open' },
  { key: 'in_review', label: 'In review' }, { key: 'confirmed', label: 'Confirmed' },
  { key: 'dismissed', label: 'Dismissed' }, { key: '', label: 'Any status' },
];
const AGE_OPTIONS = [
  { value: '', label: 'Any age' }, { value: '24', label: 'Over 24 hours' },
  { value: '48', label: 'Over 48 hours' }, { value: '168', label: 'Over a week' },
];
const KINDS = Object.entries(KIND_WORDS);
const PAGE_SIZE = 25;

const SEV_TONE: Record<Severity, ChipTone> = { high: 'caution', medium: 'info', low: 'neutral' };
const STATUS_TONE: Record<Status, ChipTone> = { open: 'info', in_review: 'info', confirmed: 'caution', dismissed: 'neutral' };

function FlagSeverity({ severity }: { severity: Severity }) {
  return <StatusChip tone={SEV_TONE[severity] ?? 'neutral'}>{SEVERITY_WORDS[severity] ?? severity}</StatusChip>;
}

function QueueInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const [filters, setFilters] = useState<QueueFilters>(() => filtersFromParams((k) => search.get(k)));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const may = canReadFraud(access);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await api.get<Queue>(withScope(`/fraud/admin/flags/?${queueQuery(filters, { limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) })}`)));
    } catch (err) {
      setError(messageOf(err, 'The flags could not be loaded.'));
    }
  }, [filters, page]);
  useEffect(() => { if (may) void load(); }, [load, may]);

  if (!canOpen(access, 'fraud') || !may) {
    return (<><PageHeader title="Fraud and risk" /><NoFraudAccess /></>);
  }

  const set = (patch: Partial<QueueFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const status = data?.facets.status ?? {};
  const severityCounts = data?.facets.severity ?? {};
  const countFor = (key: string) => {
    if (!data) return undefined;
    if (key === 'active') return (status.open ?? 0) + (status.in_review ?? 0);
    if (key === '') return Object.values(status).reduce((a, b) => a + b, 0);
    return status[key] ?? 0;
  };

  const columns: ListColumn<Flag>[] = [
    { key: 'sev', label: 'Severity', render: (f) => <FlagSeverity severity={f.severity} /> },
    {
      key: 'flag', label: 'Flag', primary: true,
      render: (f) => <Link href={`/fraud/${f.id}`} className="fr-open">{f.subject.ref}<span className="muted"> #{f.id}</span></Link>,
    },
    { key: 'kind', label: 'Kind', render: (f) => KIND_WORDS[f.kind] ?? f.kind },
    { key: 'what', label: 'What the rule saw', render: (f) => <span className="pm-wrap">{evidenceSummary(f)}</span> },
    { key: 'where', label: 'City', render: (f) => f.scope_name ?? 'Unplaced' },
    { key: 'status', label: 'Status', render: (f) => <StatusChip tone={STATUS_TONE[f.status] ?? 'neutral'}>{STATUS_WORDS[f.status] ?? f.status}</StatusChip> },
    { key: 'who', label: 'Assigned', render: (f) => (f.assigned_to ? f.assigned_to.label : <span className="muted">Unassigned</span>) },
    { key: 'raised', label: 'Raised', render: (f) => stamp(f.created_at, timeZoneFor(f.scope)) },
    { key: 'age', label: 'Waiting', num: true, render: (f) => ageWords(f.age_hours) },
  ];
  const chips = [
    ...(filters.severity ? [{ key: 'sev', label: `${SEVERITY_WORDS[filters.severity as Severity] ?? filters.severity} severity`, onRemove: () => set({ severity: '' }) }] : []),
    ...(filters.kind ? [{ key: 'kind', label: KIND_WORDS[filters.kind] ?? filters.kind, onRemove: () => set({ kind: '' }) }] : []),
    ...(filters.olderThanHours ? [{ key: 'age', label: AGE_OPTIONS.find((o) => o.value === filters.olderThanHours)?.label ?? `${filters.olderThanHours} h`, onRemove: () => set({ olderThanHours: '' }) }] : []),
    ...(filters.assigned ? [{ key: 'who', label: filters.assigned === 'me' ? 'Assigned to me' : 'Unassigned', onRemove: () => set({ assigned: '' }) }] : []),
  ];
  const saved = new URLSearchParams(queueQuery(filters));
  saved.delete('limit');
  const narrowed = Boolean(filters.severity || filters.kind || filters.assigned || filters.olderThanHours || filters.status !== 'active');

  return (
    <>
      <FraudNav />
      <ListPage<Flag>
        pageKey="fraud-queue"
        title="Fraud and risk"
        summary="Flags raised by the detection rules, worst first. Open one to see the evidence and review it. The people are never told."
        views={VIEWS.map((v) => ({ key: v.key, label: v.label, count: countFor(v.key) }))}
        view={filters.status}
        onView={(v) => set({ status: v })}
        chips={chips}
        filterSlot={(
          <div className="ops-list__filters">
            <label className="sr-only" htmlFor="fq-sev">Severity</label>
            <select id="fq-sev" className="ops-select ops-list__select" value={filters.severity} onChange={(e) => set({ severity: e.target.value })}>
              <option value="">Every severity</option>
              {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{SEVERITY_WORDS[s]} ({severityCounts[s] ?? 0})</option>)}
            </select>
            <label className="sr-only" htmlFor="fq-kind">Kind</label>
            <select id="fq-kind" className="ops-select ops-list__select" value={filters.kind} onChange={(e) => set({ kind: e.target.value })}>
              <option value="">Any kind</option>
              {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <label className="sr-only" htmlFor="fq-age">Age</label>
            <select id="fq-age" className="ops-select ops-list__select" value={filters.olderThanHours} onChange={(e) => set({ olderThanHours: e.target.value })}>
              {AGE_OPTIONS.map((o) => <option key={o.value || 'any'} value={o.value}>{o.label}</option>)}
            </select>
            <label className="sr-only" htmlFor="fq-who">Assigned to</label>
            <select id="fq-who" className="ops-select ops-list__select" value={filters.assigned} onChange={(e) => set({ assigned: e.target.value })}>
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
        )}
        columns={columns}
        rows={data?.results ?? []}
        rowKey={(f) => f.id}
        total={data ? data.count : null}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={setPage}
        onRow={(f) => router.push(`/fraud/${f.id}`)}
        loading={data === null && !error}
        error={error}
        empty={narrowed ? 'No flags match these filters in your scope.' : 'The queue is clear. Rules check for new activity every 15 minutes.'}
        currentQuery={saved.toString() || undefined}
        onSavedView={(q) => { setFilters(filtersFromParams((k) => new URLSearchParams(q).get(k))); setPage(1); }}
      />
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
