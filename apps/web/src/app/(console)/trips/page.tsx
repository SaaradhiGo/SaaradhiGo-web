'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { can, currentScope, useAdminAccess, withScope } from '@/lib/adminScope';
import { timeZoneFor } from '@/lib/consoleTime';
import {
  BULK_CHECKER_ABOVE, DEFAULT_FILTERS, PAGE_SIZES, SORT_OPTIONS, STATUS_OPTIONS,
  type ActionKey, type ApprovalBody, type TripActions, type TripFilters, activeFilterCount,
  canSeeMoneyColumns, cityTime, filtersFromSearch, filtersToQuery, formatMinor, formatWhole,
  interpretWrite, newIdempotencyKey, tripsApiPath, visibleActions, words,
} from '@/lib/trips';
import { type TripHit, isUsableTerm, searchPath } from '@/lib/search';
import { downloadCsv, fetchAllPages, parseRef, toCsv, todayIn, useViewCounts } from '@/lib/listViews';
import { ActionDrawer } from '@/components/console/TripActionDrawer';
import { PageLink } from '@/components/console/PageLink';
import { Revealable } from '@/components/console/Revealable';
import { ListPage, type FilterChip, type ListColumn } from '@/components/console/kit/ListPage';
import { History, RecordPanel, RecordStat, type HistoryEntry } from '@/components/console/kit/RecordPanel';
import { StatusChip, type ChipTone } from '@/components/console/kit/StatusChip';
import {
  ActionNotice, MoreFilters, RecordFacts, RecordFailed, RecordLoading, RecordSection,
} from '@/components/console/kit/ListBits';
import { Drawer, Fact, Facts, Skeleton } from '@/components/console/ui';

/**
 * Trips: find one, or a set of them, and act, with the trip beside the list
 * (design board B).
 *
 * Every filter is SERVER-SIDE and lives in the URL, so a count is the real
 * count, a page is the real page, and the Command Centre can link straight
 * to "stale trips in Hyderabad". The search box finds a trip by its T- id,
 * or a rider's latest trips by their phone (the server's trip search).
 * Times are in each trip's own city (the server sends the zone), and money
 * is shown only to the roles that work with it: finance, and the city ops
 * who run the trips; whole units in the list, exact in the record.
 *
 * Bulk cancel and flag act on the ticked rows. Over 50 rows the server
 * sends the action to a second admin to approve, and the bar says so
 * before the operator presses anything.
 */
type TripRow = {
  id: number;
  status?: string;
  user?: string | null;
  driver_name?: string | null;
  driver_id?: number | null;
  /** "T-881230": the ID an operator reads, types and is told. */
  ref?: string;
  /** Locality only ("Banjara Hills"); the full address is behind the logged reveal. */
  pickup_locality?: string | null;
  drop_locality?: string | null;
  stuck_reason?: string | null;
  stuck_minutes?: number | null;
  currency?: string | null;
  charged_fare_minor?: number | null;
  final_fare_minor?: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
  requested_vehicle_type?: string | null;
  requested_at?: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
  city?: { code: string; name: string; timezone: string } | null;
  has_sos?: boolean;
  has_ticket?: boolean;
  flagged?: boolean;
  stale?: boolean;
  stale_reason?: string | null;
};

type TripDetail = {
  id: number;
  status: string | null;
  pickup: { address: string | null };
  destination: { address: string | null };
  timeline: Record<string, string | null>;
  rider: { user_id: number; phone_number: string | null; full_name: string | null; rating: string | null } | null;
  driver: { driver_id: number; phone_number: string | null; full_name: string | null } | null;
  vehicle: { type: string | null; vehicle_number: string | null } | null;
  fare: { payment_method: string | null; payment_status: string | null; estimated_distance_km: string | null; actual_distance_km: string | null };
  currency?: string | null;
  city?: { code: string; name: string; timezone: string } | null;
  timeline_events?: Array<{ event: string; at: string | null; actor: { type: string; id: number | null } | null; detail?: string | null; created_by?: { label: string; role: string } | null }>;
  fare_minor?: {
    currency: string; estimated_minor: number | null; final_minor: number | null; charged_minor: number;
    cancellation_fee_minor: number; tax_minor: number | null;
  };
  payment_summary?: {
    currency: string; method: string | null; status: string | null; paid_minor: number;
    refunded_minor: number; refundable_minor: number; adjustments_minor: number;
  };
  sos_events: Array<{ id: number; status: string | null; created_at: string | null }>;
  support_tickets?: Array<{ id: number; status: string; issue_type: string; created_at: string | null }>;
  flags?: Array<{ id: number; reason: string; note: string; active: boolean; created_at: string | null }>;
  approval_requests?: Array<{ id: number; action_key: string; status: string; amount: number | null; currency: string; requested_at: string | null }>;
  stale?: { is_stale: boolean; reason: string | null };
  actions?: TripActions;
};

