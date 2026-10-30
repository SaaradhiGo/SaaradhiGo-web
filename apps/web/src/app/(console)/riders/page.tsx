'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import {
  DEFAULT_RIDER_FILTERS, RIDER_PAGE_SIZES, RIDER_SORT_OPTIONS, TRIP_BANDS,
  type RiderFilters, activeRiderFilterCount, canBulkRiders, riderFiltersFromSearch,
  riderFiltersToQuery, riderName, ridersApiPath, tripBandValue,
} from '@/lib/riders';
import { BULK_CHECKER_ABOVE, cityTime } from '@/lib/trips';
import { type BulkRiderAction, RiderBulkDrawer } from '@/components/console/RiderActionDrawer';
import { ButtonLink } from '@/components/sg/Button';
import {
  Column, DataTable, Drawer, Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill,
  Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Riders: everybody who books, in the operator's scope.
 *
 * A rider's city is the city of their latest trip; that is how the server
 * decides who is in scope, and the City column says it. Every filter is
 * SERVER-SIDE and lives in the URL, so a count is the real count. Contact
 * details arrive masked: the server never sends the number, and the reveal
 * on the rider's page is the logged way to it.
 *
 * Bulk block and unblock act on the ticked rows. Over 50 the server sends
 * the action to a second admin, and the bar says so up front.
 */
type City = { code: string; name: string; timezone: string } | null;

type RiderRow = {
  id: number;
  user_details?: { full_name?: string | null; phone_number?: string | null } | null;
  city?: City;
  joined_at?: string | null;
  trips_total?: number;
  trips_completed?: number;
  last_trip_at?: string | null;
  rating?: string;
  low_rating?: boolean;
  soft_blocked?: boolean;
  blocked?: boolean;
  flagged?: boolean;
  has_open_ticket?: boolean;
  had_sos?: boolean;
};

type Page = { count: number; page: number; total_pages: number; results: RiderRow[] };

function StatePills({ r }: { r: RiderRow }) {
  const pills = [
    r.blocked ? <Pill key="b" tone="bad">blocked</Pill> : null,
    r.flagged ? <Pill key="f" tone="wait">flagged</Pill> : null,
    r.low_rating ? <Pill key="l" tone="wait">low rating</Pill> : null,
    r.has_open_ticket ? <Pill key="t">open ticket</Pill> : null,
    r.had_sos ? <Pill key="s">SOS</Pill> : null,
  ].filter(Boolean);
  return pills.length ? <span className="ops-form__row">{pills}</span> : <span className="muted">—</span>;
}

function RidersInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const filters = useMemo(() => riderFiltersFromSearch(new URLSearchParams(search.toString())), [search]);

  const [density, setDensity] = useDensity();
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RiderFilters>(filters);
  const [preview, setPreview] = useState<RiderRow | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState<BulkRiderAction | null>(null);
  useEffect(() => setDraft(filters), [filters]);

  const mayBulk = canBulkRiders(access);
  const cities = (access?.scopes ?? []).filter((s) => s.kind === 'city');

  const load = useCallback(async () => {
    setPage(null);
    setError(null);
    try {
      const path = ridersApiPath(filters);
      setPage(await api.get<Page>(filters.scope ? path : withScope(path)));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the riders.');
      setPage({ count: 0, page: 1, total_pages: 1, results: [] });
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => setPicked(new Set()), [filters]);

  const go = (next: RiderFilters) => {
    const q = riderFiltersToQuery(next);
    router.push(q ? `/riders?${q}` : '/riders');
  };
  const apply = (patch: Partial<RiderFilters>) => go({ ...draft, ...patch, page: 1 });
  const rows = page?.results ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: number) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)));

  const columns: Column<RiderRow>[] = [
    ...(mayBulk ? [{
      key: 'pick', label: (
        <input type="checkbox" aria-label="Select every rider on this page" checked={allPicked} onChange={toggleAll} />
      ), width: '3.5rem',
      render: (r: RiderRow) => (
        <input type="checkbox" aria-label={`Select rider ${r.id}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
      ),
    }] : []),
    { key: 'id', label: 'Rider', render: (r) => <Link href={`/riders/${r.id}`}>{riderName(r.user_details, r.id)}</Link> },
    { key: 'state', label: 'State', width: '14rem', render: (r) => <StatePills r={r} /> },
    { key: 'city', label: 'City', width: '8rem', hideBelow: 1280, render: (r) => r.city?.name ?? <span className="muted">no trips</span> },
    { key: 'trips', label: 'Trips', width: '5.5rem', num: true, render: (r) => r.trips_completed ?? 0 },
    { key: 'rating', label: 'Rating', width: '5.5rem', num: true, hideBelow: 1100, render: (r) => (r.rating ? Number(r.rating).toFixed(2) : '—') },
    { key: 'last', label: 'Last trip', width: '9rem', num: true, render: (r) => cityTime(r.last_trip_at, r.city?.timezone) },
    { key: 'joined', label: 'Joined', width: '9rem', num: true, hideBelow: 1280, render: (r) => cityTime(r.joined_at, r.city?.timezone) },
  ];

  const total = page?.count ?? null;
  const active = activeRiderFilterCount(filters);
  const summary = total === null ? null
    : `${total.toLocaleString('en-IN')} rider${total === 1 ? '' : 's'}${active ? ` · ${active} filter${active === 1 ? '' : 's'}` : ''}`;

  return (
    <>
      <PageHeader
        title="Riders"
        subtitle="Contact details are masked. A rider's city is the city of their latest trip; times are shown in it."
      />

      <Panel title="Filters">
        <form className="ops-form" aria-label="Filter riders" onSubmit={(e) => { e.preventDefault(); apply({}); }}>
          <div className="ops-form__row">
            {cities.length > 1 ? (
              <>
                <label className="ops-form__label" htmlFor="f-city">City</label>
                <select id="f-city" className="ops-select" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
                  <option value="">All I hold</option>
                  {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </>
            ) : null}
            <label className="ops-form__label" htmlFor="f-trips">Completed trips</label>
            <select
              id="f-trips" className="ops-select" value={tripBandValue(draft)}
              onChange={(e) => { const [min, max] = e.target.value.split('|'); setDraft({ ...draft, tripsMin: min, tripsMax: max }); }}
            >
              {TRIP_BANDS.map(([min, max, label]) => <option key={label} value={`${min}|${max}`}>{label}</option>)}
            </select>
            <label className="ops-form__label" htmlFor="f-id">Rider #</label>
            <input id="f-id" className="ops-select" inputMode="numeric" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value.replace(/\D/g, '') })} size={8} />
          </div>
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="f-joined-from">Joined from</label>
            <input id="f-joined-from" type="date" className="ops-select" value={draft.joinedFrom} onChange={(e) => setDraft({ ...draft, joinedFrom: e.target.value })} />
            <label className="ops-form__label" htmlFor="f-joined-to">to</label>
            <input id="f-joined-to" type="date" className="ops-select" value={draft.joinedTo} onChange={(e) => setDraft({ ...draft, joinedTo: e.target.value })} />
            <label className="ops-form__label" htmlFor="f-last-from">Last trip from</label>
            <input id="f-last-from" type="date" className="ops-select" value={draft.lastTripFrom} onChange={(e) => setDraft({ ...draft, lastTripFrom: e.target.value })} />
            <label className="ops-form__label" htmlFor="f-last-to">to</label>
            <input id="f-last-to" type="date" className="ops-select" value={draft.lastTripTo} onChange={(e) => setDraft({ ...draft, lastTripTo: e.target.value })} />
          </div>
          <div className="ops-form__row">
            <label className="ops-form__row"><input type="checkbox" checked={draft.hasOpenTicket} onChange={(e) => apply({ hasOpenTicket: e.target.checked })} /> Open ticket</label>
            <label className="ops-form__row"><input type="checkbox" checked={draft.hadSos} onChange={(e) => apply({ hadSos: e.target.checked })} /> Raised an SOS</label>
            <label className="ops-form__row"><input type="checkbox" checked={draft.blocked} onChange={(e) => apply({ blocked: e.target.checked })} /> Blocked</label>
            <label className="ops-form__row"><input type="checkbox" checked={draft.flagged} onChange={(e) => apply({ flagged: e.target.checked })} /> Flagged</label>
            <label className="ops-form__row"><input type="checkbox" checked={draft.lowRating} onChange={(e) => apply({ lowRating: e.target.checked })} /> Low rating</label>
            <label className="ops-form__label" htmlFor="f-sort">Sort</label>
            <select id="f-sort" className="ops-select" value={draft.ordering} onChange={(e) => apply({ ordering: e.target.value })}>
              {RIDER_SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm">Show riders</button>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => go(DEFAULT_RIDER_FILTERS)} disabled={active === 0}>Clear</button>
          </div>
        </form>
      </Panel>

      <Panel flush>
        <TableToolbar summary={summary} density={density} onDensity={setDensity}>
          {mayBulk && picked.size > 0 ? (
            <span className="ops-form__row" role="group" aria-label="Bulk actions">
              <b>{picked.size} selected</b>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setBulk('block')}>Block…</button>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setBulk('unblock')}>Unblock…</button>
              {picked.size > BULK_CHECKER_ABOVE ? (
                <span className="ops-confirm__warn">Over {BULK_CHECKER_ABOVE} riders: a second admin must approve.</span>
              ) : null}
            </span>
          ) : null}
        </TableToolbar>

        {page === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading riders</span>
            <Skeleton kind="row" count={8} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState title="The list could not be loaded" detail={`${error} This is not the same as there being no riders.`} onRetry={() => void load()} />
          </div>
        ) : rows.length === 0 ? (
          <Empty title="No riders match" detail={active ? 'Try fewer filters.' : 'Nobody has ridden in this region yet.'} />
        ) : (
          <DataTable
            caption="Riders" rows={rows} columns={columns} rowKey={(r) => r.id} density={density}
            onRow={setPreview} selectedKey={preview?.id ?? null}
          />
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
                {RIDER_PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </nav>
        ) : null}
      </Panel>

      <Drawer
        open={preview !== null}
        title={preview ? riderName(preview.user_details, preview.id) : ''}
        onClose={() => setPreview(null)}
        footer={preview ? <ButtonLink href={`/riders/${preview.id}`} variant="primary" size="sm">Open rider</ButtonLink> : undefined}
      >
        {preview && (
          <Facts>
            <Fact label="Rider">#{preview.id}</Fact>
            <Fact label="State"><StatePills r={preview} /></Fact>
            <Fact label="Phone">{preview.user_details?.phone_number ?? '—'}</Fact>
            <Fact label="City">{preview.city?.name ?? 'No trips yet'}</Fact>
            <Fact label="Trips">{preview.trips_completed ?? 0} completed of {preview.trips_total ?? 0}</Fact>
            <Fact label="Rating">{preview.rating ? Number(preview.rating).toFixed(2) : '—'}</Fact>
            <Fact label="Last trip">{cityTime(preview.last_trip_at, preview.city?.timezone, { zone: true })}</Fact>
            <Fact label="Joined">{cityTime(preview.joined_at, preview.city?.timezone, { zone: true })}</Fact>
          </Facts>
        )}
      </Drawer>

      {bulk && (
        <RiderBulkDrawer
          action={bulk}
          ids={[...picked]}
          onClose={() => setBulk(null)}
          onDone={() => { setPicked(new Set()); void load(); }}
        />
      )}
    </>
  );
}

export default function RidersPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <RidersInner />
    </Suspense>
  );
}
