'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import {
  DEFAULT_RIDER_FILTERS, RIDER_PAGE_SIZES, RIDER_SORT_OPTIONS, TRIP_BANDS,
  type RiderActionKey, type RiderActions, type RiderFilters, activeRiderFilterCount, canBulkRiders,
  riderFiltersFromSearch, riderFiltersToQuery, riderName, ridersApiPath, tripBandValue, visibleRiderActions,
} from '@/lib/riders';
import { cityTime, formatMinor, words } from '@/lib/trips';
import { type RiderHit, isUsableTerm, searchPath } from '@/lib/search';
import { downloadCsv, fetchAllPages, parseRef, toCsv, useViewCounts } from '@/lib/listViews';
import { type BulkRiderAction, RiderActionDrawer, RiderBulkDrawer } from '@/components/console/RiderActionDrawer';
import { PageLink } from '@/components/console/PageLink';
import { Revealable } from '@/components/console/Revealable';
import { ListPage, type FilterChip, type ListColumn } from '@/components/console/kit/ListPage';
import { History, RecordPanel, RecordStat, type HistoryEntry } from '@/components/console/kit/RecordPanel';
import { StatusChip } from '@/components/console/kit/StatusChip';
import {
  ActionNotice, MoreFilters, RecordFacts, RecordFailed, RecordLoading, RecordSection,
} from '@/components/console/kit/ListBits';
import { Skeleton } from '@/components/console/ui';

