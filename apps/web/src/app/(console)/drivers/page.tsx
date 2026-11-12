'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import {
  DEFAULT_DRIVER_FILTERS, DRIVER_PAGE_SIZES, DRIVER_SORT_OPTIONS, EXPIRY_WINDOWS,
  FALLBACK_SUSPEND_REASONS, KYC_LABEL, KYC_STATE_OPTIONS, RATING_BANDS, REVIEW_LABEL,
  type DriverActionKey, type DriverActions, type DriverFilters, activeDriverFilterCount, canBulkDrivers,
  driverFiltersFromSearch, driverFiltersToQuery, driverName, driversApiPath, queueApiPath,
  ratingBandValue, visibleDriverActions, waitingLabel, approvedCaveats,
} from '@/lib/drivers';
import {
  BULK_CHECKER_ABOVE, type ApprovalBody, cityTime, interpretWrite, newIdempotencyKey, words,
} from '@/lib/trips';
import { downloadCsv, fetchAllPages, toCsv, useViewCounts } from '@/lib/listViews';
import { DriverActionDrawer } from '@/components/console/DriverActionDrawer';
import { PageLink } from '@/components/console/PageLink';
import { Revealable } from '@/components/console/Revealable';
import { LedgerLink } from '@/components/console/finance';
import { ListPage, type FilterChip, type ListColumn } from '@/components/console/kit/ListPage';
import { History, RecordPanel, RecordStat, type HistoryEntry } from '@/components/console/kit/RecordPanel';
import { StatusChip, type ChipTone } from '@/components/console/kit/StatusChip';
import {
  ActionNotice, MoreFilters, RecordFacts, RecordFailed, RecordLoading, RecordSection, chipTone,
} from '@/components/console/kit/ListBits';
import { Drawer, Fact, Facts, Skeleton } from '@/components/console/ui';
import { marketDate } from '@/lib/consoleTime';

/**
 * Drivers: the fleet and the KYC queue, as a list with the driver beside it
 * (design board B).
 *
 * The saved views are the questions an ops person asks (who is online, who
 * is rated low, whose papers run out, who waits for KYC, who is suspended),
 * each with the server's own count. Every filter is SERVER-SIDE and lives in
 * the URL, so a count is the real count and the Command Centre can link
 * straight to "awaiting approval in Hyderabad" (`?approved=false&scope=IN-TG-HYD`).
 * Contact details arrive masked: the server never sends the number, and the
 * reveal in the record is the logged way to it.
 *
 * The KYC queue is the KYC Verifier's work list, longest-waiting first. The
 * DECISION is on the driver's own page, next to the documents.
 *
 * Bulk suspend and reinstate act on the ticked rows. Over 50 the server
 * sends the action to a second admin, and the bar says so up front.
 */
type City = { code: string; name: string; timezone: string } | null;

type DriverRow = {
  id: number;
  user_details?: { full_name?: string | null; phone_number?: string | null } | null;
  status?: string;
  approved?: boolean;
  kyc_state?: string;
  suspended?: boolean;
  flagged?: boolean;
  documents_expired?: boolean;
  online?: boolean;
  ratings?: string;
  total_trips?: number;
  home_city?: City;
  vehicle_type?: string | null;
  vehicle_number?: string | null;
  joined_at?: string | null;
  license_expiry?: string | null;
  waiting_since?: string | null;
  waiting_seconds?: number | null;
  checklist?: { country: string; missing: string[]; driver_documents: unknown[]; vehicle_documents: unknown[] };
  documents?: Array<{ key: string; present: boolean; review_state: string }>;
};

type Page = { count: number; page: number; total_pages: number; results: DriverRow[] };
type BulkAction = 'suspend' | 'reinstate';
type BulkResult = { results: Array<{ id: number; result: string }>; counts: Record<string, number> };

type AuditRow = { id: number; action: string; created_at: string | null; reason: string;
  created_by?: { label?: string; role?: string } | null };
type Doc = { key: string; label: string; owner: 'driver' | 'vehicle'; vehicle_id: number | null;
  present: boolean; review_state: string };
