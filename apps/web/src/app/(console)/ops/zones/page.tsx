'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import { canDraftZones, outerRings, requestWords, TYPE_WORDS, type PendingRequest, type Zone } from '@/lib/zones';
import { PageLink } from '@/components/console/PageLink';
import { ZoneMap, type MapZone } from '@/components/console/zones/ZoneMap';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip } from '@/components/console/kit/StatusChip';

/**
 * Service zones: a searchable list paged on the server, beside the map of every zone in scope.
 *
 * READ FIRST, CHANGE BY REQUEST. A zone opens to its polygon, settings, history and pending
 * requests. Creating or changing a zone is a request that a second admin approves
 * (`zone.change`, decided in Approvals); nothing on this page edits a polygon directly. Fares and
 * commission are under Pricing.
 *
 * The server pages the zones (limit and offset) but cannot search or filter them, so a search or
 * a status view narrows the full set the map already holds, and is paged here.
 */
type Paged<T> = { count?: number; results?: T[] } | T[];

function asPage<T>(r: unknown): { count: number; results: T[] } {
  const o = r as Paged<T> & { data?: T[] };
  if (Array.isArray(o)) return { count: o.length, results: o };
  const results = Array.isArray(o?.results) ? o.results : Array.isArray(o?.data) ? o.data : [];
  return { count: typeof o?.count === 'number' ? o.count : results.length, results };
}

const PAGE_SIZE = 20;
/** Enough for the map to hold every zone a scope can have. */
const MAP_LIMIT = 1000;

