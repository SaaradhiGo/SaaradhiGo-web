'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { withScope } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
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
 * The fleet, and who is waiting on a decision.
 *
 * The filters live in the URL so the Command Centre can link straight to
 * the queue that matters -- `/drivers?approved=false` -- and so a filtered
 * view survives a reload and can be sent to a colleague.
 *
 * A row opens a drawer with the essentials and one button to the full
 * record. The DECISION is not here: approving a driver from a list row,
 * without having seen a document, is the action this product most needs
 * somebody to think before taking, so it lives on the driver's own page
 * next to the evidence.
 *
 * `?q=` is the global search landing here. The server has no search yet,
 * so the page searches the rows it loaded and says so, in words, above
 * the table -- rather than returning "no results" for a driver who is on
 * page two.
 */
type Person = { phone_number?: string; full_name?: string; email?: string };

type Vehicle = { vehicle_number?: string; plate?: string; registration_number?: string; model?: string } | null;

type Driver = {
  id: number;
  /** `DriverAdminListSerializer` returns the person as `user_details`;
   *  other admin payloads nest it under `user_id`. Both are accepted. */
  user_details?: Person;
  user_id?: Person | number;
  status?: string;
  approved?: boolean;
  doc_status?: string | null;
  ratings?: string | number;
  total_trips?: number;
  fatigue_lockout_until?: string | null;
  active_vehicle?: Vehicle;
};

type Page = { count?: number; next?: string | null; results?: Driver[] };

function who(d: Driver) {
  const u = d.user_details
    ?? (typeof d.user_id === 'object' && d.user_id ? d.user_id : null);
  return {
    name: u?.full_name?.trim() || null,
    phone: u?.phone_number || null,
    email: u?.email || null,
  };
}

function plate(d: Driver) {
  const v = d.active_vehicle;
  return v?.vehicle_number || v?.registration_number || v?.plate || null;
}

