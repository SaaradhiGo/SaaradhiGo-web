'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { currentScope, getCachedAccess } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import { ButtonLink } from '@/components/sg/Button';
import {
  Column,
  DataTable,
  Drawer,
  Empty,
  ErrorState,
  Fact,
  Facts,
  PageHeader,
  Panel,
  Pill,
  Skeleton,
  TableToolbar,
} from '@/components/console/ui';

/**
 * Riders and drivers waiting for an answer.
 *
 * THE STATUS VALUES ARE UPPERCASE and the backend validates nothing --
 * `servers/support/views.py` does `qs.filter(status=status_filter)` with
 * no check, so a lowercase value matches zero rows and returns a confident
 * empty list. The filter here sends exactly what the model stores, and it
 * lives in the URL so the Command Centre can link to the open queue.
 *
 * The default view is OPEN, sorted by how long they have waited, longest
 * first: that is the queue, and the thing that matters about a ticket is
 * how long somebody has been waiting on it.
 */
type Ticket = {
  id: number;
  issue_type: string;
  status: string;
  description?: string;
  created_at?: string;
  assigned_to?: number | null;
  trip_id?: number | null;
  user_id?: number | { phone_number?: string; full_name?: string };
};

type Page = { count?: number; next?: string | null; results?: Ticket[] };

const STATES = [
  ['', 'All'],
  ['OPEN', 'Open'],
  ['IN_PROGRESS', 'In progress'],
  ['WAITING_USER', 'Waiting on them'],
  ['CLOSED', 'Closed'],
] as const;

const TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  OPEN: 'bad',
  IN_PROGRESS: 'wait',
  WAITING_USER: 'neutral',
  CLOSED: 'good',
};