type DriverDetail = {
  id: number; status: string; approved: boolean; ratings: string; total_trips: number;
  license_expiry: string | null; upi_id: string | null;
  user: { id: number; phone_number: string | null; full_name: string | null; email: string | null; is_active: boolean | null };
  vehicles: Array<{ id: number; type: string | null; vehicle_number: string | null; status: string; is_active_vehicle: boolean }>;
  cancellations: { last_24h: number; last_7d: number; last_30d: number };
  recent_trips: Array<{ id: number; status: string | null; pickup_address: string | null; destination_address: string | null; requested_at: string | null }>;
  earnings: { lifetime: string; today: string; this_month: string; wallet_balance: string; currency?: string };
  home_city?: City;
  kyc_state?: string;
  documents_expired?: boolean;
  joined_at?: string | null;
  documents?: Doc[];
  approval_blockers?: Array<{ code: string; message: string }>;
  ratings_summary?: { average: string; count: number; distribution: Record<string, number> };
  counts?: { sos_total: number; sos_open: number; tickets_total: number; tickets_open: number };
  suspension?: { active: boolean; reason_label?: string; note?: string; created_at?: string | null;
    created_by?: { label?: string } | null; permanent?: boolean };
  status_history?: AuditRow[];
  notes?: Array<{ id: number; body: string; created_at: string | null; created_by?: { label?: string } | null }>;
  approval_requests?: Array<{ id: number; action_key: string; status: string; requested_at: string | null }>;
  audit_trail?: AuditRow[];
  actions?: DriverActions;
};

type View = 'all' | 'online' | 'low' | 'expiring' | 'kyc' | 'suspended';
const VIEWS: Array<{ key: View; label: string; preset: Partial<DriverFilters> }> = [
  { key: 'all', label: 'All drivers', preset: {} },
  { key: 'online', label: 'Online now', preset: { online: true } },
  { key: 'low', label: 'Low rating', preset: { lowRating: true } },
  { key: 'expiring', label: 'Documents expiring', preset: { expiringWithin: '30' } },
  { key: 'kyc', label: 'Waiting for KYC', preset: { tab: 'queue' } },
  { key: 'suspended', label: 'Suspended', preset: { suspended: true } },
];

function viewOf(f: DriverFilters): View {
  if (f.tab === 'queue') return 'kyc';
  if (f.suspended) return 'suspended';
  if (f.online) return 'online';
  if (f.expiringWithin === '30') return 'expiring';
  if (f.lowRating) return 'low';
  return 'all';
}

const RAIL_LABEL: Record<DriverActionKey, string> = {
  approve: 'Approve to drive', suspend: 'Suspend…', reinstate: 'Reinstate…', note: 'Add note…',
  deactivate: 'Deactivate permanently…',
};

const rating = (r: string | null | undefined) => (Number(r) > 0 ? Number(r).toFixed(2) : '—');

function NowChip({ d }: { d: { online?: boolean; status?: string; suspended?: boolean } }) {
  if (d.suspended) return <StatusChip tone="caution">Suspended</StatusChip>;
  if (d.online || d.status === 'online') return <StatusChip tone="good">Online</StatusChip>;
  if (d.status === 'on_trip' || d.status === 'busy') return <StatusChip tone="info">{words(d.status)}</StatusChip>;
  return <StatusChip tone="neutral">{d.status ? words(d.status) : 'Offline'}</StatusChip>;
}

function KycChips({ d }: { d: Parameters<typeof approvedCaveats>[0] }) {
  const [label, tone] = KYC_LABEL[d.kyc_state ?? ''] ?? [words(d.kyc_state), 'neutral'];
  return (
    <span className="ops-chips">
      <StatusChip tone={chipTone(tone)}>{label}</StatusChip>
      {d.documents_expired ? <StatusChip tone="caution">Expired</StatusChip> : null}
      {approvedCaveats({ ...d, documents_expired: false }).map((c) => <StatusChip key={c} tone="caution">{c}</StatusChip>)}
    </span>
  );
}

function DriversInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const filters = useMemo(() => driverFiltersFromSearch(new URLSearchParams(search.toString())), [search]);

  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DriverFilters>(filters);
  const [open, setOpen] = useState<DriverRow | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'pending' | 'done' } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reloads, setReloads] = useState(0);
  useEffect(() => setDraft(filters), [filters]);

  const view = viewOf(filters);
  const queue = view === 'kyc';
  const mayBulk = !queue && canBulkDrivers(access);
  const cities = (access?.scopes ?? []).filter((s) => s.kind === 'city');
  const scoped = useCallback((path: string) => (filters.scope ? path : withScope(path)), [filters.scope]);

  const load = useCallback(async () => {
    setPage(null);
    setError(null);
    try {
      setPage(await api.get<Page>(scoped(queue ? queueApiPath(filters) : driversApiPath(filters))));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the drivers.');
      setPage({ count: 0, page: 1, total_pages: 1, results: [] });
    }
  }, [filters, queue, scoped]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => setPicked([]), [filters]);

  const countPaths = useMemo(() => Object.fromEntries(VIEWS.map((v) => {
    const f = { ...DEFAULT_DRIVER_FILTERS, scope: filters.scope, ...v.preset };
    return [v.key, scoped(v.key === 'kyc' ? queueApiPath(f) : driversApiPath(f))];
  })), [filters.scope, scoped]);
  const counts = useViewCounts(countPaths, reloads);

  const go = (next: DriverFilters) => {
    const q = driverFiltersToQuery(next);
    router.push(q ? `/drivers?${q}` : '/drivers');
  };
  const apply = (patch: Partial<DriverFilters>) => go({ ...draft, ...patch, page: 1 });
  const setView = (key: string) => {
    const preset = VIEWS.find((v) => v.key === key)?.preset ?? {};
    go({ ...DEFAULT_DRIVER_FILTERS, scope: filters.scope, pageSize: filters.pageSize, ...preset });
  };
  const refresh = () => { void load(); setReloads((n) => n + 1); };
  const rows = page?.results ?? [];

  const chips: FilterChip[] = [];
  const drop = (patch: Partial<DriverFilters>) => () => go({ ...filters, ...patch, page: 1 });
  if (!queue) {
    filters.kycState.forEach((s) => chips.push({
      key: `kyc-${s}`, label: KYC_STATE_OPTIONS.find(([v]) => v === s)?.[1] ?? s,
      onRemove: drop({ kycState: filters.kycState.filter((x) => x !== s) }),
    }));
    if (filters.online) chips.push({ key: 'online', label: 'Online now', onRemove: drop({ online: false }) });
    if (filters.suspended) chips.push({ key: 'suspended', label: 'Suspended', onRemove: drop({ suspended: false }) });
    if (filters.flagged) chips.push({ key: 'flagged', label: 'Has a flagged trip', onRemove: drop({ flagged: false }) });
    if (filters.expiringWithin) chips.push({ key: 'exp', label: `Documents expiring within ${filters.expiringWithin} days`, onRemove: drop({ expiringWithin: '' }) });
    if (filters.ratingMin || filters.ratingMax) {
      const band = RATING_BANDS.find(([min, max]) => min === filters.ratingMin && max === filters.ratingMax);
      chips.push({ key: 'rating', label: band ? `Rating ${band[2].toLowerCase()}` : `Rating ${filters.ratingMin || '0'} to ${filters.ratingMax || '5'}`, onRemove: drop({ ratingMin: '', ratingMax: '' }) });
    }
    if (filters.vehicleType) chips.push({ key: 'veh', label: `Vehicle: ${filters.vehicleType}`, onRemove: drop({ vehicleType: '' }) });
    if (filters.joinedFrom || filters.joinedTo) chips.push({ key: 'joined', label: `Joined ${filters.joinedFrom || '…'} to ${filters.joinedTo || '…'}`, onRemove: drop({ joinedFrom: '', joinedTo: '' }) });
    if (filters.approved) chips.push({ key: 'approved', label: filters.approved === 'false' ? 'Not yet approved' : 'Approved', onRemove: drop({ approved: '' }) });
    if (filters.status) chips.push({ key: 'status', label: `Status: ${filters.status}`, onRemove: drop({ status: '' }) });
    if (filters.id) chips.push({ key: 'id', label: `D-${filters.id}`, onRemove: drop({ id: '' }) });
  }
  if (filters.scope) {
    chips.push({ key: 'scope', label: `City: ${cities.find((c) => c.code === filters.scope)?.name ?? filters.scope}`, onRemove: drop({ scope: '' }) });
  }

  const nameCell = (d: DriverRow) => (
    <span>{driverName(d.user_details, d.id)} <span className="ops-ref sg-num">D-{d.id}</span></span>
  );
  const columns: ListColumn<DriverRow>[] = queue ? [
    { key: 'id', label: 'Driver', primary: true, render: nameCell },
    { key: 'city', label: 'City', render: (d) => d.home_city?.name ?? '—' },
    { key: 'waiting', label: 'Waiting', num: true, render: (d) => waitingLabel(d.waiting_seconds) },
    {
      key: 'docs', label: 'Documents', render: (d) => {
        const docs = d.documents ?? [];
        return `${docs.filter((x) => x.present).length} of ${docs.length} on file`;
      },
    },
    {
      key: 'missing', label: 'Outstanding',
      render: (d) => (d.checklist?.missing.length
        ? <span className="muted">{d.checklist.missing.map(words).join(', ')}</span>
        : <StatusChip tone="good">Complete</StatusChip>),
    },
    { key: 'vehicle', label: 'Vehicle', render: (d) => d.vehicle_type ?? 'None' },
  ] : [
    { key: 'id', label: 'Driver', primary: true, sortKey: 'id', render: nameCell },
    { key: 'now', label: 'Now', render: (d) => <NowChip d={d} /> },
    { key: 'city', label: 'City', render: (d) => d.home_city?.name ?? '—' },
    { key: 'rating', label: 'Rating', num: true, sortKey: 'rating', render: (d) => rating(d.ratings) },
    { key: 'trips', label: 'Trips', num: true, sortKey: 'trips', render: (d) => (d.total_trips ?? 0).toLocaleString('en-IN') },
    { key: 'docs', label: 'Documents', render: (d) => <KycChips d={d} /> },
    { key: 'open', label: 'Open items', render: (d) => (d.flagged ? <StatusChip tone="caution">Flagged trip</StatusChip> : <span className="muted">—</span>) },
    { key: 'joined', label: 'Joined', num: true, sortKey: 'joined', render: (d) => cityTime(d.joined_at, d.home_city?.timezone) },
  ];

  async function exportView() {
    setExporting(true);
    try {
      const { rows: all, truncated } = await fetchAllPages<DriverRow>((p, size) => scoped(
        queue ? queueApiPath({ ...filters, page: p, pageSize: size }) : driversApiPath({ ...filters, page: p, pageSize: size })));
      const header = ['Driver', 'Name', 'Phone (masked)', 'Now', 'City', 'KYC', 'Rating', 'Trips', 'Vehicle', 'Joined'];
      const body = all.map((d) => [
        `D-${d.id}`, driverName(d.user_details, d.id), d.user_details?.phone_number ?? '',
        d.suspended ? 'Suspended' : d.online ? 'Online' : words(d.status), d.home_city?.name ?? '',
        KYC_LABEL[d.kyc_state ?? '']?.[0] ?? words(d.kyc_state), rating(d.ratings), d.total_trips ?? 0,
        [d.vehicle_type, d.vehicle_number].filter(Boolean).join(' '), cityTime(d.joined_at, d.home_city?.timezone, { zone: true }),
      ]);
      downloadCsv(`drivers-${view}.csv`, toCsv(header, body));
      if (truncated) setNotice({ kind: 'done', text: `Exported the first ${all.length.toLocaleString('en-IN')} drivers. Narrow the view to export the rest.` });
    } catch (err) {
      setNotice({ kind: 'done', text: err instanceof ApiError && err.fromServer ? err.message : 'The export did not complete.' });
    } finally {
      setExporting(false);
    }
  }

  const total = page?.count ?? null;
  const active = queue ? 0 : activeDriverFilterCount(filters);
  const currentQuery = driverFiltersToQuery({ ...filters, page: 1 });

  return (
    <>
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
      <div className={open ? 'ops-split' : undefined}>
        <ListPage<DriverRow>
          pageKey="drivers"
          title="Drivers"
          summary="Contact details are masked. Times are in each driver's home city."
          views={VIEWS.map((v) => ({ key: v.key, label: v.label, count: counts[v.key] ?? null }))}
          view={view}
          onView={setView}
          chips={chips}
          filterSlot={queue ? null : (
            <MoreFilters count={active}>
              <form className="ops-form" aria-label="Filter drivers" onSubmit={(e) => { e.preventDefault(); apply({}); }}>
                <div className="ops-filters" role="group" aria-label="KYC state">
                  {KYC_STATE_OPTIONS.map(([value, label]) => {
                    const on = draft.kycState.includes(value);
                    return (
                      <button key={value} type="button" className="ops-filter" aria-pressed={on}
                        onClick={() => apply({ kycState: on ? draft.kycState.filter((s) => s !== value) : [...draft.kycState, value] })}>{label}</button>
                    );
                  })}
                </div>
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
                  <label className="ops-form__label" htmlFor="f-vehicle">Vehicle</label>
                  <input id="f-vehicle" className="ops-select" placeholder="e.g. sedan" value={draft.vehicleType} onChange={(e) => setDraft({ ...draft, vehicleType: e.target.value })} size={10} />
                  <label className="ops-form__label" htmlFor="f-expiring">Documents expiring within</label>
                  <select id="f-expiring" className="ops-select" value={draft.expiringWithin} onChange={(e) => setDraft({ ...draft, expiringWithin: e.target.value })}>
                    {EXPIRY_WINDOWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <label className="ops-form__label" htmlFor="f-rating">Rating</label>
                  <select id="f-rating" className="ops-select" value={ratingBandValue(draft)}
                    onChange={(e) => { const [min, max] = e.target.value.split('|'); setDraft({ ...draft, ratingMin: min, ratingMax: max }); }}>
                    {RATING_BANDS.map(([min, max, label]) => <option key={label} value={`${min}|${max}`}>{label}</option>)}
                  </select>
                </div>
                <div className="ops-form__row">
                  <label className="ops-form__label" htmlFor="f-joined-from">Joined from</label>
                  <input id="f-joined-from" type="date" className="ops-select" value={draft.joinedFrom} onChange={(e) => setDraft({ ...draft, joinedFrom: e.target.value })} />
                  <label className="ops-form__label" htmlFor="f-joined-to">to</label>
                  <input id="f-joined-to" type="date" className="ops-select" value={draft.joinedTo} onChange={(e) => setDraft({ ...draft, joinedTo: e.target.value })} />
                  <label className="ops-form__label" htmlFor="f-id">Driver (D-…)</label>
                  <input id="f-id" className="ops-select" inputMode="numeric" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value.replace(/\D/g, '') })} size={8} />
                </div>
                <div className="ops-form__row">
                  <label className="ops-form__row"><input type="checkbox" checked={draft.online} onChange={(e) => apply({ online: e.target.checked })} /> Online now</label>
                  <label className="ops-form__row"><input type="checkbox" checked={draft.suspended} onChange={(e) => apply({ suspended: e.target.checked })} /> Suspended</label>
                  <label className="ops-form__row"><input type="checkbox" checked={draft.flagged} onChange={(e) => apply({ flagged: e.target.checked })} /> Has a flagged trip</label>
                  <label className="ops-form__label" htmlFor="f-sort">Sort</label>
                  <select id="f-sort" className="ops-select" value={draft.ordering} onChange={(e) => apply({ ordering: e.target.value })}>
                    {DRIVER_SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <label className="ops-form__label" htmlFor="f-size">Per page</label>
                  <select id="f-size" className="ops-select" value={draft.pageSize} onChange={(e) => apply({ pageSize: Number(e.target.value) })}>
                    {DRIVER_PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm">Show drivers</button>
                  <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => go(DEFAULT_DRIVER_FILTERS)} disabled={active === 0}>Clear</button>
                </div>
              </form>
            </MoreFilters>
          )}
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          total={total}
          page={filters.page}
          pageSize={filters.pageSize}
          onPage={(p) => go({ ...filters, page: p })}
          ordering={queue ? undefined : filters.ordering}
          onOrdering={queue ? undefined : (o) => go({ ...filters, ordering: o, page: 1 })}
          selectable={mayBulk}
          selected={picked}
          onSelected={(keys) => setPicked(keys.map(Number))}
          bulkActions={mayBulk ? [
            { key: 'suspend', label: 'Suspend…', onRun: () => setBulk('suspend') },
            { key: 'reinstate', label: 'Reinstate…', onRun: () => setBulk('reinstate') },
          ] : []}
          onExport={exporting ? undefined : () => void exportView()}
          onRow={setOpen}
          activeKey={open?.id ?? null}
          loading={page === null}
          error={error ? `${error} This is not the same as there being no drivers.` : null}
          empty={queue ? 'Nobody is waiting. Every driver with documents on file has been reviewed.'
            : active ? 'No drivers match. Try fewer filters.' : 'No driver has signed up in this region yet.'}
          currentQuery={currentQuery}
          onSavedView={(q) => router.push(q ? `/drivers?${q}` : '/drivers')}
        />
        {open ? (
          <DriverRecord
            key={open.id}
            row={open}
            queue={queue}
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

function DriverRecord({ row, queue, onClose, onChanged }: {
  row: DriverRow; queue: boolean; onClose: () => void;
  onChanged: (text: string, kind: 'pending' | 'done') => void;
}) {
  const access = useAdminAccess();
  const [data, setData] = useState<DriverDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<DriverActionKey | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<DriverDetail>(`/driver/admin/${row.id}/full/`));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this driver.');
    }
  }, [row.id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <RecordFailed label="Driver" message={error} onRetry={() => void load()} onClose={onClose} />;
  if (!data) return <RecordLoading label="Driver" />;

  const name = driverName(data.user, data.id);
  const tz = data.home_city?.timezone ?? null;
  const when = (iso: string | null | undefined) => cityTime(iso, tz, { zone: true });
  const target = { type: 'driver', id: data.id } as const;
  const suspended = Boolean(data.suspension?.active);
  const rail = visibleDriverActions(data.actions, access, { approved: data.approved, suspended });
  const blockers = data.approval_blockers ?? [];
  const docs = data.documents ?? [];
  const waiting = (data.approval_requests ?? []).filter((r) => r.status === 'requested');

  const history: HistoryEntry[] = [...(data.status_history ?? []), ...(data.audit_trail ?? [])]
    .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .map((r) => ({ at: when(r.created_at), text: <>{words(r.action)}{r.reason ? ` · ${r.reason}` : ''}</>, who: r.created_by?.label ?? null }));

  const tone = (t: string): ChipTone => chipTone(t);
  const [kycLabel, kycTone] = KYC_LABEL[data.kyc_state ?? ''] ?? [words(data.kyc_state), 'neutral'];

  return (
    <>
      <RecordPanel
        label="Driver"
        title={name}
        refId={`D-${data.id}`}
        onClose={onClose}
        subtitle={<>{data.home_city?.name ?? 'No home city'}{data.vehicles.find((v) => v.is_active_vehicle)?.vehicle_number ? ` · ${data.vehicles.find((v) => v.is_active_vehicle)?.vehicle_number}` : ''}</>}
        status={(
          <>
            <NowChip d={{ status: data.status, suspended }} />
            <StatusChip tone={tone(kycTone)}>{kycLabel}</StatusChip>
            {data.documents_expired ? <StatusChip tone="caution">Document expired</StatusChip> : null}
            {approvedCaveats({ ...data, documents_expired: false }).map((c) => <StatusChip key={c} tone="caution">{c}</StatusChip>)}
            {waiting.length ? <StatusChip tone="info">Waiting for a second approver</StatusChip> : null}
          </>
        )}
        actions={(
          <>
            {rail.map((key) => (
              <button key={key} type="button"
                className={`sg-btn sg-btn--sm ${key === 'approve' ? 'sg-btn--primary' : key === 'deactivate' ? 'sg-btn--ghost' : 'sg-btn--secondary'}`}
                disabled={key === 'approve' && blockers.length > 0}
                onClick={() => setAction(key)}>{RAIL_LABEL[key]}</button>
            ))}
            <span className="ops-record__call">
              Call <Revealable value={data.user.phone_number ?? '—'} label="driver phone" target={target} field="phone_number" compact
                render={(v) => (v ? <a href={`tel:${String(v)}`}>{String(v)}</a> : 'Not on file')} />
            </span>
            <Link className="sg-btn sg-btn--ghost sg-btn--sm" href={`/drivers/${data.id}`}>Open full page</Link>
          </>
        )}
        tabs={[
          {
            key: 'overview', label: 'Overview', content: (
              <>
                <div className="ops-recstats">
                  <RecordStat label="Rating" value={rating(data.ratings)}
                    note={data.ratings_summary ? `${data.ratings_summary.count.toLocaleString('en-IN')} rating${data.ratings_summary.count === 1 ? '' : 's'}` : undefined} />
                  <RecordStat label="Trips" value={data.total_trips.toLocaleString('en-IN')} />
                  <RecordStat label="Cancelled" value={data.cancellations.last_7d} note={`${data.cancellations.last_24h} in 24h · ${data.cancellations.last_30d} in 30 days`} />
                </div>
                {data.ratings_summary && data.ratings_summary.count > 0 ? (
                  <RecordFacts rows={[['Stars', ['5', '4', '3', '2', '1'].map((s) => `${s}★ ${data.ratings_summary?.distribution[s] ?? 0}`).join(' · ')]]} />
                ) : null}
                {suspended ? (
                  <div className="ops-confirm">
                    <b>{data.suspension?.permanent ? 'Permanently deactivated' : `Suspended: ${data.suspension?.reason_label ?? ''}`}</b>
                    <span>{data.suspension?.note || 'No note.'} {data.suspension?.created_at ? `(${when(data.suspension.created_at)}${data.suspension.created_by?.label ? `, ${data.suspension.created_by.label}` : ''})` : ''}</span>
                  </div>
                ) : null}
                {!data.approved && blockers.length > 0 ? (
                  <div className="ops-confirm">
                    <b>Approval is refused until:</b>
                    <ul>{blockers.map((b) => <li key={`${b.code}-${b.message}`}>{b.message}</li>)}</ul>
                  </div>
                ) : null}
                {waiting.map((r) => (
                  <p key={r.id} className="ops-confirm">
                    Waiting for a second approver · <PageLink page="approvals" href={`/approvals?id=${r.id}`}>APR-{r.id}</PageLink> ({words(r.action_key)})
                  </p>
                ))}
                <RecordFacts rows={[
                  ['Vehicle', data.vehicles.map((v) => [v.type, v.vehicle_number].filter(Boolean).join(' · ')).join(', ') || 'None on file'],
                  ['Licence expiry', data.license_expiry ? marketDate(data.license_expiry, (data.home_city?.code ?? 'IN').split('-')[0]) : 'Not set'],
                  ['Joined', when(data.joined_at)],
                  ['Account active', data.user.is_active ? 'Yes' : 'No'],
                  queue && row.waiting_seconds != null ? ['Waiting for review', waitingLabel(row.waiting_seconds)] : null,
                ]} />
                <RecordSection title="Internal notes">
                  {(data.notes ?? []).length === 0 ? <p className="ops-record__empty">No notes yet.</p> : (
                    <History entries={(data.notes ?? []).map((n) => ({ at: when(n.created_at), text: n.body, who: n.created_by?.label ?? null }))} />
                  )}
                </RecordSection>
              </>
            ),
          },
          {
            key: 'trips', label: 'Trips', content: data.recent_trips.length === 0 ? <p className="ops-record__empty">No trips yet.</p> : (
              <ul className="ops-reclist">
                {data.recent_trips.slice(0, 10).map((t) => (
                  <li key={t.id}>
                    <PageLink page="trips" href={`/trips/${t.id}`}><span className="sg-num">T-{t.id}</span></PageLink>
                    <StatusChip tone={t.status === 'completed' ? 'good' : t.status === 'cancelled' ? 'neutral' : 'info'}>{words(t.status)}</StatusChip>
                    <span className="muted">{cityTime(t.requested_at, tz)}</span>
                  </li>
                ))}
              </ul>
            ),
          },
          {
            key: 'money', label: 'Money', content: (
              <>
                <RecordFacts rows={[
                  ['Wallet', data.earnings.wallet_balance],
                  ['Today', data.earnings.today],
                  ['This month', data.earnings.this_month],
                  ['Lifetime', data.earnings.lifetime],
                  ['UPI', data.upi_id ? <Revealable value={data.upi_id} label="UPI handle" target={target} field="upi_id" /> : 'Not set'],
                ]} />
                <p className="help">{data.earnings.currency ? `Amounts in ${data.earnings.currency}.` : 'Currency not determined for these amounts.'}</p>
                <LedgerLink driverId={data.id} />
              </>
            ),
          },
          {
            key: 'docs', label: 'Documents', content: (
              <>
                {docs.length === 0 ? <p className="ops-record__empty">No documents listed.</p> : (
                  <ul className="ops-reclist">
                    {docs.map((d) => {
                      const [label, t] = REVIEW_LABEL[d.review_state] ?? [words(d.review_state), 'neutral'];
                      return (
                        <li key={`${d.owner}-${d.vehicle_id ?? 0}-${d.key}`}>
                          <span>{d.label}</span>
                          <StatusChip tone={d.present ? tone(t) : 'neutral'}>{d.present ? label : 'Missing'}</StatusChip>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="ops-record__actions">
                  <Link className="sg-btn sg-btn--secondary sg-btn--sm" href={`/kyc?driver=${data.id}`}>Review in KYC</Link>
                  <Link className="sg-btn sg-btn--ghost sg-btn--sm" href={`/drivers/${data.id}`}>Documents on the driver page</Link>
                </div>
              </>
            ),
          },
          {
            key: 'support', label: 'Support', content: (
              <RecordFacts rows={[
                ['Tickets', <PageLink key="t" page="support" href="/support">{data.counts?.tickets_total ?? 0} total, {data.counts?.tickets_open ?? 0} open</PageLink>],
                ['SOS', <PageLink key="s" page="safety" href="/safety-ops">{data.counts?.sos_total ?? 0} total, {data.counts?.sos_open ?? 0} open</PageLink>],
              ]} />
            ),
          },
          { key: 'history', label: 'History', content: <History entries={history} empty="No status changes recorded." /> },
        ]}
      />
      {action && (
        <DriverActionDrawer
          action={action} driverId={data.id} driverName={name} blockers={blockers}
          suspendReasons={data.actions?.suspend_reasons}
          onClose={() => setAction(null)}
          onDone={(text, kind) => { onChanged(text, kind); void load(); }}
        />
      )}
    </>
  );
}

function BulkDrawer({ action, ids, onClose, onDone }: {
  action: BulkAction; ids: number[]; onClose: () => void; onDone: () => void;
}) {
  const [sent] = useState(ids);
  const [reason, setReason] = useState('documents');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkResult | null>(null);
  const [key] = useState(newIdempotencyKey);
  const needsNote = action === 'reinstate' || reason === 'other';
  const verb = action === 'suspend' ? 'Suspend' : 'Reinstate';

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = await api.post<ApprovalBody & { result?: BulkResult }>('/driver/admin/bulk/', {
        action, driver_ids: sent, note, idempotency_key: key,
        ...(action === 'suspend' ? { reason_code: reason } : {}),
      });
      const result = interpretWrite(body, `${verb}d — see each driver below.`);
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
      title={`${verb} ${sent.length} driver${sent.length === 1 ? '' : 's'}`}
      onClose={onClose}
      footer={outcome ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={busy || (needsNote && !note.trim())}>
            {busy ? 'Working…' : sent.length > BULK_CHECKER_ABOVE ? 'Send for approval' : `${verb} drivers`}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {sent.length > BULK_CHECKER_ABOVE ? (
          <div className="ops-confirm"><b>Needs a second approver</b><span>More than {BULK_CHECKER_ABOVE} drivers: nothing changes until a second admin approves.</span></div>
        ) : null}
        {action === 'suspend' ? (
          <div className="ops-filterset">
            <fieldset>
              <legend>Reason</legend>
              {Object.entries(FALLBACK_SUSPEND_REASONS).map(([v, l]) => (
                <label key={v}><input type="radio" name="bulk-reason" value={v} checked={reason === v} onChange={() => setReason(v)} />{l}</label>
              ))}
            </fieldset>
          </div>
        ) : null}
        <label className="ops-form__label" htmlFor="bulk-note">Note{needsNote ? ' (required)' : ''}</label>
        <textarea id="bulk-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="help">{action === 'suspend'
          ? 'Suspended drivers cannot go online or receive offers. Drivers already suspended are skipped and listed.'
          : 'Approval comes back only for drivers who still pass the KYC checks; the rest return to the KYC queue.'}</p>
        {error && <div className="alert-error" role="alert">{error}</div>}
        {outcome && <div className="alert-success" role="status">{outcome}</div>}
        {rows ? (
          <Facts>
            {rows.results.map((r) => <Fact key={r.id} label={`D-${r.id}`}>{words(r.result)}</Fact>)}
          </Facts>
        ) : null}
      </div>
    </Drawer>
  );
}

export default function DriversPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <DriversInner />
    </Suspense>
  );
}