type Page = { count: number; page: number; total_pages: number; results: TripRow[] };

const STUCK_WORDS: Record<string, string> = {
  overrun: 'running over',
  no_location: 'no location',
  not_started: 'not started',
};
const ACTIVE = ['requested', 'accepted', 'reached', 'in_progress'];
const STATUS_TONE: Record<string, ChipTone> = {
  completed: 'good', cancelled: 'neutral', requested: 'info', accepted: 'info', reached: 'info', in_progress: 'info',
};
const STATUS_WORD: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(([v, l]) => [v, l]));
const PAYMENT_METHODS = ['cash', 'online', 'wallet', 'deferred'];
const CANCEL_REASONS: Record<string, string> = {
  stale: 'Trip is stale (no progress)', duplicate: 'Duplicate booking', no_driver: 'No driver is coming',
  safety: 'Safety concern', fraud_suspicion: 'Suspected fraud', other: 'Other (note required)',
};
const FLAG_REASONS: Record<string, string> = {
  fraud_suspicion: 'Fraud suspicion', safety: 'Safety', dispute: 'Dispute',
};
const ACTION_LABEL: Record<ActionKey, string> = {
  cancel: 'Cancel trip…', refund: 'Refund…', adjust: 'Adjust fare…', flag: 'Flag…', note: 'Add note…',
};
const EVENT_LABEL: Record<string, string> = {
  requested: 'Requested', accepted: 'Driver accepted', arrived: 'Driver arrived', started: 'Trip started',
  completed: 'Completed', cancelled: 'Cancelled', driver_withdrew: 'Driver withdrew', stale_flagged: 'Flagged stale',
  trip_cancelled: 'Operator cancelled', trip_flagged: 'Operator flagged', trip_unflagged: 'Flag cleared',
  trip_note_added: 'Internal note', trip_refunded: 'Refund recorded', trip_fare_adjusted: 'Fare adjusted',
};
const TIMELINE_LABEL: Record<string, string> = {
  requested_at: 'Requested', accepted_at: 'Accepted', reached_at: 'Driver arrived',
  started_at: 'Started', completed_at: 'Completed', cancelled_at: 'Cancelled',
};

type BulkAction = 'cancel' | 'flag';
type BulkResult = { results: Array<{ id: number; result: string }>; counts: Record<string, number> };

type View = 'all' | 'active' | 'stuck' | 'sos' | 'cancelled' | 'unfulfilled';
const VIEW_LABELS: Array<[View, string]> = [
  ['all', 'All'], ['active', 'Active now'], ['stuck', 'Stuck'], ['sos', 'With SOS'],
  ['cancelled', 'Cancelled today'], ['unfulfilled', 'Unfulfilled today'],
];

function presetFor(view: View, today: string): Partial<TripFilters> {
  switch (view) {
    case 'active': return { status: [...ACTIVE] };
    case 'stuck': return { stuck: true };
    case 'sos': return { hasSos: true };
    case 'cancelled': return { status: ['cancelled'], dateFrom: today, dateTo: today };
    // Cancelled today before any driver accepted: the overview's "unfulfilled".
    case 'unfulfilled': return { status: ['cancelled'], unaccepted: true, dateFrom: today, dateTo: today };
    default: return {};
  }
}

function viewOf(f: TripFilters, today: string): View {
  if (f.stuck) return 'stuck';
  if (f.hasSos) return 'sos';
  const only = (s: string) => f.status.length === 1 && f.status[0] === s && f.dateFrom === today && f.dateTo === today;
  if (only('cancelled')) return f.unaccepted ? 'unfulfilled' : 'cancelled';
  if (f.status.length === ACTIVE.length && ACTIVE.every((s) => f.status.includes(s))) return 'active';
  return 'all';
}

/** "Banjara Hills → Madhapur", from the localities the server derives. */
function routeOf(t: TripRow): string {
  const from = t.pickup_locality || null;
  const to = t.drop_locality || null;
  if (!from && !to) return '—';
  return `${from ?? '—'} → ${to ?? '—'}`;
}

const driverOf = (t: TripRow) => t.driver_name || (t.driver_id ? `Driver #${t.driver_id}` : null);