function DriversInner() {
  const router = useRouter();
  const search = useSearchParams();
  const approved = search.get('approved') ?? '';
  const status = search.get('status') ?? '';
  const q = (search.get('q') ?? '').trim();

  const [density, setDensity] = useDensity();
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Driver | null>(null);

  // Draft filter values inside the drawer; applied on "Show".
  const [draftApproved, setDraftApproved] = useState(approved);
  const [draftStatus, setDraftStatus] = useState(status);
  useEffect(() => { setDraftApproved(approved); setDraftStatus(status); }, [approved, status]);

  const load = useCallback(async () => {
    setDrivers(null);
    setError(null);
    try {
      const query = new URLSearchParams({ page_size: '50' });
      if (approved) query.set('approved', approved);
      if (status) query.set('status', status);
      const page = await api.get<Page>(withScope(`/driver/admin/?${query}`));
      const list = Array.isArray(page?.results) ? page.results
        : (Array.isArray(page) ? (page as unknown as Driver[]) : []);
      setDrivers(list);
      setTotal(typeof page?.count === 'number' ? page.count : null);
      setMore(Boolean(page?.next));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load the drivers.');
      setDrivers([]);
    }
  }, [approved, status]);

  useEffect(() => { void load(); }, [load]);

  // Whether the SERVER masked what it sent, not whether we think it should
  // have. The payload is the only honest source.
  const maskedContacts = (drivers ?? []).some((d) => (who(d).phone ?? '').includes('•'));

  const shown = useMemo(() => {
    if (!drivers) return null;
    if (!q) return drivers;
    const needle = q.toLowerCase().replace(/\s+/g, '');
    return drivers.filter((d) => {
      const p = who(d);
      const hay = [p.name, p.phone, p.email, plate(d), `#${d.id}`, String(d.id)]
        .filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, '');
      return hay.includes(needle);
    });
  }, [drivers, q]);

  function apply() {
    const next = new URLSearchParams();
    if (draftApproved) next.set('approved', draftApproved);
    if (draftStatus) next.set('status', draftStatus);
    if (q) next.set('q', q);
    const qs = next.toString();
    router.push(qs ? `/drivers?${qs}` : '/drivers');
    setFiltersOpen(false);
  }

  const activeFilters = (approved ? 1 : 0) + (status ? 1 : 0);

  const columns: Column<Driver>[] = [
    {
      key: 'name', label: 'Driver',
      sortValue: (d) => who(d).name ?? `~${d.id}`,
      render: (d) => <Link href={`/drivers/${d.id}`}>{who(d).name || `Driver #${d.id}`}</Link>,
    },
    {
      key: 'contact', width: '12rem',
      label: (
        <>
          Contact
          {/* Said once in the header rather than decorating every row: an
              operator who cannot see contact details needs to know that
              the dots are policy, not missing data. */}
          {maskedContacts && (
            <span className="th-note" title="Your role cannot see full contact details">masked</span>
          )}
        </>
      ),
      render: (d) => who(d).phone || who(d).email || <span className="muted">—</span>,
    },
    { key: 'plate', label: 'Vehicle', width: '10rem', hideBelow: 1100, render: (d) => plate(d) || <span className="muted">none on file</span> },
    {
      key: 'review', label: 'Review', width: '10rem', sortValue: (d) => (d.approved ? 2 : d.doc_status === 'rejected' ? 0 : 1),
      render: (d) => d.approved
        ? <Pill tone="good">Approved</Pill>
        : d.doc_status === 'rejected'
          ? <Pill tone="bad">Sent back</Pill>
          : <Pill tone="wait">Awaiting review</Pill>,
    },
    {
      key: 'state', label: 'State', width: '8rem', sortValue: (d) => d.status ?? '',
      render: (d) => {
        const locked = Boolean(d.fatigue_lockout_until
          && new Date(d.fatigue_lockout_until).getTime() > Date.now());
        return locked
          ? <Pill tone="bad">Rest period</Pill>
          : <Pill tone={d.status === 'online' ? 'good' : 'neutral'}>{d.status || 'off'}</Pill>;
      },
    },
    { key: 'trips', label: 'Trips', num: true, width: '5.5rem', sortValue: (d) => d.total_trips ?? 0, render: (d) => d.total_trips ?? 0 },
    {
      key: 'rating', label: 'Rating', num: true, width: '6rem',
      sortValue: (d) => Number(d.ratings ?? 0) || null,
      render: (d) => (Number(d.ratings ?? 0) > 0 ? Number(d.ratings).toFixed(2) : <span className="muted">—</span>),
    },
  ];

  const summary = total === null ? null
    : q ? `${shown?.length ?? 0} match${(shown?.length ?? 0) === 1 ? '' : 'es'} for “${q}” among the ${drivers?.length ?? 0} loaded`
      : `${total} ${approved === 'false' ? 'awaiting review' : approved === 'true' ? 'approved' : 'on file'}${more ? ' · showing the first 50' : ''}`;

  return (
    <>
      <PageHeader
        title="Drivers"
        subtitle={q ? 'The server does not search yet; this matches within the drivers loaded on this page.' : undefined}
      />

      <Panel flush>
        <TableToolbar
          summary={summary}
          density={density}
          onDensity={setDensity}
          onFilters={() => setFiltersOpen(true)}
          filtersActive={activeFilters}
        >
          {q && (
            <Link href={activeFilters ? `/drivers?${new URLSearchParams({ ...(approved ? { approved } : {}), ...(status ? { status } : {}) })}` : '/drivers'} className="sg-link text-sm">
              Clear search
            </Link>
          )}
        </TableToolbar>

        {drivers === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading drivers</span>
            <Skeleton kind="row" count={8} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState title="The list could not be loaded" detail={`${error} This is not the same as there being no drivers.`} onRetry={() => void load()} />
          </div>
        ) : (shown?.length ?? 0) === 0 ? (
          <Empty
            title={q ? 'No driver here matches that' : 'No drivers here'}
            detail={q ? 'Only the loaded page was searched. Clear the search or narrow the filters.'
              : approved === 'false' ? 'Nothing is waiting on a decision.' : undefined}
          />
        ) : (
          <DataTable
            caption="Drivers"
            rows={shown ?? []}
            columns={columns}
            rowKey={(d) => d.id}
            density={density}
            onRow={setSelected}
            selectedKey={selected?.id ?? null}
            defaultSort={approved === 'false' ? null : { key: 'name', dir: 'asc' }}
          />
        )}
      </Panel>

      <Drawer open={filtersOpen} title="Filter drivers" onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => { setDraftApproved(''); setDraftStatus(''); }}>Reset</button>
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={apply}>Show drivers</button>
          </>
        }
      >
        <div className="ops-filterset">
          <fieldset>
            <legend>Review</legend>
            {[['', 'All drivers'], ['false', 'Awaiting review'], ['true', 'Approved']].map(([v, l]) => (
              <label key={v}>
                <input type="radio" name="approved" value={v} checked={draftApproved === v} onChange={() => setDraftApproved(v)} />
                {l}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>State</legend>
            {[['', 'Any'], ['online', 'Online now'], ['offline', 'Offline']].map(([v, l]) => (
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
        title={selected ? (who(selected).name || `Driver #${selected.id}`) : ''}
        onClose={() => setSelected(null)}
        footer={selected ? (
          <ButtonLink href={`/drivers/${selected.id}`} variant="primary" size="sm">Open full record</ButtonLink>
        ) : undefined}
      >
        {selected && (
          <Facts>
            <Fact label="Driver ID">#{selected.id}</Fact>
            <Fact label="Contact">{who(selected).phone || who(selected).email || '—'}</Fact>
            <Fact label="Vehicle">{plate(selected) || 'None on file'}</Fact>
            <Fact label="Review">
              {selected.approved ? <Pill tone="good">Approved</Pill>
                : selected.doc_status === 'rejected' ? <Pill tone="bad">Sent back</Pill>
                  : <Pill tone="wait">Awaiting review</Pill>}
            </Fact>
            <Fact label="State"><Pill tone={selected.status === 'online' ? 'good' : 'neutral'}>{selected.status || 'off'}</Pill></Fact>
            <Fact label="Trips">{selected.total_trips ?? 0}</Fact>
            <Fact label="Rating">{Number(selected.ratings ?? 0) > 0 ? Number(selected.ratings).toFixed(2) : '—'}</Fact>
          </Facts>
        )}
      </Drawer>
    </>
  );
}

export default function DriversPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <DriversInner />
    </Suspense>
  );
}
