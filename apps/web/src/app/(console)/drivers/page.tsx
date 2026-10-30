'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import {
  DEFAULT_DRIVER_FILTERS, DRIVER_PAGE_SIZES, DRIVER_SORT_OPTIONS, EXPIRY_WINDOWS,
  FALLBACK_SUSPEND_REASONS, KYC_LABEL, KYC_STATE_OPTIONS, RATING_BANDS,
  type DriverFilters, activeDriverFilterCount, canBulkDrivers, driverFiltersFromSearch,
  driverFiltersToQuery, driverName, driversApiPath, queueApiPath, ratingBandValue, waitingLabel,
} from '@/lib/drivers';
import {
  BULK_CHECKER_ABOVE, type ApprovalBody, cityTime, interpretWrite, newIdempotencyKey, words,
} from '@/lib/trips';
import { ButtonLink } from '@/components/sg/Button';
import {
  Column, DataTable, Drawer, Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill,
  Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Drivers: the fleet, and the KYC queue.
 *
 * Every filter is SERVER-SIDE and lives in the URL, so a count is the real
 * count and the Command Centre can link straight to "awaiting approval in
 * Hyderabad" (`?approved=false&scope=IN-TG-HYD`). Contact details arrive
 * masked: the server never sends the number, and the reveal on the
 * driver's page is the logged way to it.
 *
 * The KYC queue is the KYC Verifier's work list, longest-waiting first,
 * with the checklist beside each driver. The DECISION is on the driver's
 * own page, next to the documents.
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

function KycPills({ d }: { d: DriverRow }) {
  const [label, tone] = KYC_LABEL[d.kyc_state ?? ''] ?? [words(d.kyc_state), 'neutral'];
  return (
    <span className="ops-form__row">
      <Pill tone={tone}>{label}</Pill>
      {d.suspended ? <Pill tone="bad">suspended</Pill> : null}
      {d.documents_expired ? <Pill tone="bad">expired</Pill> : null}
    </span>
  );
}

function DriversInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const filters = useMemo(() => driverFiltersFromSearch(new URLSearchParams(search.toString())), [search]);

  const [density, setDensity] = useDensity();
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DriverFilters>(filters);
  const [preview, setPreview] = useState<DriverRow | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  useEffect(() => setDraft(filters), [filters]);

  const queue = filters.tab === 'queue';
  const mayBulk = !queue && canBulkDrivers(access);
  const cities = (access?.scopes ?? []).filter((s) => s.kind === 'city');
  const multiCity = cities.filter((c) => c.status === 'active').length > 1
    || (access?.scopes ?? []).some((s) => s.kind === 'country' || s.kind === 'global');

  const load = useCallback(async () => {
    setPage(null);
    setError(null);
    try {
      const path = queue ? queueApiPath(filters) : driversApiPath(filters);
      setPage(await api.get<Page>(filters.scope ? path : withScope(path)));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the drivers.');
      setPage({ count: 0, page: 1, total_pages: 1, results: [] });
    }
  }, [filters, queue]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => setPicked(new Set()), [filters]);

  const go = (next: DriverFilters) => {
    const q = driverFiltersToQuery(next);
    router.push(q ? `/drivers?${q}` : '/drivers');
  };
  const apply = (patch: Partial<DriverFilters>) => go({ ...draft, ...patch, page: 1 });
  const rows = page?.results ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: number) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)));

  const nameCell = (d: DriverRow) => (
    <Link href={`/drivers/${d.id}`}>{driverName(d.user_details, d.id)}</Link>
  );
  const cityColumn: Column<DriverRow>[] = multiCity
    ? [{ key: 'city', label: 'City', width: '8rem', hideBelow: 1280, render: (d) => d.home_city?.name ?? <span className="muted">—</span> }]
    : [];

  const columns: Column<DriverRow>[] = queue ? [
    { key: 'id', label: 'Driver', render: nameCell },
    ...cityColumn,
    { key: 'waiting', label: 'Waiting', width: '7rem', num: true, render: (d) => waitingLabel(d.waiting_seconds) },
    {
      key: 'docs', label: 'Documents', width: '9rem',
      render: (d) => {
        const docs = d.documents ?? [];
        const onFile = docs.filter((x) => x.present).length;
        return <span>{onFile} of {docs.length} on file</span>;
      },
    },
    {
      key: 'missing', label: 'Outstanding', hideBelow: 1100,
      render: (d) => (d.checklist?.missing.length
        ? <span className="muted">{d.checklist.missing.map(words).join(', ')}</span>
        : <Pill tone="good">complete</Pill>),
    },
    { key: 'vehicle', label: 'Vehicle', width: '9rem', hideBelow: 1280, render: (d) => d.vehicle_type ?? <span className="muted">none</span> },
  ] : [
    ...(mayBulk ? [{
      key: 'pick', label: (
        <input type="checkbox" aria-label="Select every driver on this page" checked={allPicked} onChange={toggleAll} />
      ), width: '3.5rem',
      render: (d: DriverRow) => (
        <input type="checkbox" aria-label={`Select driver ${d.id}`} checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
      ),
    }] : []),
    { key: 'id', label: 'Driver', render: nameCell },
    { key: 'kyc', label: 'KYC', width: '13rem', render: (d) => <KycPills d={d} /> },
    ...cityColumn,
    {
      key: 'online', label: 'Now', width: '6.5rem',
      render: (d) => (d.online ? <Pill tone="good">online</Pill> : <span className="muted">{words(d.status)}</span>),
    },
    { key: 'vehicle', label: 'Vehicle', width: '9rem', hideBelow: 1100, render: (d) => d.vehicle_type ?? <span className="muted">none</span> },
    { key: 'rating', label: 'Rating', width: '5.5rem', num: true, render: (d) => (Number(d.ratings) > 0 ? Number(d.ratings).toFixed(2) : '—') },
    { key: 'trips', label: 'Trips', width: '5rem', num: true, hideBelow: 1100, render: (d) => d.total_trips ?? 0 },
    { key: 'joined', label: 'Joined', width: '8.5rem', num: true, hideBelow: 1280, render: (d) => cityTime(d.joined_at, d.home_city?.timezone) },
  ];

  const total = page?.count ?? null;
  const active = queue ? 0 : activeDriverFilterCount(filters);
  const noun = queue ? 'waiting for review' : `driver${total === 1 ? '' : 's'}`;
  const summary = total === null ? null
    : `${total.toLocaleString('en-IN')} ${noun}${active ? ` · ${active} filter${active === 1 ? '' : 's'}` : ''}`;

  return (
    <>
      <PageHeader title="Drivers" subtitle="Contact details are masked. Times are in each driver's home city." />

      <div className="ops-filters mb-5" role="group" aria-label="View">
        <button type="button" className="ops-filter" aria-pressed={!queue} onClick={() => go({ ...filters, tab: 'all', page: 1 })}>All drivers</button>
        <button type="button" className="ops-filter" aria-pressed={queue} onClick={() => go({ ...DEFAULT_DRIVER_FILTERS, scope: filters.scope, tab: 'queue' })}>KYC queue</button>
      </div>

      {queue ? null : (
        <Panel title="Filters">
          <form className="ops-form" aria-label="Filter drivers" onSubmit={(e) => { e.preventDefault(); apply({}); }}>
            <div className="ops-filters" role="group" aria-label="KYC state">
              {KYC_STATE_OPTIONS.map(([value, label]) => {
                const on = draft.kycState.includes(value);
                return (
                  <button
                    key={value} type="button" className="ops-filter" aria-pressed={on}
                    onClick={() => apply({ kycState: on ? draft.kycState.filter((s) => s !== value) : [...draft.kycState, value] })}
                  >{label}</button>
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
              <select
                id="f-rating" className="ops-select" value={ratingBandValue(draft)}
                onChange={(e) => { const [min, max] = e.target.value.split('|'); setDraft({ ...draft, ratingMin: min, ratingMax: max }); }}
              >
                {RATING_BANDS.map(([min, max, label]) => <option key={label} value={`${min}|${max}`}>{label}</option>)}
              </select>
            </div>
            <div className="ops-form__row">
              <label className="ops-form__label" htmlFor="f-joined-from">Joined from</label>
              <input id="f-joined-from" type="date" className="ops-select" value={draft.joinedFrom} onChange={(e) => setDraft({ ...draft, joinedFrom: e.target.value })} />
              <label className="ops-form__label" htmlFor="f-joined-to">to</label>
              <input id="f-joined-to" type="date" className="ops-select" value={draft.joinedTo} onChange={(e) => setDraft({ ...draft, joinedTo: e.target.value })} />
              <label className="ops-form__label" htmlFor="f-id">Driver #</label>
              <input id="f-id" className="ops-select" inputMode="numeric" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value.replace(/\D/g, '') })} size={8} />
            </div>
            <div className="ops-form__row">
              <label className="ops-form__row"><input type="checkbox" checked={draft.online} onChange={(e) => apply({ online: e.target.checked })} /> Online now</label>
              <label className="ops-form__row"><input type="checkbox" checked={draft.suspended} onChange={(e) => apply({ suspended: e.target.checked })} /> Suspended</label>
              <label className="ops-form__row"><input type="checkbox" checked={draft.flagged} onChange={(e) => apply({ flagged: e.target.checked })} /> Has a flagged trip</label>
              {draft.approved ? (
                <label className="ops-form__row"><input type="checkbox" checked onChange={() => apply({ approved: '' })} /> {draft.approved === 'false' ? 'Not yet approved' : 'Approved'}</label>
              ) : null}
              {draft.status ? (
                <label className="ops-form__row"><input type="checkbox" checked onChange={() => apply({ status: '' })} /> Status: {draft.status}</label>
              ) : null}
              <label className="ops-form__label" htmlFor="f-sort">Sort</label>
              <select id="f-sort" className="ops-select" value={draft.ordering} onChange={(e) => apply({ ordering: e.target.value })}>
                {DRIVER_SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm">Show drivers</button>
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => go(DEFAULT_DRIVER_FILTERS)} disabled={active === 0}>Clear</button>
            </div>
          </form>
        </Panel>
      )}

      <Panel flush>
        <TableToolbar summary={summary} density={density} onDensity={setDensity}>
          {mayBulk && picked.size > 0 ? (
            <span className="ops-form__row" role="group" aria-label="Bulk actions">
              <b>{picked.size} selected</b>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setBulk('suspend')}>Suspend…</button>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setBulk('reinstate')}>Reinstate…</button>
              {picked.size > BULK_CHECKER_ABOVE ? (
                <span className="ops-confirm__warn">Over {BULK_CHECKER_ABOVE} drivers: a second admin must approve.</span>
              ) : null}
            </span>
          ) : null}
        </TableToolbar>

        {page === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading drivers</span>
            <Skeleton kind="row" count={8} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState title="The list could not be loaded" detail={`${error} This is not the same as there being no drivers.`} onRetry={() => void load()} />
          </div>
        ) : rows.length === 0 ? (
          queue
            ? <Empty title="Nobody is waiting" detail="Every driver with documents on file has been reviewed." />
            : <Empty title="No drivers match" detail={active ? 'Try fewer filters.' : 'No driver has signed up in this region yet.'} />
        ) : (
          <DataTable
            caption={queue ? 'KYC queue, longest waiting first' : 'Drivers'}
            rows={rows} columns={columns} rowKey={(d) => d.id} density={density}
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
                {DRIVER_PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </nav>
        ) : null}
      </Panel>

      <Drawer
        open={preview !== null}
        title={preview ? driverName(preview.user_details, preview.id) : ''}
        onClose={() => setPreview(null)}
        footer={preview ? <ButtonLink href={`/drivers/${preview.id}`} variant="primary" size="sm">{queue ? 'Review documents' : 'Open driver'}</ButtonLink> : undefined}
      >
        {preview && (
          <Facts>
            <Fact label="Driver">#{preview.id}</Fact>
            <Fact label="KYC"><KycPills d={preview} /></Fact>
            <Fact label="Phone">{preview.user_details?.phone_number ?? '—'}</Fact>
            <Fact label="City">{preview.home_city?.name ?? '—'}</Fact>
            <Fact label="Vehicle">{[preview.vehicle_type, preview.vehicle_number].filter(Boolean).join(' · ') || 'None'}</Fact>
            <Fact label="Rating">{Number(preview.ratings) > 0 ? Number(preview.ratings).toFixed(2) : 'No ratings yet'} · {preview.total_trips ?? 0} trips</Fact>
            {queue ? <Fact label="Waiting">{waitingLabel(preview.waiting_seconds)}</Fact> : null}
            <Fact label="Joined">{cityTime(preview.joined_at, preview.home_city?.timezone, { zone: true })}</Fact>
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
        action, driver_ids: ids, note, idempotency_key: key,
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
      title={`${verb} ${ids.length} driver${ids.length === 1 ? '' : 's'}`}
      onClose={onClose}
      footer={outcome ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={busy || (needsNote && !note.trim())}>
            {busy ? 'Working…' : ids.length > BULK_CHECKER_ABOVE ? 'Send for approval' : `${verb} drivers`}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {ids.length > BULK_CHECKER_ABOVE ? (
          <div className="ops-confirm"><b>Needs a checker</b><span>More than {BULK_CHECKER_ABOVE} drivers: nothing changes until a second admin approves.</span></div>
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
            {rows.results.map((r) => <Fact key={r.id} label={`#${r.id}`}>{words(r.result)}</Fact>)}
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