/** How long it has been waiting, which is the thing that matters. */
function waitingHours(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms / 3600000;
}
function waitingLabel(hours: number | null) {
  if (hours === null) return '—';
  if (hours < 1) return 'under an hour';
  if (hours < 48) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

function raisedBy(t: Ticket) {
  const u = typeof t.user_id === 'object' && t.user_id ? t.user_id : null;
  return u?.full_name?.trim() || u?.phone_number
    || (typeof t.user_id === 'number' ? `#${t.user_id}` : '—');
}

const issue = (t: Ticket) => t.issue_type?.replace(/_/g, ' ') || '—';

function SupportInner() {
  const router = useRouter();
  const search = useSearchParams();
  // OPEN unless the URL says otherwise; `all` is the explicit everything.
  const raw = search.get('status');
  const status = raw === null ? 'OPEN' : raw === 'all' ? '' : raw;

  const [density, setDensity] = useDensity();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(status);
  const [selected, setSelected] = useState<Ticket | null>(null);
  useEffect(() => setDraft(status), [status]);

  const tz = timeZoneFor(currentScope(getCachedAccess())?.code);

  const load = useCallback(async () => {
    setTickets(null);
    setError(null);
    try {
      const query = new URLSearchParams({ page_size: '100' });
      if (status) query.set('status', status);
      const page = await api.get<Page>(`/support/admin/tickets/?${query}`);
      const list = Array.isArray(page?.results) ? page.results
        : (Array.isArray(page) ? (page as unknown as Ticket[]) : []);
      setTickets(list);
      setTotal(typeof page?.count === 'number' ? page.count : null);
      setMore(Boolean(page?.next));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load the tickets.');
      setTickets([]);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<Ticket>[] = [
    { key: 'id', label: 'Ticket', width: '6rem', sortValue: (t) => t.id, render: (t) => <Link href={`/support/${t.id}`}>#{t.id}</Link> },
    { key: 'issue', label: 'Issue', width: '11rem', sortValue: issue, render: (t) => <span className="capitalize" title={issue(t)}>{issue(t)}</span> },
    { key: 'who', label: 'Raised by', width: '11rem', sortValue: raisedBy, render: (t) => <span title={raisedBy(t)}>{raisedBy(t)}</span> },
    { key: 'said', label: 'What they said', render: (t) => <span title={t.description}>{t.description || <span className="muted">—</span>}</span> },
    {
      key: 'status', label: 'Status', width: '10rem', sortValue: (t) => t.status,
      render: (t) => <Pill tone={TONE[t.status] ?? 'neutral'}>{t.status?.replace(/_/g, ' ').toLowerCase()}</Pill>,
    },
    {
      key: 'waiting', label: 'Waiting', num: true, width: '8rem',
      sortValue: (t) => (t.status === 'CLOSED' ? null : waitingHours(t.created_at)),
      render: (t) => (
        <span title={stamp(t.created_at, tz)} className={t.status !== 'CLOSED' && (waitingHours(t.created_at) ?? 0) >= 24 ? 'ops-late' : undefined}>
          {t.status === 'CLOSED' ? <span className="muted">—</span> : waitingLabel(waitingHours(t.created_at))}
        </span>
      ),
    },
  ];

  const label = STATES.find(([v]) => v === status)?.[1] ?? status;
  const summary = total === null ? null
    : `${total} ${status ? label.toLowerCase() : 'in total'}${more ? ' · showing the first 100' : ''}`;

  function apply() {
    router.push(draft === '' ? '/support?status=all' : draft === 'OPEN' ? '/support' : `/support?status=${draft}`);
    setFiltersOpen(false);
  }

  return (
    <>
      <PageHeader title="Support" />

      <Panel flush>
        <TableToolbar
          summary={summary}
          density={density}
          onDensity={setDensity}
          onFilters={() => setFiltersOpen(true)}
          filtersActive={status === 'OPEN' ? 0 : 1}
        />

        {tickets === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading tickets</span>
            <Skeleton kind="row" count={8} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState title="The tickets could not be loaded" detail={`${error} This is not the same as there being none.`} onRetry={() => void load()} />
          </div>
        ) : tickets.length === 0 ? (
          <Empty
            title={status === 'OPEN' ? 'Nobody is waiting for an answer' : 'Nothing here'}
            detail={status === 'OPEN' ? 'New tickets appear here as riders and drivers raise them.' : undefined}
          />
        ) : (
          <DataTable
            caption="Support tickets"
            rows={tickets}
            columns={columns}
            rowKey={(t) => t.id}
            density={density}
            onRow={setSelected}
            selectedKey={selected?.id ?? null}
            defaultSort={{ key: 'waiting', dir: 'desc' }}
          />
        )}
      </Panel>

      <Drawer open={filtersOpen} title="Filter tickets" onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setDraft('OPEN')}>Reset</button>
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={apply}>Show tickets</button>
          </>
        }
      >
        <div className="ops-filterset">
          <fieldset>
            <legend>Status</legend>
            {STATES.map(([v, l]) => (
              <label key={v}>
                <input type="radio" name="status" value={v} checked={draft === v} onChange={() => setDraft(v)} />
                {l}
              </label>
            ))}
          </fieldset>
        </div>
      </Drawer>

      <Drawer
        open={selected !== null}
        title={selected ? `Ticket #${selected.id}` : ''}
        onClose={() => setSelected(null)}
        footer={selected ? (
          <ButtonLink href={`/support/${selected.id}`} variant="primary" size="sm">Open the thread</ButtonLink>
        ) : undefined}
      >
        {selected && (
          <Facts>
            <Fact label="Status"><Pill tone={TONE[selected.status] ?? 'neutral'}>{selected.status?.replace(/_/g, ' ').toLowerCase()}</Pill></Fact>
            <Fact label="Issue"><span className="capitalize">{issue(selected)}</span></Fact>
            <Fact label="Raised by">{raisedBy(selected)}</Fact>
            <Fact label="Raised">{stamp(selected.created_at, tz)}</Fact>
            <Fact label="Waiting">{selected.status === 'CLOSED' ? '—' : waitingLabel(waitingHours(selected.created_at))}</Fact>
            {selected.trip_id ? <Fact label="Trip"><Link href={`/trips/${selected.trip_id}`}>#{selected.trip_id}</Link></Fact> : null}
            <Fact label="Assigned">{selected.assigned_to ? `Staff #${selected.assigned_to}` : 'Nobody yet'}</Fact>
            <Fact label="What they said">
              <span style={{ whiteSpace: 'pre-wrap' }}>{selected.description || '—'}</span>
            </Fact>
          </Facts>
        )}
      </Drawer>
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
