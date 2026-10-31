'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp } from '@/lib/consoleTime';
import { canDraftZones, outerRings, requestWords, TYPE_WORDS, type PendingRequest, type Zone } from '@/lib/zones';
import { ZoneMap, type MapZone } from '@/components/console/zones/ZoneMap';
import {
  Column, DataTable, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Service zones: where we operate, drawn.
 *
 * READ FIRST, CHANGE BY REQUEST. This page shows every zone in the operator's scope on one
 * map and in a table; a zone opens to its polygon, settings, history and pending requests.
 * Creating or changing a zone is a request that a second admin approves (`zone.change`);
 * nothing on this page edits a polygon directly. Fares and commission are under Pricing.
 */
function asList<T>(r: unknown): T[] {
  const o = r as { results?: T[]; data?: T[] } | T[];
  if (Array.isArray(o)) return o;
  if (Array.isArray(o?.results)) return o.results;
  if (Array.isArray(o?.data)) return o.data;
  return [];
}

export default function ZonesPage() {
  const router = useRouter();
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const may = canDraftZones(access);

  const load = useCallback(async () => {
    setZones(null);
    setError(null);
    try {
      const [z, p] = await Promise.all([
        api.get<unknown>('/pricing/admin/zones/'),
        api.get<{ results: PendingRequest[] }>('/pricing/admin/zones/pending/').catch(() => ({ results: [] })),
      ]);
      setZones(asList<Zone>(z));
      setPending(p.results ?? []);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the zones.');
      setZones([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => new Map((zones ?? []).map((z) => [String(z.id), z])), [zones]);
  const pendingFor = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of pending) m.set(r.target_id, (m.get(r.target_id) ?? 0) + 1);
    return m;
  }, [pending]);

  const mapZones = useMemo<MapZone[]>(() => (zones ?? []).map((z) => ({
    key: String(z.id), label: `${z.name} (${z.code})`, rings: outerRings(z.polygon_geojson),
    tone: z.is_active ? 'live' : 'inactive',
  })), [zones]);

  // The map keys zones by id (an inactive and an active zone can share a code over time); the
  // outline labels them by code, so give it the code as the visible key.
  const labelled = useMemo(() => mapZones.map((m) => ({ ...m, key: byId.get(m.key)?.code ?? m.key })), [mapZones, byId]);
  const open = (code: string) => {
    const z = (zones ?? []).find((q) => q.code === code);
    if (z) router.push(`/zones/${z.id}`);
  };

  const columns: Column<Zone>[] = [
    {
      key: 'name', label: 'Zone', sortValue: (z) => z.name,
      render: (z) => (
        <>
          <Link href={`/zones/${z.id}`} className="ops-linkbtn" onClick={(e) => e.stopPropagation()}><b>{z.name}</b></Link>{' '}
          <span className="muted">{z.code}</span>
        </>
      ),
    },
    { key: 'where', label: 'Where', hideBelow: 1100, sortValue: (z) => `${z.country} ${z.state_code} ${z.city}`, render: (z) => `${z.city}, ${z.state_code}, ${z.country}` },
    { key: 'type', label: 'Type', width: '8rem', hideBelow: 1100, sortValue: (z) => z.zone_type, render: (z) => <span className="capitalize">{(TYPE_WORDS[z.zone_type] ?? z.zone_type).split(' (')[0]}</span> },
    { key: 'priority', label: 'Priority', num: true, width: '6rem', sortValue: (z) => z.priority, render: (z) => z.priority },
    { key: 'area', label: 'Area', num: true, width: '7rem', sortValue: (z) => z.area_km2 ?? 0, render: (z) => (z.area_km2 === null ? '—' : `${z.area_km2.toLocaleString('en')} km²`) },
    { key: 'version', label: 'Version', num: true, width: '6rem', hideBelow: 1100, sortValue: (z) => z.version, render: (z) => `v${z.version}` },
    {
      key: 'status', label: 'Status', width: '11rem', sortValue: (z) => (z.is_active ? 1 : 0),
      render: (z) => (
        <>
          {z.is_active ? <Pill tone="good">Active</Pill> : <Pill tone="neutral">Inactive</Pill>}
          {pendingFor.get(String(z.id)) ? <> <Pill tone="wait">{pendingFor.get(String(z.id))} pending</Pill></> : null}
        </>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Zones"
        subtitle="Where we operate. A change is a request a second admin approves, and never reaches a trip already booked. Fares and commission are under Pricing."
        actions={may ? <Link href="/zones/new" className="sg-btn sg-btn--primary sg-btn--sm">New zone…</Link> : undefined}
      />

      <div className="grid gap-4">
        <Panel title="Map of zones">
          {zones === null ? (
            <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
              <span className="sr-only">Loading the map of zones</span>
              <Skeleton kind="row" count={4} />
            </div>
          ) : error ? (
            <ErrorState title="The zones could not be loaded" detail={error} onRetry={() => void load()} />
          ) : zones.length === 0 ? (
            <Empty title="No service zones" detail="Nothing is configured in your scope yet." />
          ) : (
            <ZoneMap caption="Every zone in your scope" zones={labelled} onZone={open} />
          )}
        </Panel>

        {pending.length > 0 ? (
          <Panel title={`Waiting for a checker (${pending.length})`} flush>
            <DataTable
              caption="Zone changes waiting for approval" density={density} maxHeight={false}
              rows={pending} rowKey={(r) => r.id}
              onRow={(r) => { const z = byId.get(r.target_id); if (z) router.push(`/zones/${z.id}`); }}
              columns={[
                { key: 'id', label: 'Request', width: '7rem', render: (r) => `#${r.id}` },
                { key: 'zone', label: 'Zone', render: (r) => byId.get(r.target_id)?.name ?? r.payload?.zone_code ?? r.target_id },
                { key: 'what', label: 'What', render: (r) => requestWords(r) },
                { key: 'who', label: 'Asked by', hideBelow: 1100, render: (r) => r.maker?.label || r.maker?.email || '—' },
                { key: 'when', label: 'When', width: '9rem', render: (r) => stamp(r.requested_at) },
              ] as Column<PendingRequest>[]}
            />
          </Panel>
        ) : null}

        <Panel flush title="Service zones">
          <TableToolbar
            summary={zones ? `${zones.length} zone${zones.length === 1 ? '' : 's'} · ${zones.filter((z) => z.is_active).length} active` : null}
            density={density}
            onDensity={setDensity}
          />
          {zones === null ? (
            <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
              <span className="sr-only">Loading zones</span>
              <Skeleton kind="row" count={5} />
            </div>
          ) : error ? (
            <div className="p-4"><ErrorState title="The zones could not be loaded" detail={error} onRetry={() => void load()} /></div>
          ) : zones.length === 0 ? (
            <Empty
              title="No service zones"
              detail={may ? 'Nothing is configured in your scope yet. Draw the first one.' : 'Nothing is configured in your scope yet.'}
            />
          ) : (
            <DataTable
              caption="Service zones"
              rows={zones}
              columns={columns}
              rowKey={(z) => z.id}
              density={density}
              onRow={(z) => router.push(`/zones/${z.id}`)}
              defaultSort={{ key: 'where', dir: 'asc' }}
              maxHeight={false}
            />
          )}
        </Panel>
      </div>
    </>
  );
}