/** A search hit as a list row: what the search answers, nothing invented. */
function rowFromHit(h: TripHit): TripRow {
  const tz = timeZoneFor(h.city_code);
  return {
    id: h.id, ref: `T-${h.id}`, status: h.status, requested_at: h.requested_at ?? undefined,
    user: h.rider ? (h.rider.full_name?.trim() || h.rider.phone) : null,
    driver_name: h.driver ? (h.driver.full_name?.trim() || h.driver.phone) : null,
    driver_id: h.driver?.id ?? null,
    city: h.city_code ? { code: h.city_code, name: h.city_code, timezone: tz ?? '' } : null,
  };
}

function TripStatus({ t }: { t: TripRow }) {
  const s = t.status ?? '';
  return (
    <span className="ops-chips">
      <StatusChip tone={STATUS_TONE[s] ?? 'neutral'}>{STATUS_WORD[s] ?? words(s)}</StatusChip>
      {t.stuck_reason ? <StatusChip tone="caution">Stuck · {STUCK_WORDS[t.stuck_reason] ?? words(t.stuck_reason)}</StatusChip>
        : t.stale ? <StatusChip tone="caution">Stale</StatusChip> : null}
      {t.has_sos ? <StatusChip tone="critical">SOS</StatusChip> : null}
      {t.flagged ? <StatusChip tone="caution">Flagged</StatusChip> : null}
      {t.has_ticket ? <StatusChip tone="info">Ticket</StatusChip> : null}
    </span>
  );
}

function TripsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const filters = useMemo(() => filtersFromSearch(new URLSearchParams(search.toString())), [search]);
  const q = (search.get('q') ?? '').trim().slice(0, 40);

  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TripFilters>(filters);
  const [term, setTerm] = useState(q);
  const [open, setOpen] = useState<TripRow | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'pending' | 'done' } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reloads, setReloads] = useState(0);
  useEffect(() => setDraft(filters), [filters]);
  useEffect(() => setTerm(q), [q]);

  const showMoney = canSeeMoneyColumns(access);
  const mayWrite = can(access, 'trip.write');
  const cities = (access?.scopes ?? []).filter((s) => s.kind === 'city');
  // "Today" is the selected place's own day (UTC when the place spans zones).
  const today = todayIn(timeZoneFor(filters.scope || currentScope(access)?.code));
  const view = q ? 'all' : viewOf(filters, today);
  const scoped = useCallback((path: string) => (filters.scope ? path : withScope(path)), [filters.scope]);

  const load = useCallback(async () => {
    setPage(null);
    setError(null);
    try {
      if (q) {
        const body = await api.get<{ results: TripHit[] }>(searchPath('trips', q, 20));
        const hits = (body?.results ?? []).map(rowFromHit);
        setPage({ count: hits.length, page: 1, total_pages: 1, results: hits });
      } else {
        setPage(await api.get<Page>(scoped(tripsApiPath(filters))));
      }
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the trips.');
      setPage({ count: 0, page: 1, total_pages: 1, results: [] });
    }
  }, [filters, q, scoped]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => setPicked([]), [filters, q]);

  const countPaths = useMemo(() => Object.fromEntries(VIEW_LABELS.map(([key]) => [
    key, scoped(tripsApiPath({ ...DEFAULT_FILTERS, scope: filters.scope, ...presetFor(key, today) })),
  ])), [filters.scope, scoped, today]);
  const counts = useViewCounts(countPaths, reloads);

  const go = (next: TripFilters, nextQ = '') => {
    const query = new URLSearchParams(filtersToQuery(next));
    if (nextQ) query.set('q', nextQ);
    const s = query.toString();
    router.push(s ? `/trips?${s}` : '/trips');
  };
  const apply = (patch: Partial<TripFilters>) => go({ ...draft, ...patch, page: 1 });
  const setView = (key: string) => go({
    ...DEFAULT_FILTERS, scope: filters.scope, pageSize: filters.pageSize, ...presetFor(key as View, today),
  });
  const refresh = () => { void load(); setReloads((n) => n + 1); };
  const find = () => {
    const raw = term.trim();
    if (!raw) { go(filters); return; }
    const id = parseRef(raw, 'T');
    if (id !== null && /^(t|#)/i.test(raw)) { go({ ...DEFAULT_FILTERS, scope: filters.scope, id: String(id) }); return; }
    if (!isUsableTerm(raw)) return;
    go({ ...DEFAULT_FILTERS, scope: filters.scope }, raw);
  };
  const rows = page?.results ?? [];

  const chips: FilterChip[] = [];
  const drop = (patch: Partial<TripFilters>) => () => go({ ...filters, ...patch, page: 1 });
  if (q) chips.push({ key: 'q', label: `Search: ${q}`, onRemove: () => go(filters) });
  filters.status.forEach((s) => chips.push({
    key: `st-${s}`, label: STATUS_WORD[s] ?? s, onRemove: drop({ status: filters.status.filter((x) => x !== s) }),
  }));
  if (filters.dateFrom || filters.dateTo) {
    chips.push({ key: 'date', label: filters.dateFrom === filters.dateTo ? `On ${filters.dateFrom}` : `${filters.dateFrom || '…'} to ${filters.dateTo || '…'}`, onRemove: drop({ dateFrom: '', dateTo: '' }) });
  }
  if (filters.scope) chips.push({ key: 'scope', label: `City: ${cities.find((c) => c.code === filters.scope)?.name ?? filters.scope}`, onRemove: drop({ scope: '' }) });
  if (filters.paymentMethod) chips.push({ key: 'pay', label: `Paid by ${filters.paymentMethod}`, onRemove: drop({ paymentMethod: '' }) });
  if (filters.vehicleType) chips.push({ key: 'veh', label: `Vehicle: ${filters.vehicleType}`, onRemove: drop({ vehicleType: '' }) });
  if (filters.stuck) chips.push({ key: 'stuck', label: 'Stuck', onRemove: drop({ stuck: false }) });
  if (filters.stale) chips.push({ key: 'stale', label: 'Stale', onRemove: drop({ stale: false }) });
  if (filters.flagged) chips.push({ key: 'flagged', label: 'Flagged', onRemove: drop({ flagged: false }) });
  if (filters.hasSos) chips.push({ key: 'sos', label: 'Had an SOS', onRemove: drop({ hasSos: false }) });
  if (filters.id) chips.push({ key: 'id', label: `T-${filters.id}`, onRemove: drop({ id: '' }) });

  const columns: ListColumn<TripRow>[] = [
    { key: 'id', label: 'Trip', primary: true, sortKey: 'id', render: (t) => <span className="sg-num">{t.ref ?? `T-${t.id}`}</span> },
    { key: 'status', label: 'Status', sortKey: 'status', render: (t) => <TripStatus t={t} /> },
    { key: 'city', label: 'City', render: (t) => t.city?.name ?? '—' },
    { key: 'rider', label: 'Rider', render: (t) => t.user || '—' },
    { key: 'driver', label: 'Driver', render: (t) => driverOf(t) ?? <span className="muted">Unassigned</span> },
    { key: 'route', label: 'From → to', render: (t) => { const r = routeOf(t); return <span title={r}>{r}</span>; } },
    ...(showMoney ? [{
      key: 'fare', label: 'Fare', num: true, sortKey: 'fare',
      render: (t: TripRow) => (
        <>
          {formatWhole(t.charged_fare_minor ?? null, t.currency)}
          {t.final_fare_minor == null && t.status !== 'completed' && t.charged_fare_minor != null ? <span className="muted"> est.</span> : null}
        </>
      ),
    }] : []),
    { key: 'time', label: 'Requested', num: true, sortKey: 'requested_at', render: (t) => cityTime(t.requested_at, t.city?.timezone, { zone: true }) },
  ];

  async function exportView() {
    setExporting(true);
    try {
      const { rows: all, truncated } = q
        ? { rows, truncated: false }
        : await fetchAllPages<TripRow>((p, size) => scoped(tripsApiPath({ ...filters, page: p, pageSize: size })));
      const header = ['Trip', 'Status', 'Stuck', 'City', 'Rider', 'Driver', 'From', 'To',
        ...(showMoney ? ['Fare', 'Currency', 'Payment'] : []), 'Requested'];
      const body = all.map((t) => [
        t.ref ?? `T-${t.id}`, STATUS_WORD[t.status ?? ''] ?? words(t.status),
        t.stuck_reason ? (STUCK_WORDS[t.stuck_reason] ?? t.stuck_reason) : '', t.city?.name ?? '',
        t.user ?? '', driverOf(t) ?? '', t.pickup_locality ?? '', t.drop_locality ?? '',
        ...(showMoney ? [formatWhole(t.charged_fare_minor ?? null, t.currency), t.currency ?? '', t.payment_method ?? ''] : []),
        cityTime(t.requested_at, t.city?.timezone, { zone: true }),
      ]);
      downloadCsv(`trips-${view}.csv`, toCsv(header, body));
      if (truncated) setNotice({ kind: 'done', text: `Exported the first ${all.length.toLocaleString('en-IN')} trips. Narrow the view to export the rest.` });
    } catch (err) {
      setNotice({ kind: 'done', text: err instanceof ApiError && err.fromServer ? err.message : 'The export did not complete.' });
    } finally {
      setExporting(false);
    }
  }

  const total = page?.count ?? null;
  const active = activeFilterCount(filters);
  const currentQuery = (() => {
    const s = new URLSearchParams(filtersToQuery({ ...filters, page: 1 }));
    if (q) s.set('q', q);
    return s.toString();
  })();

  return (
    <>
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
      <div className={open ? 'ops-split' : undefined}>
        <ListPage<TripRow>
          pageKey="trips"
          title="Trips"
          summary="Times are in each trip's own city."
          actionsSlot={(
            <form className="ops-search" role="search" aria-label="Find a trip" onSubmit={(e) => { e.preventDefault(); find(); }}>
              <label className="sr-only" htmlFor="trip-find">Find a trip by T- number or rider phone</label>
              <input id="trip-find" className="ops-select" value={term} placeholder="T-881230 or rider phone"
                onChange={(e) => setTerm(e.target.value)} size={24} />
              <button type="submit" className="sg-btn sg-btn--secondary sg-btn--sm">Find</button>
            </form>
          )}
          views={VIEW_LABELS.map(([key, label]) => ({ key, label, count: counts[key] ?? null }))}
          view={view}
          onView={setView}
          chips={chips}
          filterSlot={(
            <MoreFilters count={active}>
              <form className="ops-form" aria-label="Filter trips" onSubmit={(e) => { e.preventDefault(); apply({}); }}>
                <div className="ops-filters" role="group" aria-label="Status">
                  {STATUS_OPTIONS.map(([value, label]) => {
                    const on = draft.status.includes(value);
                    return (
                      <button key={value} type="button" className="ops-filter" aria-pressed={on}
                        onClick={() => apply({ status: on ? draft.status.filter((s) => s !== value) : [...draft.status, value] })}>{label}</button>
                    );
                  })}
                </div>
                <div className="ops-form__row">
                  <label className="ops-form__label" htmlFor="f-from">From</label>
                  <input id="f-from" type="date" className="ops-select" value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} />
                  <label className="ops-form__label" htmlFor="f-to">To</label>
                  <input id="f-to" type="date" className="ops-select" value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} />
                  {cities.length > 1 ? (
                    <>
                      <label className="ops-form__label" htmlFor="f-city">City</label>
                      <select id="f-city" className="ops-select" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
                        <option value="">All I hold</option>
                        {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </select>
                    </>
                  ) : null}
                  <label className="ops-form__label" htmlFor="f-pay">Payment</label>
                  <select id="f-pay" className="ops-select" value={draft.paymentMethod} onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value })}>
                    <option value="">Any</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <label className="ops-form__label" htmlFor="f-vehicle">Vehicle</label>
                  <input id="f-vehicle" className="ops-select" placeholder="e.g. sedan" value={draft.vehicleType} onChange={(e) => setDraft({ ...draft, vehicleType: e.target.value.trim() })} size={10} />
                  <label className="ops-form__label" htmlFor="f-id">Trip (T-…)</label>
                  <input id="f-id" className="ops-select" inputMode="numeric" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value.replace(/\D/g, '') })} size={8} />
                </div>
                <div className="ops-form__row">
                  <label className="ops-form__row"><input type="checkbox" checked={draft.stuck} onChange={(e) => apply({ stuck: e.target.checked })} /> Stuck only</label>
                  <label className="ops-form__row"><input type="checkbox" checked={draft.stale} onChange={(e) => apply({ stale: e.target.checked })} /> Stale only</label>
                  <label className="ops-form__row"><input type="checkbox" checked={draft.flagged} onChange={(e) => apply({ flagged: e.target.checked })} /> Flagged only</label>
                  <label className="ops-form__row"><input type="checkbox" checked={draft.hasSos} onChange={(e) => apply({ hasSos: e.target.checked })} /> Had an SOS</label>
                  <label className="ops-form__label" htmlFor="f-sort">Sort</label>
                  <select id="f-sort" className="ops-select" value={draft.ordering} onChange={(e) => apply({ ordering: e.target.value })}>
                    {SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <label className="ops-form__label" htmlFor="f-size">Per page</label>
                  <select id="f-size" className="ops-select" value={draft.pageSize} onChange={(e) => apply({ pageSize: Number(e.target.value) })}>
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm">Show trips</button>
                  <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => go(DEFAULT_FILTERS)} disabled={active === 0}>Clear</button>
                </div>
              </form>
            </MoreFilters>
          )}
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          total={total}
          page={q ? 1 : filters.page}
          pageSize={q ? Math.max(rows.length, 1) : filters.pageSize}
          onPage={(p) => go({ ...filters, page: p })}
          ordering={q ? undefined : filters.ordering}
          onOrdering={q ? undefined : (o) => go({ ...filters, ordering: o, page: 1 })}
          selectable={mayWrite}
          selected={picked}
          onSelected={(keys) => setPicked(keys.map(Number))}
          bulkActions={mayWrite ? [
            { key: 'cancel', label: 'Cancel…', onRun: () => setBulk('cancel') },
            { key: 'flag', label: 'Flag…', onRun: () => setBulk('flag') },
          ] : []}
          onExport={exporting ? undefined : () => void exportView()}
          onRow={setOpen}
          activeKey={open?.id ?? null}
          loading={page === null}
          error={error ? `${error} This is not the same as there being no trips.` : null}
          empty={q ? 'No trips found for that search.' : active ? 'No trips match. Try fewer filters, or a wider date range.' : 'Nothing has been booked in this region yet.'}
          currentQuery={currentQuery}
          onSavedView={(s) => router.push(s ? `/trips?${s}` : '/trips')}
        />
        {open ? (
          <TripRecord
            key={open.id}
            row={open}
            showMoney={showMoney}
            onClose={() => setOpen(null)}
            onChanged={(text, kind) => { setNotice({ text, kind }); refresh(); }}
          />
        ) : null}
      </div>

      {bulk && (
        <BulkDrawer
          action={bulk}
          ids={picked}
          onClose={() => setBulk(null)}
          onDone={() => { setPicked([]); refresh(); }}
        />
      )}
    </>
  );
}