/**
 * Riders: everybody who books, in the operator's scope, as a list with the
 * rider beside it (design board B).
 *
 * A rider's city is the city of their latest trip; that is how the server
 * decides who is in scope, and the City column says it. Every filter is
 * SERVER-SIDE and lives in the URL, so a count is the real count. The search
 * box finds a rider by R- number, phone or name (the server's rider search).
 * Contact details arrive masked; the reveal in the record is the logged way.
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

type AuditRow = { id: number; action: string; created_at: string | null; reason: string;
  created_by?: { label?: string; role?: string } | null };
type RiderDetail = {
  id: number;
  user_details: { id: number; full_name: string | null; phone_number: string | null; email: string | null; is_active: boolean };
  city: City;
  joined_at: string | null;
  last_trip_at: string | null;
  blocked: boolean;
  flagged: boolean;
  block: { active: boolean; reason_label?: string; note?: string; created_at?: string | null; created_by?: { label?: string } | null };
  flags: Array<{ id: number; reason: string; reason_label?: string; note: string; created_at: string | null; created_by?: { label?: string } | null }>;
  restrictions?: Array<{ id: number; kind: string; label: string; reason: string; set_at: string | null }>;
  wallet: { balances: Array<{ currency: string; balance_minor: number }> };
  trips: { total: number; by_status: Record<string, number>; recent: Array<{ id: number; status: string | null; requested_at: string | null; fare_minor: number | null; currency: string | null }> };
  tickets: { total: number; open: number; recent: Array<{ id: number; status: string; issue_type: string; trip_id: number | null; created_at: string | null }> };
  sos: { total: number; open: number; recent: Array<{ id: number; status: string; event_type: string; trip_id: number | null; created_at: string | null }> };
  ratings_summary: { rating: string; rating_count: number; low_rating: boolean };
  status_history: AuditRow[];
  notes: Array<{ id: number; body: string; created_at: string | null; created_by?: { label?: string } | null }>;
  approval_requests: Array<{ id: number; action_key: string; status: string; requested_at: string | null }>;
  audit_trail: AuditRow[];
  actions?: RiderActions;
};

type View = 'all' | 'blocked' | 'flagged';
const VIEWS: Array<{ key: View; label: string; preset: Partial<RiderFilters> }> = [
  { key: 'all', label: 'All', preset: {} },
  { key: 'blocked', label: 'Blocked', preset: { blocked: true } },
  { key: 'flagged', label: 'Flagged for review', preset: { flagged: true } },
];
const viewOf = (f: RiderFilters): View => (f.blocked ? 'blocked' : f.flagged ? 'flagged' : 'all');

const RAIL_LABEL: Record<RiderActionKey, string> = {
  block: 'Block…', unblock: 'Unblock…', flag: 'Flag…', unflag: 'Clear flags…',
  sign_out: 'Sign out everywhere…', note: 'Add note…',
};

function StateChips({ r }: { r: RiderRow }) {
  const chips = [
    r.blocked ? <StatusChip key="b" tone="caution">Blocked</StatusChip> : null,
    r.flagged ? <StatusChip key="f" tone="caution">Flagged</StatusChip> : null,
    r.low_rating ? <StatusChip key="l" tone="info">Low rating</StatusChip> : null,
    r.has_open_ticket ? <StatusChip key="t" tone="info">Open ticket</StatusChip> : null,
    r.had_sos ? <StatusChip key="s" tone="neutral">Had SOS</StatusChip> : null,
  ].filter(Boolean);
  return chips.length ? <span className="ops-chips">{chips}</span> : <StatusChip tone="good">Can book</StatusChip>;
}

const rowFromHit = (h: RiderHit): RiderRow => ({
  id: h.user.id, user_details: { full_name: h.user.full_name, phone_number: h.user.phone },
});

function RidersInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const filters = useMemo(() => riderFiltersFromSearch(new URLSearchParams(search.toString())), [search]);
  const q = (search.get('q') ?? '').trim().slice(0, 40);

  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RiderFilters>(filters);
  const [term, setTerm] = useState(q);
  const [open, setOpen] = useState<RiderRow | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [bulk, setBulk] = useState<BulkRiderAction | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'pending' | 'done' } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reloads, setReloads] = useState(0);
  useEffect(() => setDraft(filters), [filters]);
  useEffect(() => setTerm(q), [q]);

  const mayBulk = canBulkRiders(access);
  const cities = (access?.scopes ?? []).filter((s) => s.kind === 'city');
  const view = q ? 'all' : viewOf(filters);
  const scoped = useCallback((path: string) => (filters.scope ? path : withScope(path)), [filters.scope]);

  const load = useCallback(async () => {
    setPage(null);
    setError(null);
    try {
      if (q) {
        const body = await api.get<{ results: RiderHit[] }>(searchPath('riders', q, 20));
        const hits = (body?.results ?? []).map(rowFromHit);
        setPage({ count: hits.length, page: 1, total_pages: 1, results: hits });
      } else {
        setPage(await api.get<Page>(scoped(ridersApiPath(filters))));
      }
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the riders.');
      setPage({ count: 0, page: 1, total_pages: 1, results: [] });
    }
  }, [filters, q, scoped]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => setPicked([]), [filters, q]);

  const countPaths = useMemo(() => Object.fromEntries(VIEWS.map((v) => [
    v.key, scoped(ridersApiPath({ ...DEFAULT_RIDER_FILTERS, scope: filters.scope, ...v.preset })),
  ])), [filters.scope, scoped]);
  const counts = useViewCounts(countPaths, reloads);

  const go = (next: RiderFilters, nextQ = '') => {
    const query = new URLSearchParams(riderFiltersToQuery(next));
    if (nextQ) query.set('q', nextQ);
    const s = query.toString();
    router.push(s ? `/riders?${s}` : '/riders');
  };
  const apply = (patch: Partial<RiderFilters>) => go({ ...draft, ...patch, page: 1 });
  const setView = (key: string) => go({
    ...DEFAULT_RIDER_FILTERS, scope: filters.scope, pageSize: filters.pageSize,
    ...(VIEWS.find((v) => v.key === key)?.preset ?? {}),
  });
  const refresh = () => { void load(); setReloads((n) => n + 1); };
  const find = () => {
    const raw = term.trim();
    if (!raw) { go(filters); return; }
    const id = parseRef(raw, 'R');
    if (id !== null && /^(r|#)/i.test(raw)) { go({ ...DEFAULT_RIDER_FILTERS, scope: filters.scope, id: String(id) }); return; }
    if (!isUsableTerm(raw)) return;
    go({ ...DEFAULT_RIDER_FILTERS, scope: filters.scope }, raw);
  };
  const rows = page?.results ?? [];

  const chips: FilterChip[] = [];
  const drop = (patch: Partial<RiderFilters>) => () => go({ ...filters, ...patch, page: 1 });
  if (q) chips.push({ key: 'q', label: `Search: ${q}`, onRemove: () => go(filters) });
  if (filters.scope) chips.push({ key: 'scope', label: `City: ${cities.find((c) => c.code === filters.scope)?.name ?? filters.scope}`, onRemove: drop({ scope: '' }) });
  if (filters.blocked) chips.push({ key: 'blocked', label: 'Blocked', onRemove: drop({ blocked: false }) });
  if (filters.flagged) chips.push({ key: 'flagged', label: 'Flagged', onRemove: drop({ flagged: false }) });
  if (filters.lowRating) chips.push({ key: 'low', label: 'Low rating', onRemove: drop({ lowRating: false }) });
  if (filters.hasOpenTicket) chips.push({ key: 'ticket', label: 'Open ticket', onRemove: drop({ hasOpenTicket: false }) });
  if (filters.hadSos) chips.push({ key: 'sos', label: 'Raised an SOS', onRemove: drop({ hadSos: false }) });
  if (filters.tripsMin || filters.tripsMax) {
    const band = TRIP_BANDS.find(([min, max]) => min === filters.tripsMin && max === filters.tripsMax);
    chips.push({ key: 'trips', label: `Completed trips: ${band ? band[2].toLowerCase() : `${filters.tripsMin || '0'} to ${filters.tripsMax || 'any'}`}`, onRemove: drop({ tripsMin: '', tripsMax: '' }) });
  }
  if (filters.joinedFrom || filters.joinedTo) chips.push({ key: 'joined', label: `Joined ${filters.joinedFrom || '…'} to ${filters.joinedTo || '…'}`, onRemove: drop({ joinedFrom: '', joinedTo: '' }) });
  if (filters.lastTripFrom || filters.lastTripTo) chips.push({ key: 'last', label: `Last trip ${filters.lastTripFrom || '…'} to ${filters.lastTripTo || '…'}`, onRemove: drop({ lastTripFrom: '', lastTripTo: '' }) });
  if (filters.id) chips.push({ key: 'id', label: `R-${filters.id}`, onRemove: drop({ id: '' }) });

  const columns: ListColumn<RiderRow>[] = [
    {
      key: 'id', label: 'Rider', primary: true, sortKey: 'id',
      render: (r) => <span>{riderName(r.user_details, r.id)} <span className="ops-ref sg-num">R-{r.id}</span></span>,
    },
    { key: 'state', label: 'State', render: (r) => (q ? <span className="muted">—</span> : <StateChips r={r} />) },
    { key: 'city', label: 'City', render: (r) => r.city?.name ?? <span className="muted">No trips</span> },
    { key: 'trips', label: 'Trips', num: true, sortKey: 'trips', render: (r) => (r.trips_completed ?? (q ? '—' : 0)) },
    { key: 'rating', label: 'Rating', num: true, sortKey: 'rating', render: (r) => (r.rating ? Number(r.rating).toFixed(2) : '—') },
    { key: 'last', label: 'Last trip', num: true, sortKey: 'last_trip', render: (r) => cityTime(r.last_trip_at, r.city?.timezone, { zone: true }) },
    { key: 'joined', label: 'Joined', num: true, sortKey: 'joined', render: (r) => cityTime(r.joined_at, r.city?.timezone) },
  ];

  async function exportView() {
    setExporting(true);
    try {
      const { rows: all, truncated } = q
        ? { rows, truncated: false }
        : await fetchAllPages<RiderRow>((p, size) => scoped(ridersApiPath({ ...filters, page: p, pageSize: size })));
      const header = ['Rider', 'Name', 'Phone (masked)', 'Blocked', 'Flagged', 'City', 'Completed trips', 'Rating', 'Last trip', 'Joined'];
      const body = all.map((r) => [
        `R-${r.id}`, riderName(r.user_details, r.id), r.user_details?.phone_number ?? '',
        r.blocked ? 'Yes' : 'No', r.flagged ? 'Yes' : 'No', r.city?.name ?? '', r.trips_completed ?? '',
        r.rating ?? '', cityTime(r.last_trip_at, r.city?.timezone, { zone: true }), cityTime(r.joined_at, r.city?.timezone, { zone: true }),
      ]);
      downloadCsv(`riders-${view}.csv`, toCsv(header, body));
      if (truncated) setNotice({ kind: 'done', text: `Exported the first ${all.length.toLocaleString('en-IN')} riders. Narrow the view to export the rest.` });
    } catch (err) {
      setNotice({ kind: 'done', text: err instanceof ApiError && err.fromServer ? err.message : 'The export did not complete.' });
    } finally {
      setExporting(false);
    }
  }

  const active = activeRiderFilterCount(filters);
  const currentQuery = (() => {
    const s = new URLSearchParams(riderFiltersToQuery({ ...filters, page: 1 }));
    if (q) s.set('q', q);
    return s.toString();
  })();

  return (
    <>
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
      <div className={open ? 'ops-split' : undefined}>
        <ListPage<RiderRow>
          pageKey="riders"
          title="Riders"
          summary="Contact details are masked. A rider's city is the city of their latest trip; times are shown in it."
          actionsSlot={(
            <form className="ops-search" role="search" aria-label="Find a rider" onSubmit={(e) => { e.preventDefault(); find(); }}>
              <label className="sr-only" htmlFor="rider-find">Find a rider by R- number, phone or name</label>
              <input id="rider-find" className="ops-select" value={term} placeholder="R-12, phone or name"
                onChange={(e) => setTerm(e.target.value)} size={24} />
              <button type="submit" className="sg-btn sg-btn--secondary sg-btn--sm">Find</button>
            </form>
          )}
          views={VIEWS.map((v) => ({ key: v.key, label: v.label, count: counts[v.key] ?? null }))}
          view={view}
          onView={setView}
          chips={chips}
          filterSlot={(
            <MoreFilters count={active}>
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
                  <select id="f-trips" className="ops-select" value={tripBandValue(draft)}
                    onChange={(e) => { const [min, max] = e.target.value.split('|'); setDraft({ ...draft, tripsMin: min, tripsMax: max }); }}>
                    {TRIP_BANDS.map(([min, max, label]) => <option key={label} value={`${min}|${max}`}>{label}</option>)}
                  </select>
                  <label className="ops-form__label" htmlFor="f-id">Rider (R-…)</label>
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
                  <label className="ops-form__label" htmlFor="f-size">Per page</label>
                  <select id="f-size" className="ops-select" value={draft.pageSize} onChange={(e) => apply({ pageSize: Number(e.target.value) })}>
                    {RIDER_PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm">Show riders</button>
                  <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => go(DEFAULT_RIDER_FILTERS)} disabled={active === 0}>Clear</button>
                </div>
              </form>
            </MoreFilters>
          )}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          total={page?.count ?? null}
          page={q ? 1 : filters.page}
          pageSize={q ? Math.max(rows.length, 1) : filters.pageSize}
          onPage={(p) => go({ ...filters, page: p })}
          ordering={q ? undefined : filters.ordering}
          onOrdering={q ? undefined : (o) => go({ ...filters, ordering: o, page: 1 })}
          selectable={mayBulk}
          selected={picked}
          onSelected={(keys) => setPicked(keys.map(Number))}
          bulkActions={mayBulk ? [
            { key: 'block', label: 'Block…', onRun: () => setBulk('block') },
            { key: 'unblock', label: 'Unblock…', onRun: () => setBulk('unblock') },
          ] : []}
          onExport={exporting ? undefined : () => void exportView()}
          onRow={setOpen}
          activeKey={open?.id ?? null}
          loading={page === null}
          error={error ? `${error} This is not the same as there being no riders.` : null}
          empty={q ? 'No rider found for that search.' : active ? 'No riders match. Try fewer filters.' : 'Nobody has ridden in this region yet.'}
          currentQuery={currentQuery}
          onSavedView={(s) => router.push(s ? `/riders?${s}` : '/riders')}
        />
        {open ? (
          <RiderRecord
            key={open.id}
            id={open.id}
            onClose={() => setOpen(null)}
            onChanged={(text, kind) => { setNotice({ text, kind }); refresh(); }}
          />
        ) : null}
      </div>

      {bulk && (
        <RiderBulkDrawer
          action={bulk}
          ids={picked}
          onClose={() => setBulk(null)}
          onDone={() => { setPicked([]); refresh(); }}
        />
      )}
    </>
  );
}

function RiderRecord({ id, onClose, onChanged }: {
  id: number; onClose: () => void; onChanged: (text: string, kind: 'pending' | 'done') => void;
}) {
  const access = useAdminAccess();
  const [data, setData] = useState<RiderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<RiderActionKey | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<RiderDetail>(`/rider/admin/${id}/`));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this rider.');
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <RecordFailed label="Rider" message={error} onRetry={() => void load()} onClose={onClose} />;
  if (!data) return <RecordLoading label="Rider" />;

  const name = riderName(data.user_details, data.id);
  const tz = data.city?.timezone ?? null;
  const when = (iso: string | null | undefined) => cityTime(iso, tz, { zone: true });
  const target = { type: 'rider', id: data.id } as const;
  const rail = visibleRiderActions(data.actions, access, { blocked: data.blocked, flagged: data.flagged });
  const waiting = data.approval_requests.filter((a) => a.status === 'requested');
  const history: HistoryEntry[] = [...data.status_history, ...data.audit_trail]
    .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .map((r) => ({ at: when(r.created_at), text: <>{words(r.action)}{r.reason ? ` · ${r.reason}` : ''}</>, who: r.created_by?.label ?? null }));

  return (
    <>
      <RecordPanel
        label="Rider"
        title={name}
        refId={`R-${data.id}`}
        onClose={onClose}
        subtitle={data.city ? `${data.city.name} (latest trip)` : 'No trips yet'}
        status={(
          <>
            {data.blocked ? <StatusChip tone="caution">Blocked</StatusChip> : <StatusChip tone="good">Can book</StatusChip>}
            {data.flagged ? <StatusChip tone="caution">Flagged</StatusChip> : null}
            {data.ratings_summary.low_rating ? <StatusChip tone="info">Low rating</StatusChip> : null}
            {data.user_details.is_active ? null : <StatusChip tone="neutral">Account inactive</StatusChip>}
            {waiting.length ? <StatusChip tone="info">Waiting for a second approver</StatusChip> : null}
          </>
        )}
        actions={(
          <>
            {rail.map((key) => (
              <button key={key} type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setAction(key)}>{RAIL_LABEL[key]}</button>
            ))}
            <span className="ops-record__call">
              Call <Revealable value={data.user_details.phone_number ?? '—'} label="rider phone" target={target} field="phone_number" compact
                render={(v) => (v ? <a href={`tel:${String(v)}`}>{String(v)}</a> : 'Not on file')} />
            </span>
            <Link className="sg-btn sg-btn--ghost sg-btn--sm" href={`/riders/${data.id}`}>Open full page</Link>
          </>
        )}
        tabs={[
          {
            key: 'overview', label: 'Overview', content: (
              <>
                <div className="ops-recstats">
                  <RecordStat label="Rating" value={Number(data.ratings_summary.rating) > 0 ? Number(data.ratings_summary.rating).toFixed(2) : '—'}
                    note={`${data.ratings_summary.rating_count.toLocaleString('en-IN')} rating${data.ratings_summary.rating_count === 1 ? '' : 's'}`} />
                  <RecordStat label="Trips" value={data.trips.total.toLocaleString('en-IN')} />
                  <RecordStat label="Open tickets" value={data.tickets.open} />
                </div>
                {data.block.active ? (
                  <div className="ops-confirm">
                    <b>Blocked: {data.block.reason_label ?? ''}</b>
                    <span>{data.block.note || 'No note.'} {data.block.created_at ? `(${when(data.block.created_at)}${data.block.created_by?.label ? `, ${data.block.created_by.label}` : ''})` : ''}</span>
                  </div>
                ) : null}
                {data.flags.map((f) => (
                  <div key={f.id} className="ops-confirm">
                    <b>Flagged: {f.reason_label ?? words(f.reason)}</b>
                    <span>{f.note || 'No note.'} ({when(f.created_at)}{f.created_by?.label ? `, ${f.created_by.label}` : ''})</span>
                  </div>
                ))}
                {(data.restrictions ?? []).map((r) => (
                  <div key={r.id} className="ops-confirm"><b>{r.label}</b><span>{r.reason || 'No note.'} ({when(r.set_at)})</span></div>
                ))}
                {waiting.map((r) => (
                  <p key={r.id} className="ops-confirm">
                    Waiting for a second approver · <PageLink page="approvals" href={`/approvals?id=${r.id}`}>APR-{r.id}</PageLink> ({words(r.action_key)})
                  </p>
                ))}
                <RecordFacts rows={[
                  ['Phone', <Revealable key="p" value={data.user_details.phone_number ?? '—'} label="rider phone" target={target} field="phone_number" />],
                  data.user_details.email ? ['Email', <Revealable key="e" value={data.user_details.email} label="rider email" target={target} field="email" />] : null,
                  ['Wallet', data.wallet.balances.length ? data.wallet.balances.map((b) => formatMinor(b.balance_minor, b.currency)).join(' · ') : 'No wallet yet'],
                  ['Last trip', when(data.last_trip_at)],
                  ['Joined', when(data.joined_at)],
                ]} />
                <RecordSection title="Internal notes">
                  {data.notes.length === 0 ? <p className="ops-record__empty">No notes yet.</p> : (
                    <History entries={data.notes.map((n) => ({ at: when(n.created_at), text: n.body, who: n.created_by?.label ?? null }))} />
                  )}
                </RecordSection>
              </>
            ),
          },
          {
            key: 'trips', label: 'Trips', content: data.trips.total === 0 ? <p className="ops-record__empty">No trips yet.</p> : (
              <>
                <p className="help">{Object.entries(data.trips.by_status).map(([s, n]) => `${words(s)} ${n}`).join(' · ')}</p>
                <ul className="ops-reclist">
                  {data.trips.recent.map((t) => (
                    <li key={t.id}>
                      <PageLink page="trips" href={`/trips/${t.id}`}><span className="sg-num">T-{t.id}</span></PageLink>
                      <StatusChip tone={t.status === 'completed' ? 'good' : t.status === 'cancelled' ? 'neutral' : 'info'}>{words(t.status)}</StatusChip>
                      <span className="sg-num">{formatMinor(t.fare_minor, t.currency)}</span>
                      <span className="muted">{cityTime(t.requested_at, tz)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ),
          },
          {
            key: 'support', label: 'Support', content: (
              <>
                {data.tickets.total === 0 && data.sos.total === 0 ? <p className="ops-record__empty">No tickets or SOS.</p> : null}
                {data.tickets.recent.length ? (
                  <RecordSection title={`Tickets · ${data.tickets.open} open of ${data.tickets.total}`}>
                    <ul className="ops-reclist">
                      {data.tickets.recent.map((t) => (
                        <li key={t.id}>
                          <PageLink page="support" href={`/support/${t.id}`}><span className="sg-num">TKT-{t.id}</span></PageLink>
                          <span>{words(t.issue_type)}</span>
                          <StatusChip tone={t.status === 'CLOSED' ? 'good' : 'info'}>{t.status === 'CLOSED' ? 'Closed' : words(t.status.toLowerCase())}</StatusChip>
                          <span className="muted">{cityTime(t.created_at, tz)}</span>
                        </li>
                      ))}
                    </ul>
                  </RecordSection>
                ) : null}
                {data.sos.recent.length ? (
                  <RecordSection title={`SOS · ${data.sos.open} open of ${data.sos.total}`}>
                    <ul className="ops-reclist">
                      {data.sos.recent.map((s) => (
                        <li key={s.id}>
                          <PageLink page="safety" href="/safety-ops"><span className="sg-num">SOS-{s.id}</span></PageLink>
                          <StatusChip tone={s.status === 'resolved' ? 'good' : s.status === 'open' ? 'critical' : 'caution'}>{words(s.status)}</StatusChip>
                          {s.trip_id ? <PageLink page="trips" href={`/trips/${s.trip_id}`}><span className="sg-num">T-{s.trip_id}</span></PageLink> : null}
                          <span className="muted">{cityTime(s.created_at, tz)}</span>
                        </li>
                      ))}
                    </ul>
                  </RecordSection>
                ) : null}
              </>
            ),
          },
          { key: 'history', label: 'History', content: <History entries={history} empty="No status changes recorded." /> },
        ]}
      />
      {action && (
        <RiderActionDrawer
          action={action} riderId={data.id} riderName={name}
          blockReasons={data.actions?.block_reasons} flagReasons={data.actions?.flag_reasons}
          onClose={() => setAction(null)}
          onDone={(text, kind) => { onChanged(text, kind); void load(); }}
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
