'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  DEFAULT_SUPPORT_FILTERS, ISSUE_LABEL, PRIORITY_LABEL, QUEUE_TABS, STATUS_LABEL,
  SUPPORT_PAGE_SIZES, SUPPORT_SORT_OPTIONS, type QueueCounts, type Sla, type SupportFilters,
  activeSupportFilterCount, canEditSla, canManageMacros, priorityTone, slaChip, supportApiPath,
  supportFiltersFromSearch, supportFiltersToQuery,
} from '@/lib/supportDesk';
import { ButtonLink } from '@/components/sg/Button';
import {
  Column, DataTable, Empty, ErrorState, Filters, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Support: the queue.
 *
 * The tabs are the questions an agent asks in order: what is mine, what has
 * nobody picked up, what is about to breach, everything open, and what is
 * done. Their counts come from the server in the same response as the rows,
 * over the operator's whole scope, so a count is never the size of the page.
 * Every filter is server-side and lives in the URL. The SLA chip says the
 * next deadline in words and turns red only once one has passed.
 *
 * A ticket's city is where the server places it: the trip's city, a
 * driver's home city, or, for a rider with no trip, where that rider is
 * visible (their home city, else their country). Contact details arrive
 * masked; the ticket page holds the logged reveal.
 */
type City = { code: string; name: string; country?: string } | null;

type TicketRow = {
  id: number;
  status: string;
  priority: string;
  issue_type: string;
  issue_label?: string;
  description?: string | null;
  created_at: string;
  assignee?: { id: number; label: string } | null;
  requester?: { id: number; role: string; full_name?: string | null } | null;
  city: City;
  sla: Sla;
};

type Page = {
  count: number; page: number; total_pages: number;
  queues?: QueueCounts; results: TicketRow[];
};

const STATUS_TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  OPEN: 'bad', IN_PROGRESS: 'wait', WAITING_USER: 'neutral', CLOSED: 'good',
};

const requesterName = (t: TicketRow) =>
  t.requester?.full_name?.trim() || `${t.requester?.role === 'driver' ? 'Driver' : 'Rider'} #${t.requester?.id ?? '—'}`;

function SupportInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const filters = useMemo(() => supportFiltersFromSearch(new URLSearchParams(search.toString())), [search]);

  const [density, setDensity] = useDensity();
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SupportFilters>(filters);
  useEffect(() => setDraft(filters), [filters]);

  const cities = (access?.scopes ?? []).filter((s) => s.kind === 'city');

  const load = useCallback(async () => {
    setPage(null);
    setError(null);
    try {
      const path = supportApiPath(filters);
      setPage(await api.get<Page>(filters.scope ? path : withScope(path)));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the tickets.');
      setPage({ count: 0, page: 1, total_pages: 1, results: [] });
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  const go = (next: SupportFilters) => {
    const q = supportFiltersToQuery(next);
    router.push(q ? `/support?${q}` : '/support');
  };
  const apply = (patch: Partial<SupportFilters>) => go({ ...draft, ...patch, page: 1 });

  const counts = page?.queues ?? {};
  const rows = page?.results ?? [];
  const active = activeSupportFilterCount(filters);
  const tabs = QUEUE_TABS.map((t) => ({
    key: t.key,
    label: counts[t.key] === undefined ? t.label : `${t.label} ${counts[t.key]}`,
  }));

  const columns: Column<TicketRow>[] = [
    { key: 'id', label: 'Ticket', width: '6rem', render: (t) => <Link href={`/support/${t.id}`}>#{t.id}</Link> },
    {
      key: 'priority', label: 'Priority', width: '6.5rem',
      render: (t) => <Pill tone={priorityTone(t.priority)}>{PRIORITY_LABEL[t.priority] ?? t.priority}</Pill>,
    },
    {
      key: 'sla', label: 'SLA', width: '12rem',
      render: (t) => {
        const chip = slaChip(t.sla);
        return <Pill tone={chip.tone}>{chip.label}</Pill>;
      },
    },
    {
      key: 'issue', label: 'Issue', width: '11rem',
      render: (t) => t.issue_label ?? ISSUE_LABEL[t.issue_type] ?? t.issue_type,
    },
    {
      key: 'who', label: 'Raised by', width: '11rem',
      render: (t) => <span title={requesterName(t)}>{requesterName(t)}</span>,
    },
    {
      key: 'said', label: 'What they said', hideBelow: 1280,
      render: (t) => <span title={t.description ?? undefined}>{t.description || <span className="muted">—</span>}</span>,
    },
    { key: 'city', label: 'City', width: '8rem', hideBelow: 1100, render: (t) => t.city?.name ?? <span className="muted">unplaced</span> },
    {
      key: 'assignee', label: 'Assignee', width: '9rem',
      render: (t) => (t.assignee ? t.assignee.label : <span className="muted">Unassigned</span>),
    },
    {
      key: 'status', label: 'Status', width: '9.5rem', hideBelow: 1100,
      render: (t) => <Pill tone={STATUS_TONE[t.status] ?? 'neutral'}>{STATUS_LABEL[t.status] ?? t.status}</Pill>,
    },
    {
      key: 'opened', label: 'Opened', width: '10rem', num: true, hideBelow: 1280,
      render: (t) => stamp(t.created_at, timeZoneFor(t.city?.code)),
    },
  ];

  const total = page?.count ?? null;
  const summary = total === null ? null
    : `${total.toLocaleString('en-IN')} ticket${total === 1 ? '' : 's'}${active ? ` · ${active} filter${active === 1 ? '' : 's'}` : ''}`;

  return (
    <>
      <PageHeader
        title="Support"
        subtitle="Contact details are masked. Each ticket sits in the city of its trip, a driver's home city, or where its rider is visible."
        actions={
          <>
            {canManageMacros(access) ? <ButtonLink href="/support/macros" variant="secondary" size="sm">Macros</ButtonLink> : null}
            <ButtonLink href="/support/sla" variant="ghost" size="sm">{canEditSla(access) ? 'SLA policy' : 'SLA policy (read only)'}</ButtonLink>
          </>
        }
      />

      <div className="ops-queuebar">
        <Filters
          value={filters.queue}
          options={tabs}
          onChange={(key) => go({ ...filters, queue: key, page: 1 })}
        />
      </div>

      <Panel title="Filters">
        <form className="ops-form" aria-label="Filter tickets" onSubmit={(e) => { e.preventDefault(); apply({}); }}>
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="f-q">Find</label>
            <input
              id="f-q" className="ops-select" value={draft.q} placeholder="Ticket # or last 4 of phone"
              onChange={(e) => setDraft({ ...draft, q: e.target.value })} size={24}
            />
            {cities.length > 1 ? (
              <>
                <label className="ops-form__label" htmlFor="f-city">City</label>
                <select id="f-city" className="ops-select" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
                  <option value="">All I hold</option>
                  {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </>
            ) : null}
            <label className="ops-form__label" htmlFor="f-country">Country</label>
            <select id="f-country" className="ops-select" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })}>
              <option value="">Any</option>
              <option value="IN">India</option>
              <option value="US">United States</option>
            </select>
            <label className="ops-form__label" htmlFor="f-priority">Priority</label>
            <select id="f-priority" className="ops-select" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
              <option value="">Any</option>
              {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label className="ops-form__label" htmlFor="f-issue">Issue</label>
            <select id="f-issue" className="ops-select" value={draft.issueType} onChange={(e) => setDraft({ ...draft, issueType: e.target.value })}>
              <option value="">Any</option>
              {Object.entries(ISSUE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="f-from">Opened from</label>
            <input id="f-from" type="date" className="ops-select" value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} />
            <label className="ops-form__label" htmlFor="f-to">to</label>
            <input id="f-to" type="date" className="ops-select" value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} />
            <label className="ops-form__row">
              <input type="checkbox" checked={draft.dueSoon} onChange={(e) => apply({ dueSoon: e.target.checked })} /> Due within the hour
            </label>
            <label className="ops-form__label" htmlFor="f-sort">Sort</label>
            <select id="f-sort" className="ops-select" value={draft.ordering} onChange={(e) => apply({ ordering: e.target.value })}>
              {SUPPORT_SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm">Show tickets</button>
            <button
              type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
              onClick={() => go({ ...DEFAULT_SUPPORT_FILTERS, queue: filters.queue })} disabled={active === 0}
            >Clear</button>
          </div>
        </form>
      </Panel>

      <Panel flush>
        <TableToolbar summary={summary} density={density} onDensity={setDensity} />

        {page === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading tickets</span>
            <Skeleton kind="row" count={8} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState title="The tickets could not be loaded" detail={`${error} This is not the same as there being none.`} onRetry={() => void load()} />
          </div>
        ) : rows.length === 0 ? (
          <Empty
            title="No tickets here"
            detail={active ? 'Try fewer filters.' : filters.queue === 'mine' ? 'Nothing is assigned to you.' : 'Nothing is waiting in this queue.'}
          />
        ) : (
          <DataTable caption="Support tickets" rows={rows} columns={columns} rowKey={(t) => t.id} density={density} />
        )}

        {page && page.total_pages > 1 ? (
          <nav className="ops-toolbar" aria-label="Pages">
            <div className="ops-toolbar__left">
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={filters.page <= 1} onClick={() => go({ ...filters, page: filters.page - 1 })}>Previous</button>
              <span className="ops-toolbar__summary">Page {page.page} of {page.total_pages}</span>
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={page.page >= page.total_pages} onClick={() => go({ ...filters, page: filters.page + 1 })}>Next</button>
            </div>
            <div className="ops-toolbar__right">
              <label className="ops-form__label" htmlFor="f-size">Per page</label>{' '}
              <select id="f-size" className="ops-select" value={filters.pageSize} onChange={(e) => go({ ...filters, pageSize: Number(e.target.value), page: 1 })}>
                {SUPPORT_PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </nav>
        ) : null}
      </Panel>
    </>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <SupportInner />
    </Suspense>
  );
}