function TripRecord({ row, showMoney, onClose, onChanged }: {
  row: TripRow; showMoney: boolean; onClose: () => void;
  onChanged: (text: string, kind: 'pending' | 'done') => void;
}) {
  const access = useAdminAccess();
  const [data, setData] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<ActionKey | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<TripDetail>(`/ride/admin/trips/${row.id}/`));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this trip.');
    }
  }, [row.id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <RecordFailed label="Trip" message={error} onRetry={() => void load()} onClose={onClose} />;
  if (!data) return <RecordLoading label="Trip" />;

  const tz = data.city?.timezone ?? row.city?.timezone ?? null;
  const when = (iso: string | null | undefined) => cityTime(iso, tz, { zone: true });
  const cur = data.fare_minor?.currency ?? data.currency ?? row.currency ?? 'INR';
  const exact = (v: number | null | undefined) => formatMinor(v ?? null, cur);
  const rail = visibleActions(data.actions, access);
  const target = { type: 'trip', id: data.id } as const;
  const riderName = data.rider?.full_name?.trim() || data.rider?.phone_number || 'the rider';
  const driverName = data.driver?.full_name?.trim() || (data.driver ? `Driver #${data.driver.driver_id}` : null);
  const pending = (data.approval_requests ?? []).filter((r) => r.status === 'requested');
  const state = data.status ?? row.status ?? '';

  const timeline: HistoryEntry[] = data.timeline_events && data.timeline_events.length > 0
    ? data.timeline_events.map((e) => ({
      at: cityTime(e.at, tz, { zone: true }),
      text: <>{EVENT_LABEL[e.event] ?? words(e.event)}{e.detail ? ` · ${e.detail}` : ''}</>,
      who: e.created_by?.label ?? (e.actor ? words(e.actor.type) : 'system'),
    }))
    : Object.entries(data.timeline).filter(([, v]) => v).map(([k, v]) => ({ at: when(v), text: TIMELINE_LABEL[k] ?? words(k) }));

  return (
    <>
      <RecordPanel
        label="Trip"
        title={row.ref ?? `T-${data.id}`}
        onClose={onClose}
        subtitle={<>{[data.city?.name ?? row.city?.name, routeOf(row)].filter(Boolean).join(' · ')} · requested {when(data.timeline.requested_at ?? row.requested_at)}</>}
        status={(
          <>
            <TripStatus t={{ ...row, status: state, has_sos: row.has_sos || data.sos_events.length > 0, stale: data.stale?.is_stale ?? row.stale }} />
            {pending.length ? <StatusChip tone="info">Waiting for a second approver</StatusChip> : null}
          </>
        )}
        actions={(
          <>
            {rail.map((key) => (
              <button key={key} type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setActing(key)}>{ACTION_LABEL[key]}</button>
            ))}
            <Link className="sg-btn sg-btn--ghost sg-btn--sm" href={`/trips/${data.id}`}>Open full trip</Link>
          </>
        )}
        tabs={[
          {
            key: 'summary', label: 'Summary', content: (
              <>
                <RecordFacts rows={[
                  ['Rider', data.rider ? (
                    <span key="r">
                      <PageLink page="riders" href={`/riders/${data.rider.user_id}`}>{data.rider.full_name?.trim() || `Rider #${data.rider.user_id}`}</PageLink>
                      {' '}<span className="ops-ref sg-num">R-{data.rider.user_id}</span>
                      {' · '}<Revealable value={data.rider.phone_number ?? '—'} label="rider phone" target={target} field="rider_phone" compact />
                    </span>
                  ) : '—'],
                  ['Driver', data.driver ? (
                    <span key="d">
                      <PageLink page="drivers" href={`/drivers/${data.driver.driver_id}`}>{driverName}</PageLink>
                      {' '}<span className="ops-ref sg-num">D-{data.driver.driver_id}</span>
                      {' · '}<Revealable value={data.driver.phone_number ?? '—'} label="driver phone" target={target} field="driver_phone" compact />
                    </span>
                  ) : 'Unassigned'],
                  ['Vehicle', data.vehicle ? [data.vehicle.type, data.vehicle.vehicle_number].filter(Boolean).join(' · ') || '—' : '—'],
                  ['Pickup', <Revealable key="p" value={data.pickup.address ?? row.pickup_locality ?? '—'} label="exact pickup address" target={target} field="pickup_address" />],
                  ['Drop', <Revealable key="dr" value={data.destination.address ?? row.drop_locality ?? '—'} label="exact drop address" target={target} field="destination_address" />],
                  ['Distance', data.fare.actual_distance_km ?? data.fare.estimated_distance_km ? `${data.fare.actual_distance_km ?? data.fare.estimated_distance_km} km${data.fare.actual_distance_km ? '' : ' (estimate)'}` : '—'],
                  data.stale?.is_stale ? ['Stale', words(data.stale.reason)] : null,
                  row.stuck_reason ? ['Stuck', `${STUCK_WORDS[row.stuck_reason] ?? words(row.stuck_reason)}${row.stuck_minutes ? ` · ${row.stuck_minutes} min` : ''}`] : null,
                ]} />
                {pending.map((r) => (
                  <p key={r.id} className="ops-confirm">
                    Waiting for a second approver · <PageLink page="approvals" href={`/approvals?id=${r.id}`}>APR-{r.id}</PageLink>
                    {' '}({words(r.action_key)}{r.amount != null && r.currency ? ` · ${formatMinor(r.amount, r.currency)}` : ''})
                  </p>
                ))}
                {(data.flags ?? []).filter((f) => f.active).length ? (
                  <RecordSection title="Flags">
                    <History entries={(data.flags ?? []).filter((f) => f.active).map((f) => ({ at: when(f.created_at), text: <>{words(f.reason)}{f.note ? ` · ${f.note}` : ''}</> }))} />
                  </RecordSection>
                ) : null}
              </>
            ),
          },
          { key: 'timeline', label: 'Timeline', content: <History entries={timeline} empty="No events recorded." /> },
          ...(showMoney ? [{
            key: 'money', label: 'Money', content: (
              <>
                <div className="ops-recstats">
                  <RecordStat label="Charged" value={exact(data.fare_minor?.charged_minor)} />
                  {data.payment_summary ? <RecordStat label="Refundable" value={exact(data.payment_summary.refundable_minor)} /> : null}
                </div>
                <RecordFacts rows={[
                  ['Estimated', exact(data.fare_minor?.estimated_minor)],
                  ['Final', exact(data.fare_minor?.final_minor)],
                  data.fare_minor?.cancellation_fee_minor ? ['Cancellation fee', exact(data.fare_minor.cancellation_fee_minor)] : null,
                  data.fare_minor?.tax_minor != null ? ['Tax', exact(data.fare_minor.tax_minor)] : null,
                  ['Payment', `${data.payment_summary?.method ?? data.fare.payment_method ?? '—'} · ${words(data.payment_summary?.status ?? data.fare.payment_status)}`],
                  data.payment_summary ? ['Paid', exact(data.payment_summary.paid_minor)] : null,
                  data.payment_summary ? ['Refunded', exact(data.payment_summary.refunded_minor)] : null,
                  data.payment_summary?.adjustments_minor ? ['Adjustments', exact(data.payment_summary.adjustments_minor)] : null,
                ]} />
                <p className="help">Amounts in {cur}.</p>
              </>
            ),
          }] : []),
          {
            key: 'support', label: 'Support', content: (
              <>
                {(data.support_tickets ?? []).length === 0 && data.sos_events.length === 0 ? <p className="ops-record__empty">No tickets or SOS on this trip.</p> : null}
                {(data.support_tickets ?? []).length ? (
                  <ul className="ops-reclist">
                    {(data.support_tickets ?? []).map((t) => (
                      <li key={t.id}>
                        <PageLink page="support" href={`/support/${t.id}`}><span className="sg-num">TKT-{t.id}</span></PageLink>
                        <span>{words(t.issue_type)}</span>
                        <StatusChip tone={t.status === 'CLOSED' ? 'good' : 'info'}>{t.status === 'CLOSED' ? 'Closed' : 'Open'}</StatusChip>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {data.sos_events.length ? (
                  <ul className="ops-reclist">
                    {data.sos_events.map((e) => (
                      <li key={e.id}>
                        <PageLink page="safety" href="/safety-ops"><span className="sg-num">SOS-{e.id}</span></PageLink>
                        <StatusChip tone={e.status === 'resolved' ? 'good' : 'critical'}>{words(e.status)}</StatusChip>
                        <span className="muted">{when(e.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ),
          },
        ]}
      />
      {acting && (
        <ActionDrawer
          action={acting}
          tripId={data.id}
          currency={cur}
          refundable={data.payment_summary?.refundable_minor ?? null}
          refundKey={data.actions?.refund_action_key ?? null}
          riderName={riderName}
          cancelReasons={data.actions?.cancel_reasons}
          flagReasons={data.actions?.flag_reasons}
          onClose={() => setActing(null)}
          onDone={(message, kind) => { onChanged(message, kind); void load(); }}
        />
      )}
    </>
  );
}

function BulkDrawer({ action, ids, onClose, onDone }: {
  action: BulkAction; ids: number[]; onClose: () => void; onDone: () => void;
}) {
  const [sent] = useState(ids);
  const [reason, setReason] = useState(action === 'cancel' ? 'stale' : 'dispute');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkResult | null>(null);
  const [key] = useState(newIdempotencyKey);
  const reasons = action === 'cancel' ? CANCEL_REASONS : FLAG_REASONS;
  const needsNote = action === 'cancel' && reason === 'other';

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = await api.post<ApprovalBody & { result?: BulkResult }>('/ride/admin/trips/bulk/', {
        action, trip_ids: sent, note, idempotency_key: key,
        ...(action === 'cancel' ? { reason_code: reason } : { reason }),
      });
      const result = interpretWrite(body, `${action === 'cancel' ? 'Cancelled' : 'Flagged'} — see each trip below.`);
      setOutcome(result.message);
      if (result.kind === 'done' && body?.result) setRows(body.result as BulkResult);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The bulk action did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      title={`${action === 'cancel' ? 'Cancel' : 'Flag'} ${sent.length} trip${sent.length === 1 ? '' : 's'}`}
      onClose={onClose}
      footer={outcome ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={busy || (needsNote && !note.trim())}>
            {busy ? 'Working…' : sent.length > BULK_CHECKER_ABOVE ? 'Send for approval' : action === 'cancel' ? 'Cancel trips' : 'Flag trips'}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {sent.length > BULK_CHECKER_ABOVE ? (
          <div className="ops-confirm"><b>Needs a second approver</b><span>More than {BULK_CHECKER_ABOVE} trips: nothing changes until a second admin approves.</span></div>
        ) : null}
        <div className="ops-filterset">
          <fieldset>
            <legend>Reason</legend>
            {Object.entries(reasons).map(([v, l]) => (
              <label key={v}><input type="radio" name="bulk-reason" value={v} checked={reason === v} onChange={() => setReason(v)} />{l}</label>
            ))}
          </fieldset>
        </div>
        <label className="ops-form__label" htmlFor="bulk-note">Note{needsNote ? ' (required)' : ''}</label>
        <textarea id="bulk-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        {action === 'cancel' ? <p className="help">In-progress and finished trips are skipped and listed. Cancelling never charges a fee.</p> : null}
        {error && <div className="alert-error" role="alert">{error}</div>}
        {outcome && <div className="alert-success" role="status">{outcome}</div>}
        {rows ? (
          <Facts>
            {rows.results.map((r) => <Fact key={r.id} label={`T-${r.id}`}>{words(r.result)}</Fact>)}
          </Facts>
        ) : null}
      </div>
    </Drawer>
  );
}

export default function TripsPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <TripsInner />
    </Suspense>
  );
}
