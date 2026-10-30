'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { can, useAdminAccess, withScope } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import {
  BULK_CHECKER_ABOVE, DEFAULT_FILTERS, PAGE_SIZES, SORT_OPTIONS, STATUS_OPTIONS,
  type ApprovalBody, type TripFilters, activeFilterCount, canSeeMoneyColumns, cityTime,
  filtersFromSearch, filtersToQuery, formatMinor, interpretWrite, newIdempotencyKey,
  tripsApiPath, words,
} from '@/lib/trips';
import { ButtonLink } from '@/components/sg/Button';
import {
  Column, DataTable, Drawer, Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill,
  Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Trips: find one, or a set of them, and act.
 *
 * Every filter is SERVER-SIDE and lives in the URL, so a count is the real
 * count, a page is the real page, and the Command Centre can link straight
 * to "stale trips in Hyderabad". Times are in each trip's own city (the
 * server sends the zone), and money is shown only to the roles that work
 * with it: finance, and the city ops who run the trips.
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
  pickup_address?: string;
  destination_address?: string;
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

type Page = { count: number; page: number; total_pages: number; results: TripRow[] };

const TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  completed: 'good', cancelled: 'bad', requested: 'wait', accepted: 'wait', reached: 'wait', in_progress: 'wait',
};
const PAYMENT_METHODS = ['cash', 'online', 'wallet', 'deferred'];
const CANCEL_REASONS: Record<string, string> = {
  stale: 'Trip is stale (no progress)', duplicate: 'Duplicate booking', no_driver: 'No driver is coming',
  safety: 'Safety concern', fraud_suspicion: 'Suspected fraud', other: 'Other (note required)',
};
const FLAG_REASONS: Record<string, string> = {
  fraud_suspicion: 'Fraud suspicion', safety: 'Safety', dispute: 'Dispute',
};

type BulkAction = 'cancel' | 'flag';
type BulkResult = { results: Array<{ id: number; result: string }>; counts: Record<string, number> };

function TripsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const filters = useMemo(() => filtersFromSearch(new URLSearchParams(search.toString())), [search]);

  const [density, setDensity] = useDensity();
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TripFilters>(filters);
  const [preview, setPreview] = useState<TripRow | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  useEffect(() => setDraft(filters), [filters]);

  const showMoney = canSeeMoneyColumns(access);
  const mayWrite = can(access, 'trip.write');
  const cities = (access?.scopes ?? []).filter((s) => s.kind === 'city');
  // A City column earns its width only when more than one city is live.
  const multiCity = cities.filter((c) => c.status === 'active').length > 1
    || (access?.scopes ?? []).some((s) => s.kind === 'country' || s.kind === 'global');

  const load = useCallback(async () => {
    setPage(null);
    setError(null);
    try {
      const path = tripsApiPath(filters);
      setPage(await api.get<Page>(filters.scope ? path : withScope(path)));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the trips.');
      setPage({ count: 0, page: 1, total_pages: 1, results: [] });
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => setPicked(new Set()), [filters]);

  const go = (next: TripFilters) => {
    const q = filtersToQuery(next);
    router.push(q ? `/trips?${q}` : '/trips');
  };
  const apply = (patch: Partial<TripFilters>) => go({ ...draft, ...patch, page: 1 });
  const rows = page?.results ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: number) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)));

  const columns: Column<TripRow>[] = [
    ...(mayWrite ? [{
      key: 'pick', label: (
        <input type="checkbox" aria-label="Select every trip on this page" checked={allPicked} onChange={toggleAll} />
      ), width: '3.5rem',
      render: (t: TripRow) => (
        <input type="checkbox" aria-label={`Select trip ${t.id}`} checked={picked.has(t.id)} onChange={() => toggle(t.id)} />
      ),
    }] : []),
    { key: 'id', label: 'Trip', width: '5.5rem', render: (t) => <Link href={`/trips/${t.id}`}>#{t.id}</Link> },
    {
      key: 'status', label: 'Status', width: '10.5rem',
      render: (t) => (
        <span className="ops-form__row">
          <Pill tone={TONE[t.status ?? ''] ?? 'neutral'}>{words(t.status)}</Pill>
          {t.stale ? <Pill tone="bad">stale</Pill> : null}
        </span>
      ),
    },
    {
      key: 'marks', label: 'Marks', width: '6.5rem', hideBelow: 1100,
      render: (t) => (
        <span className="ops-form__row">
          {t.has_sos ? <Pill tone="bad">SOS</Pill> : null}
          {t.has_ticket ? <Pill tone="wait">ticket</Pill> : null}
          {t.flagged ? <Pill tone="bad">flagged</Pill> : null}
          {!t.has_sos && !t.has_ticket && !t.flagged ? <span className="muted">—</span> : null}
        </span>
      ),
    },
    ...(multiCity ? [{ key: 'city', label: 'City', width: '8rem', hideBelow: 1280 as const, render: (t: TripRow) => t.city?.name ?? <span className="muted">—</span> }] : []),
    { key: 'rider', label: 'Rider', width: '9rem', render: (t) => t.user || <span className="muted">—</span> },
    { key: 'driver', label: 'Driver', width: '9rem', hideBelow: 1280, render: (t) => t.driver_name || <span className="muted">unassigned</span> },
    { key: 'pickup', label: 'Pickup', render: (t) => <span title={t.pickup_address}>{t.pickup_address || '—'}</span> },
    ...(showMoney ? [{
      key: 'fare', label: 'Fare', num: true, width: '8rem',
      render: (t: TripRow) => (
        <>
          {formatMinor(t.charged_fare_minor ?? null, t.currency)}
          {t.final_fare_minor == null && t.status !== 'completed' ? <span className="muted"> est.</span> : null}
        </>
      ),
    }] : []),
    { key: 'time', label: 'Requested', num: true, width: '8.5rem', render: (t) => cityTime(t.requested_at, t.city?.timezone) },
  ];

  const total = page?.count ?? null;
  const active = activeFilterCount(filters);
  const summary = total === null ? null
    : `${total.toLocaleString('en-IN')} trip${total === 1 ? '' : 's'}${active ? ` · ${active} filter${active === 1 ? '' : 's'}` : ''}`;

  return (
    <>
      <PageHeader title="Trips" subtitle="Times are in each trip's own city." />

      <Panel title="Filters">
        <form
          className="ops-form"
          aria-label="Filter trips"
          onSubmit={(e) => { e.preventDefault(); apply({}); }}
        >
          <div className="ops-filters" role="group" aria-label="Status">
            {STATUS_OPTIONS.map(([value, label]) => {
              const on = draft.status.includes(value);
              return (
                <button
                  key={value} type="button" className="ops-filter" aria-pressed={on}
                  onClick={() => apply({ status: on ? draft.status.filter((s) => s !== value) : [...draft.status, value] })}
                >{label}</button>
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
            <label className="ops-form__label" htmlFor="f-id">Trip #</label>
            <input id="f-id" className="ops-select" inputMode="numeric" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value.replace(/\D/g, '') })} size={8} />
          </div>
          <div className="ops-form__row">
            <label className="ops-form__row"><input type="checkbox" checked={draft.stale} onChange={(e) => apply({ stale: e.target.checked })} /> Stale only</label>
            <label className="ops-form__row"><input type="checkbox" checked={draft.flagged} onChange={(e) => apply({ flagged: e.target.checked })} /> Flagged only</label>
            <label className="ops-form__row"><input type="checkbox" checked={draft.hasSos} onChange={(e) => apply({ hasSos: e.target.checked })} /> Had an SOS</label>
            <label className="ops-form__label" htmlFor="f-sort">Sort</label>
            <select id="f-sort" className="ops-select" value={draft.ordering} onChange={(e) => apply({ ordering: e.target.value })}>
              {SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm">Show trips</button>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => go(DEFAULT_FILTERS)} disabled={active === 0}>Clear</button>
          </div>
        </form>
      </Panel>

      <Panel flush>
        <TableToolbar summary={summary} density={density} onDensity={setDensity}>
          {mayWrite && picked.size > 0 ? (
            <span className="ops-form__row" role="group" aria-label="Bulk actions">
              <b>{picked.size} selected</b>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setBulk('cancel')}>Cancel…</button>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setBulk('flag')}>Flag…</button>
              {picked.size > BULK_CHECKER_ABOVE ? (
                <span className="ops-confirm__warn">Over {BULK_CHECKER_ABOVE} trips: a second admin must approve.</span>
              ) : null}
            </span>
          ) : null}
        </TableToolbar>

        {page === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading trips</span>
            <Skeleton kind="row" count={8} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState title="The list could not be loaded" detail={`${error} This is not the same as there being no trips.`} onRetry={() => void load()} />
          </div>
        ) : rows.length === 0 ? (
          <Empty title="No trips match" detail={active ? 'Try fewer filters, or a wider date range.' : 'Nothing has been booked in this region yet.'} />
        ) : (
          <DataTable caption="Trips" rows={rows} columns={columns} rowKey={(t) => t.id} density={density} onRow={setPreview} selectedKey={preview?.id ?? null} />
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
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </nav>
        ) : null}
      </Panel>

      <Drawer
        open={preview !== null}
        title={preview ? `Trip #${preview.id}` : ''}
        onClose={() => setPreview(null)}
        footer={preview ? <ButtonLink href={`/trips/${preview.id}`} variant="primary" size="sm">Open full trip</ButtonLink> : undefined}
      >
        {preview && (
          <Facts>
            <Fact label="Status"><Pill tone={TONE[preview.status ?? ''] ?? 'neutral'}>{words(preview.status)}</Pill>{preview.stale ? <> <Pill tone="bad">stale · {words(preview.stale_reason)}</Pill></> : null}</Fact>
            <Fact label="City">{preview.city?.name ?? '—'}</Fact>
            <Fact label="Rider">{preview.user || '—'}</Fact>
            <Fact label="Driver">{preview.driver_name || 'Unassigned'}</Fact>
            <Fact label="Pickup">{preview.pickup_address || '—'}</Fact>
            <Fact label="Drop">{preview.destination_address || '—'}</Fact>
            {showMoney ? <Fact label="Fare">{formatMinor(preview.charged_fare_minor ?? null, preview.currency)} · {preview.payment_method ?? '—'}</Fact> : null}
            <Fact label="Requested">{cityTime(preview.requested_at, preview.city?.timezone, { zone: true })}</Fact>
          </Facts>
        )}
      </Drawer>

      {bulk && (
        <BulkDrawer
          action={bulk}
          ids={[...picked]}
          onClose={() => setBulk(null)}
          onDone={() => { setPicked(new Set()); void load(); }}
        />
      )}
    </>
  );
}

function BulkDrawer({ action, ids, onClose, onDone }: {
  action: BulkAction; ids: number[]; onClose: () => void; onDone: () => void;
}) {
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
        action, trip_ids: ids, note, idempotency_key: key,
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
      title={`${action === 'cancel' ? 'Cancel' : 'Flag'} ${ids.length} trip${ids.length === 1 ? '' : 's'}`}
      onClose={onClose}
      footer={outcome ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={busy || (needsNote && !note.trim())}>
            {busy ? 'Working…' : ids.length > BULK_CHECKER_ABOVE ? 'Send for approval' : action === 'cancel' ? 'Cancel trips' : 'Flag trips'}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {ids.length > BULK_CHECKER_ABOVE ? (
          <div className="ops-confirm"><b>Needs a checker</b><span>More than {BULK_CHECKER_ABOVE} trips: nothing changes until a second admin approves.</span></div>
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
            {rows.results.map((r) => <Fact key={r.id} label={`#${r.id}`}>{words(r.result)}</Fact>)}
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