export default function ZonesPage() {
  const router = useRouter();
  const access = useAdminAccess();
  const [all, setAll] = useState<Zone[] | null>(null);
  const [pageRows, setPageRows] = useState<{ count: number; results: Zone[] } | null>(null);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const may = canDraftZones(access);

  const loadAll = useCallback(async () => {
    setAll(null);
    setError(null);
    try {
      const [z, p] = await Promise.all([
        api.get<unknown>(withScope(`/pricing/admin/zones/?limit=${MAP_LIMIT}`)),
        api.get<{ results: PendingRequest[] }>(withScope('/pricing/admin/zones/pending/')).catch(() => ({ results: [] })),
      ]);
      setAll(asPage<Zone>(z).results);
      setPending(p.results ?? []);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the zones.');
      setAll([]);
    }
  }, []);
  useEffect(() => { void loadAll(); }, [loadAll]);

  const narrowed = view !== '' || q.trim() !== '';
  const loadPage = useCallback(async () => {
    if (narrowed) return;
    setPageRows(null);
    try {
      setPageRows(asPage<Zone>(await api.get<unknown>(withScope(`/pricing/admin/zones/?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`))));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the zones.');
      setPageRows({ count: 0, results: [] });
    }
  }, [page, narrowed]);
  useEffect(() => { void loadPage(); }, [loadPage]);

  const byId = useMemo(() => new Map((all ?? []).map((z) => [String(z.id), z])), [all]);
  const pendingFor = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of pending) m.set(r.target_id, (m.get(r.target_id) ?? 0) + 1);
    return m;
  }, [pending]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (all ?? []).filter((z) => (view === 'active' ? z.is_active : view === 'inactive' ? !z.is_active
      : view === 'pending' ? pendingFor.has(String(z.id)) : true)
      && (!needle || [z.name, z.code, z.city, z.state_code, z.country].some((t) => (t ?? '').toLowerCase().includes(needle))));
  }, [all, view, q, pendingFor]);

  // The map labels zones by code; an inactive and an active zone can share a code over time, so
  // the id stays the row key and the code is the visible key.
  const mapZones = useMemo<MapZone[]>(() => (all ?? []).map((z) => ({
    key: z.code, label: `${z.name} (${z.code})`, rings: outerRings(z.polygon_geojson),
    tone: z.is_active ? 'live' : 'inactive',
  })), [all]);
  const openCode = (code: string) => {
    const z = (all ?? []).find((x) => x.code === code);
    if (z) router.push(`/ops/zones/${z.id}`);
  };

  const columns: ListColumn<Zone>[] = [
    {
      key: 'name', label: 'Zone', primary: true,
      render: (z) => <><Link href={`/ops/zones/${z.id}`}>{z.name}</Link> <span className="muted">{z.code}</span></>,
    },
    { key: 'where', label: 'Where', render: (z) => `${z.city}, ${z.state_code}, ${z.country}` },
    { key: 'type', label: 'Type', render: (z) => (TYPE_WORDS[z.zone_type] ?? z.zone_type).split(' (')[0] },
    { key: 'priority', label: 'Priority', num: true, render: (z) => z.priority },
    { key: 'area', label: 'Area', num: true, render: (z) => (z.area_km2 === null ? '—' : `${z.area_km2.toLocaleString('en')} km²`) },
    { key: 'version', label: 'Version', num: true, render: (z) => `v${z.version}` },
    { key: 'changed', label: 'Last changed', render: (z) => stamp(z.updated_at, z.timezone_name) },
    {
      key: 'status', label: 'Status',
      render: (z) => (
        <>
          {z.is_active ? <StatusChip tone="good">Active</StatusChip> : <StatusChip tone="neutral">Inactive</StatusChip>}
          {pendingFor.get(String(z.id)) ? <> <StatusChip tone="info">{pendingFor.get(String(z.id))} waiting</StatusChip></> : null}
        </>
      ),
    },
  ];

  const rows = narrowed ? filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : pageRows?.results ?? [];
  const total = narrowed ? (all ? filtered.length : null) : pageRows ? pageRows.count : null;
  const allZones = all ?? [];

  return (
    <div className="grid gap-4">
      <div className="ops-split ops-split--map">
        <ListPage<Zone>
          pageKey="zones"
          title="Zones"
          summary="Where we operate. A change is a request a second admin approves, and never reaches a trip already booked. Fares and commission are under Pricing."
          actionsSlot={may ? <Link href="/ops/zones/new" className="sg-btn sg-btn--primary sg-btn--sm">New zone…</Link> : undefined}
          views={[
            { key: '', label: 'All', count: all ? allZones.length : undefined },
            { key: 'active', label: 'Active', count: all ? allZones.filter((z) => z.is_active).length : undefined },
            { key: 'inactive', label: 'Inactive', count: all ? allZones.filter((z) => !z.is_active).length : undefined },
            { key: 'pending', label: 'Waiting for a checker', count: all ? allZones.filter((z) => pendingFor.has(String(z.id))).length : undefined },
          ]}
          view={view}
          onView={(v) => { setView(v); setPage(1); }}
          chips={q.trim() ? [{ key: 'q', label: `Search: ${q.trim()}`, onRemove: () => { setQ(''); setPage(1); } }] : []}
          filterSlot={(
            <>
              <label className="sr-only" htmlFor="zn-q">Search zones</label>
              <input id="zn-q" className="input ops-list__search" type="search" placeholder="Search a zone, code or city"
                value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </>
          )}
          columns={columns}
          rows={rows}
          rowKey={(z) => z.id}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPage={setPage}
          onRow={(z) => router.push(`/ops/zones/${z.id}`)}
          loading={narrowed ? all === null : pageRows === null}
          error={error}
          empty={narrowed ? 'No zone matches.' : may ? 'No service zones in your scope yet. Draw the first one.' : 'No service zones in your scope yet.'}
        />
        <section className="ops-card ops-card--map" aria-label="Map of zones">
          {all === null ? (
            <p className="ops-record__empty" aria-busy="true">Loading the map of zones…</p>
          ) : allZones.length === 0 ? (
            <p className="ops-record__empty">Nothing is configured in your scope yet.</p>
          ) : (
            <ZoneMap caption="Every zone in your scope" zones={mapZones} onZone={openCode} />
          )}
        </section>
      </div>

      {pending.length > 0 ? (
        <section className="ops-card" aria-labelledby="zn-pending">
          <header className="ops-card__head">
            <div>
              <h2 id="zn-pending">Waiting for a checker ({pending.length})</h2>
              <p>A second admin decides these in Approvals.</p>
            </div>
          </header>
          <div className="ops-list__table">
            <table className="ops-table ops-table--compact">
              <caption className="sr-only">Zone changes waiting for approval</caption>
              <thead>
                <tr><th scope="col">Request</th><th scope="col">Zone</th><th scope="col">What</th><th scope="col">Asked by</th><th scope="col">When</th></tr>
              </thead>
              <tbody>
                {pending.map((r) => {
                  const z = byId.get(r.target_id);
                  return (
                    <tr key={r.id}>
                      <td><PageLink page="approvals" href={`/ops/approvals?id=${r.id}`}>APR-{r.id}</PageLink></td>
                      <td>{z ? <Link href={`/ops/zones/${z.id}`}>{z.name}</Link> : r.payload?.zone_code ?? r.target_id}</td>
                      <td>{requestWords(r)}</td>
                      <td>{r.maker?.label || r.maker?.email || '—'}</td>
                      <td>{stamp(r.requested_at, z?.timezone_name)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
