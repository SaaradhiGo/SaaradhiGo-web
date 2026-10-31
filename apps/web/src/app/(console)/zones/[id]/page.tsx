'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import { currencySymbol } from '@/lib/money';
import { interpretWrite } from '@/lib/trips';
import {
  KIND_WORDS, TYPE_WORDS, canDraftZones, outerRings, requestWords, type History, type Revision, type Zone,
} from '@/lib/zones';
import { ZoneMap, type MapZone, type PointMark } from '@/components/console/zones/ZoneMap';
import { ZoneEditor } from '@/components/console/zones/ZoneEditor';
import { PointTester } from '@/components/console/zones/PointTester';
import {
  DataTable, Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton, type Column,
} from '@/components/console/ui';

/**
 * One zone: its polygon, settings, pending requests and history, a point tester, and a draft
 * editor that proposes a change.
 *
 * EVERY WRITE HERE IS A REQUEST. "Draft a change", "Deactivate", "Reactivate" and "Restore"
 * each raise a `zone.change` request a different admin approves; the page shows the request
 * number and the zone stays as it is until then. A deactivation is refused while a trip in
 * the zone is live, and says so.
 */
type RateCard = {
  id: number; vehicle_type_name: string; base_fare: string; per_km_fare: string; per_min_fare: string;
  min_fare: string; version: number;
};

function asList<T>(r: unknown): T[] {
  const o = r as { results?: T[]; data?: T[] } | T[];
  if (Array.isArray(o)) return o;
  if (Array.isArray(o?.results)) return o.results;
  if (Array.isArray(o?.data)) return o.data;
  return [];
}

