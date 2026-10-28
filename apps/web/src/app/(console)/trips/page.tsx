'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { currentScope, getCachedAccess, withScope } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp, timeZoneFor, zoneAbbreviation } from '@/lib/consoleTime';
import { currencySymbol } from '@/lib/money';
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
 * Trips, for looking one up.
 *
 * An operator comes here with a question -- a rider rang about a charge, a
 * driver disputes a cancellation -- so the filter is the state those
 * questions are about, in the URL so the Command Centre can link to it,
 * and every row opens the trip in a drawer with the full page one click
 * further.
 *
 * The fare column shows what was CHARGED where that is known and the
 * estimate otherwise, labelled, because the difference is the thing most
 * disputes are about. Times are in the selected region's zone.
 */
type Trip = {
  id: number;
  status?: string;
  status_id?: { status_code?: string };
  user?: string | null;
  driver_name?: string | null;
  vehicle_info?: string | null;
  pickup_address?: string;
  destination_address?: string;
  estimated_fare?: string | null;
  final_fare?: string | null;
  currency?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  requested_at?: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
};

type Page = { count?: number; next?: string | null; results?: Trip[] };

const STATES = [
  ['', 'All'],
  ['requested', 'Requested'],
  ['accepted', 'Accepted'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
] as const;

const TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  completed: 'good',
  cancelled: 'bad',
  requested: 'wait',
  accepted: 'wait',
  reached: 'wait',
  in_progress: 'wait',
};

const stateOf = (t: Trip) => t.status || t.status_id?.status_code || 'unknown';

function TripsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const status = search.get('status') ?? '';

  const [density, setDensity] = useDensity();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState(status);
  const [selected, setSelected] = useState<Trip | null>(null);
  useEffect(() => setDraftStatus(status), [status]);

  const scope = currentScope(getCachedAccess());
  const tz = timeZoneFor(scope?.code);
  const tzName = useMemo(() => zoneAbbreviation(tz), [tz]);

  const load = useCallback(async () => {
    setTrips(null);
    setError(null);
    try {
      const query = new URLSearchParams({ page_size: '50' });
      if (status) query.set('status', status);
      const page = await api.get<Page>(withScope(`/ride/admin/trips/?${query}`));
      const list = Array.isArray(page?.results) ? page.results
        : (Array.isArray(page) ? (page as unknown as Trip[]) : []);
      setTrips(list);
      setTotal(typeof page?.count === 'number' ? page.count : null);
      setMore(Boolean(page?.next));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load the trips.');
      setTrips([]);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const fare = (t: Trip) => {
    const charged = t.final_fare != null && t.final_fare !== '';
    const amount = charged ? t.final_fare : t.estimated_fare;
    if (amount == null || amount === '') return <span className="muted">—</span>;
    return (
      <>
        {currencySymbol(t.currency)}{amount}
        {!charged ? <span className="muted"> est.</span> : null}
      </>
    );
  };

  const columns: Column<Trip>[] = [
    { key: 'id', label: 'Trip', width: '5rem', sortValue: (t) => t.id, render: (t) => <Link href={`/trips/${t.id}`}>#{t.id}</Link> },
    {
      key: 'status', label: 'Status', width: '8rem', sortValue: stateOf,
      render: (t) => <Pill tone={TONE[stateOf(t)] ?? 'neutral'}>{stateOf(t).replace(/_/g, ' ')}</Pill>,
    },
    { key: 'rider', label: 'Rider', width: '10rem', sortValue: (t) => t.user ?? '', render: (t) => <span title={t.user ?? undefined}>{t.user || <span className="muted">—</span>}</span> },
    { key: 'driver', label: 'Driver', width: '11rem', hideBelow: 1280, sortValue: (t) => t.driver_name ?? '', render: (t) => <span title={t.driver_name ?? undefined}>{t.driver_name || <span className="muted">unassigned</span>}</span> },
    {
      key: 'pickup', label: 'Pickup',
      render: (t) => <span title={t.pickup_address}>{t.pickup_address || '—'}</span>,
    },
    {
      key: 'drop', label: 'Drop', hideBelow: 1100,
      render: (t) => <span title={t.destination_address}>{t.destination_address || '—'}</span>,
    },
    {
      key: 'fare', label: 'Fare', num: true, width: '7rem',
      sortValue: (t) => Number(t.final_fare ?? t.estimated_fare ?? NaN) || null,
      render: fare,
    },
    {
      key: 'time', label: tzName ? `Requested (${tzName})` : 'Requested', num: true, width: '9.5rem',
      sortValue: (t) => t.requested_at ?? '',
      render: (t) => stamp(t.requested_at, tz),
    },
  ];

  const label = STATES.find(([v]) => v === status)?.[1] ?? status;
  const summary = total === null ? null
    : `${total} ${status ? label.toLowerCase() : 'matching'}${more ? ' · showing the first 50' : ''}`;

  function apply() {
    router.push(draftStatus ? `/trips?status=${draftStatus}` : '/trips');
    setFiltersOpen(false);
  }

  return (
    <>
      <PageHeader title="Trips" />

      <Panel flush>
        <TableToolbar
          summary={summary}
          density={density}
          onDensity={setDensity}
          onFilters={() => setFiltersOpen(true)}
          filtersActive={status ? 1 : 0}
        />

        {trips === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading trips</span>
            <Skeleton kind="row" count={8} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState title="The list could not be loaded" detail={`${error} This is not the same as there being no trips.`} onRetry={() => void load()} />
          </div>
        ) : trips.length === 0 ? (
          <Empty title="No trips match" detail={status ? `Nothing is ${label.toLowerCase()} in this region right now.` : undefined} />
        ) : (
          <DataTable
            caption="Trips"
            rows={trips}
            columns={columns}
            rowKey={(t) => t.id}
            density={density}
            onRow={setSelected}
            selectedKey={selected?.id ?? null}
            defaultSort={{ key: 'time', dir: 'desc' }}
          />
        )}
      </Panel>

      <Drawer open={filtersOpen} title="Filter trips" onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setDraftStatus('')}>Reset</button>
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={apply}>Show trips</button>
          </>
        }
      >
        <div className="ops-filterset">
          <fieldset>
            <legend>Status</legend>
            {STATES.map(([v, l]) => (
              <label key={v}>
                <input type="radio" name="status" value={v} checked={draftStatus === v} onChange={() => setDraftStatus(v)} />
                {l}
              </label>
            ))}
          </fieldset>
        </div>
      </Drawer>

      <Drawer
        open={selected !== null}
        title={selected ? `Trip #${selected.id}` : ''}
        onClose={() => setSelected(null)}
        footer={selected ? (
          <ButtonLink href={`/trips/${selected.id}`} variant="primary" size="sm">Open full trip</ButtonLink>
        ) : undefined}
      >
        {selected && (
          <Facts>
            <Fact label="Status"><Pill tone={TONE[stateOf(selected)] ?? 'neutral'}>{stateOf(selected).replace(/_/g, ' ')}</Pill></Fact>
            <Fact label="Rider">{selected.user || '—'}</Fact>
            <Fact label="Driver">{selected.driver_name || 'Unassigned'}</Fact>
            <Fact label="Vehicle">{selected.vehicle_info || '—'}</Fact>
            <Fact label="Pickup">{selected.pickup_address || '—'}</Fact>
            <Fact label="Drop">{selected.destination_address || '—'}</Fact>
            <Fact label="Fare">{fare(selected)}</Fact>
            <Fact label="Payment">{[selected.payment_method, selected.payment_status].filter(Boolean).join(' · ') || '—'}</Fact>
            <Fact label="Requested">{stamp(selected.requested_at, tz)}{tzName ? ` ${tzName}` : ''}</Fact>
            {selected.completed_at ? <Fact label="Completed">{stamp(selected.completed_at, tz)}</Fact> : null}
            {selected.cancelled_at ? <Fact label="Cancelled">{stamp(selected.cancelled_at, tz)}</Fact> : null}
          </Facts>
        )}
      </Drawer>
    </>
  );
}

export default function TripsPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <TripsInner />
    </Suspense>
  );
}