export default function ZoneDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const access = useAdminAccess();
  const may = canDraftZones(access);
  const [zone, setZone] = useState<Zone | null>(null);
  const [all, setAll] = useState<Zone[]>([]);
  const [history, setHistory] = useState<History | null>(null);
  const [cards, setCards] = useState<RateCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; kind: 'pending' | 'done' } | null>(null);
  const [compare, setCompare] = useState<Revision | null>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [point, setPoint] = useState<PointMark>(null);
  const [acting, setActing] = useState<null | 'deactivate' | 'reactivate' | { restore: number }>(null);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [actError, setActError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setNotFound(false);
    try {
      const z = await api.get<Zone>(`/pricing/admin/zones/${id}/`);
      setZone(z);
      const [list, h, c] = await Promise.all([
        api.get<unknown>('/pricing/admin/zones/').catch(() => []),
        api.get<History>(`/pricing/admin/zones/${id}/history/?polygons=1`).catch(() => null),
        api.get<unknown>(`/pricing/admin/rate-cards/?zone=${id}&is_active=true`).catch(() => null),
      ]);
      setAll(asList<Zone>(list));
      setHistory(h);
      setCards(c === null ? null : asList<RateCard>(c));
    } catch (err) {
      setZone(null);
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this zone.');
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const mapZones = useMemo<MapZone[]>(() => {
    if (!zone) return [];
    const others: MapZone[] = all.filter((z) => z.id !== zone.id).map((z) => ({
      key: z.code, label: z.name, rings: outerRings(z.polygon_geojson), tone: z.is_active ? 'live' : 'inactive',
    }));
    const me: MapZone = { key: zone.code, label: zone.name, rings: outerRings(zone.polygon_geojson), tone: 'selected' };
    const rev: MapZone[] = compare
      ? [{ key: `v${compare.version}`, label: `Revision ${compare.version}`, rings: outerRings(compare.snapshot.polygon_geojson as Zone['polygon_geojson']), tone: 'compare' }]
      : [];
    return [...others, me, ...rev];
  }, [zone, all, compare]);

  function pick(la: number, ln: number) { setPoint({ lat: la, lng: ln }); setLat(String(la)); setLng(String(ln)); }
  function typed(a: string, b: string) {
    setLat(a); setLng(b);
    const x = Number(a); const y = Number(b);
    setPoint(a.trim() !== '' && b.trim() !== '' && Number.isFinite(x) && Number.isFinite(y) ? { lat: x, lng: y } : null);
  }

  async function sendAction() {
    if (!zone || !acting) return;
    if (why.trim().length < 5) { setActError('Say why, in a few words.'); return; }
    setBusy(true); setActError(null);
    try {
      const path = typeof acting === 'string'
        ? `/pricing/admin/zones/${zone.id}/${acting}/`
        : `/pricing/admin/zones/${zone.id}/restore/`;
      const body = await api.post<never>(path, typeof acting === 'string'
        ? { reason: why.trim() } : { version: acting.restore, reason: why.trim() });
      const r = interpretWrite(body, 'The change was applied.');
      setNotice({ text: r.message, kind: r.kind === 'pending' ? 'pending' : 'done' });
      setActing(null); setWhy('');
      void load();
    } catch (err) {
      setActError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <>
        <PageHeader title="Zone" />
        <Empty title="No such zone" detail="It does not exist, or it is outside your scope." />
        <p><Link href="/zones" className="ops-linkbtn">Back to zones</Link></p>
      </>
    );
  }
  if (error) {
    return (
      <>
        <PageHeader title="Zone" />
        <ErrorState title="The zone could not be loaded" detail={error} onRetry={() => void load()} />
      </>
    );
  }
  if (!zone) {
    return (
      <>
        <PageHeader title="Zone" />
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the zone</span>
          <Skeleton kind="row" count={5} />
        </div>
      </>
    );
  }

  const symbol = currencySymbol(zone.currency);
  const pending = history?.pending_requests ?? [];
  const revisionColumns: Column<Revision>[] = [
    { key: 'v', label: 'Version', num: true, width: '6rem', sortValue: (r) => r.version, render: (r) => `v${r.version}` },
    { key: 'kind', label: 'What', width: '10rem', render: (r) => (
      <>{KIND_WORDS[r.kind]}{r.restored_from_version ? ` v${r.restored_from_version}` : ''}</>
    ) },
    { key: 'who', label: 'Asked by', hideBelow: 1100, render: (r) => r.maker.label || 'system' },
    { key: 'checker', label: 'Approved by', hideBelow: 1100, render: (r) => r.checker?.label ?? '—' },
    { key: 'when', label: 'Applied', width: '9rem', sortValue: (r) => r.applied_at, render: (r) => stamp(r.applied_at) },
    { key: 'why', label: 'Reason', hideBelow: 1100, render: (r) => r.reason || '—' },
    { key: 'act', label: 'Actions', width: '13rem', render: (r) => (
      <span className="zn-rowact">
        <button type="button" className="ops-linkbtn" aria-pressed={compare?.id === r.id}
          onClick={(e) => { e.stopPropagation(); setCompare(compare?.id === r.id ? null : r); }}>
          {compare?.id === r.id ? 'Hide on map' : 'Show on map'}
        </button>
        {may && r.version !== zone.version && r.kind !== 'deactivate' && r.kind !== 'reactivate' ? (
          <button type="button" className="ops-linkbtn" onClick={(e) => { e.stopPropagation(); setActing({ restore: r.version }); setWhy(''); setActError(null); }}>
            Restore…
          </button>
        ) : null}
      </span>
    ) },
  ];

  return (
    <>
      <PageHeader
        title={zone.name}
        subtitle={<>{zone.code} · {zone.city}, {zone.state_code}, {zone.country} · version {zone.version}</>}
        actions={(
          <>
            <Link href="/zones" className="sg-btn sg-btn--ghost sg-btn--sm">All zones</Link>
            {may ? (
              <>
                <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setDrafting((d) => !d)} aria-expanded={drafting}>
                  {drafting ? 'Close the draft' : 'Draft a change…'}
                </button>
                <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm"
                  onClick={() => { setActing(zone.is_active ? 'deactivate' : 'reactivate'); setWhy(''); setActError(null); }}>
                  {zone.is_active ? 'Deactivate…' : 'Reactivate…'}
                </button>
              </>
            ) : null}
          </>
        )}
      />

      {notice ? (
        <div className={notice.kind === 'pending' ? 'ops-confirm mb-4' : 'alert-success mb-4'} role="status">
          <b>{notice.text}</b>
        </div>
      ) : null}

      <div className="grid gap-4">
        {acting ? (
          <Panel title={typeof acting === 'string' ? (acting === 'deactivate' ? 'Deactivate this zone' : 'Reactivate this zone') : `Restore version ${acting.restore}`}>
            <div className="ops-form">
              <p className="help m-0">
                {acting === 'deactivate'
                  ? 'Pickups inside it will resolve to the next zone that contains them, or to none. It is refused while a trip in this zone is live.'
                  : typeof acting === 'object'
                    ? `Puts the polygon and settings of version ${acting.restore} back, as a new version. It is a request like any other.`
                    : 'Puts the zone back into service. The overlap rules are checked again.'}
              </p>
              <label className="ops-form__label" htmlFor="zn-act-why">Why</label>
              <textarea id="zn-act-why" className="input" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} />
              {actError ? <div className="alert-error" role="alert">{actError}</div> : null}
              <div className="zn-editor__actions">
                <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void sendAction()} disabled={busy}>
                  {busy ? 'Sending…' : 'Send for approval'}
                </button>
                <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setActing(null)}>Cancel</button>
              </div>
            </div>
          </Panel>
        ) : null}

        {drafting ? (
          <Panel title="Draft a change">
            <ZoneEditor
              zone={zone} zones={all} cities={[]}
              onSent={(text) => { setNotice({ text, kind: text.startsWith('Sent for approval') ? 'pending' : 'done' }); setDrafting(false); void load(); }}
              onCancel={() => setDrafting(false)}
            />
          </Panel>
        ) : (
          <Panel title="Shape and settings"
            action={zone.is_active ? <Pill tone="good">Active</Pill> : <Pill tone="neutral">Inactive</Pill>}>
            <ZoneMap caption={`${zone.name} on the map of zones`} zones={mapZones} point={point} onPoint={pick} fit={outerRings(zone.polygon_geojson)} />
            <Facts>
              <Fact label="Type">{TYPE_WORDS[zone.zone_type] ?? zone.zone_type}</Fact>
              <Fact label="Priority">{zone.priority}</Fact>
              <Fact label="Area">{zone.area_km2 === null ? '—' : `${zone.area_km2.toLocaleString('en')} km²`}</Fact>
              <Fact label="Inside zone">{zone.parent_code ?? 'None'}</Fact>
              <Fact label="City node">{zone.geo_node ?? '—'}</Fact>
              <Fact label="Currency">{zone.currency}</Fact>
              <Fact label="Time zone">{zone.timezone_name}</Fact>
              <Fact label="Distance unit">{zone.distance_unit === 'mi' ? 'Miles' : 'Kilometres'}</Fact>
              <Fact label="Tax">{zone.tax_mode === 'additive' ? 'Added on top' : 'Included in the fare'}</Fact>
              <Fact label="Per-trip fee">
                {Number(zone.per_trip_fee) > 0 ? `${symbol}${zone.per_trip_fee} (${zone.per_trip_fee_label})` : 'None'}
              </Fact>
            </Facts>
          </Panel>
        )}

        {pending.length > 0 ? (
          <Panel title={`Waiting for a checker (${pending.length})`} flush>
            <DataTable
              caption="Requests waiting for approval for this zone" maxHeight={false} density="compact"
              rows={pending} rowKey={(r) => r.id}
              columns={[
                { key: 'id', label: 'Request', width: '7rem', render: (r) => `#${r.id}` },
                { key: 'what', label: 'What', render: (r) => requestWords(r) },
                { key: 'who', label: 'Asked by', hideBelow: 1100, render: (r) => r.maker?.label || r.maker?.email || '—' },
                { key: 'why', label: 'Reason', hideBelow: 1100, render: (r) => r.request_reason || '—' },
                { key: 'when', label: 'When', width: '9rem', render: (r) => stamp(r.requested_at) },
              ] as Column<(typeof pending)[number]>[]}
            />
          </Panel>
        ) : null}

        <Panel title="Try a point">
          <PointTester lat={lat} lng={lng} onLat={(v) => typed(v, lng)} onLng={(v) => typed(lat, v)} />
        </Panel>

        <Panel flush title="History">
          {history === null ? (
            <Empty title="History unavailable" detail="The revisions could not be loaded." />
          ) : history.revisions.length === 0 ? (
            <Empty title="No revisions yet" detail="Versioning starts with the next approved change." />
          ) : (
            <DataTable
              caption={`Revisions of ${zone.name}`} rows={history.revisions} columns={revisionColumns}
              rowKey={(r) => r.id} density="compact" maxHeight={false} defaultSort={{ key: 'v', dir: 'desc' }}
            />
          )}
        </Panel>

        <Panel title="Fare cards in force">
          {cards === null ? (
            <p className="help m-0">The fare cards could not be loaded.</p>
          ) : cards.length === 0 ? (
            <p className="help m-0">This zone has no fare card of its own, so its pickups use its parent&apos;s. Fares are under <Link href="/pricing/fare-cards" className="ops-linkbtn">Pricing</Link>.</p>
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table ops-table--compact ops-table--auto">
                <caption className="sr-only">Active fare cards of {zone.name}</caption>
                <thead><tr><th scope="col">Class</th><th scope="col" className="num">Base</th><th scope="col" className="num">Per {zone.distance_unit}</th><th scope="col" className="num">Per min</th><th scope="col" className="num">Minimum</th></tr></thead>
                <tbody>
                  {cards.map((c) => (
                    <tr key={c.id}>
                      <th scope="row">{c.vehicle_type_name} <span className="muted">v{c.version}</span></th>
                      <td className="num">{symbol}{c.base_fare}</td><td className="num">{symbol}{c.per_km_fare}</td>
                      <td className="num">{symbol}{c.per_min_fare}</td><td className="num">{symbol}{c.min_fare}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
