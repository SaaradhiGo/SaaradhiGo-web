'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { interpretWrite } from '@/lib/trips';
import {
  TYPE_WORDS, fieldWord, changeBody, changedFields, createBody, draftFromZone, draftProblem, isEditable,
  outerRings, polygonFromRows, previewBody, ringFromRows, rowsFromGeometry, rowsFromRing, rowsProblem,
  type City, type Draft, type ImpactResult, type Position, type Zone,
} from '@/lib/zones';
import { ZoneMap, type MapZone, type PointMark } from '@/components/console/zones/ZoneMap';
import { ImpactPanel } from '@/components/console/zones/ImpactPanel';
import { PointTester } from '@/components/console/zones/PointTester';

/**
 * The draft editor: the corners of a polygon, the settings, the impact preview and
 * "send for approval".
 *
 * NOTHING HERE CHANGES A ZONE. Submitting raises a `zone.change` request that a different
 * admin approves; the page says so and shows the request number. The preview and the point
 * tester only read.
 *
 * TWO WAYS TO EDIT THE SHAPE, ONE ANSWER. With a Google Maps key the corners are dragged on
 * the map; without one (the local fixture stack) the same corners are rows of latitude and
 * longitude in a table, with an outline drawn to scale. Both edit the same `rows`, so the
 * request is identical either way.
 */

const BLANK: Draft = {
  name: '', zone_type: 'city', priority: '10', state_code: '', city: '', parent: '', currency: '',
  timezone_name: '', distance_unit: '', tax_mode: '', per_trip_fee: '0', per_trip_fee_label: '',
  rows: [], marketOverrideReason: '',
};

export function ZoneEditor({ zone, zones, cities, onSent, onCancel }: {
  /** The zone being changed, or null for a new one. */
  zone: Zone | null;
  /** Every in-scope zone, for the context map and the parent choice. */
  zones: Zone[];
  /** The cities the operator may create a zone in (a new zone only). */
  cities: City[];
  onSent: (message: string) => void;
  onCancel?: () => void;
}) {
  const creating = zone === null;
  const editable = creating || isEditable(zone.polygon_geojson);
  const [draft, setDraft] = useState<Draft>(() => (zone ? draftFromZone(zone) : BLANK));
  const [code, setCode] = useState('');
  const [geoNode, setGeoNode] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [impactState, setImpactState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [point, setPoint] = useState<PointMark>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const seq = useRef(0);
  const ids = { name: useId(), type: useId(), priority: useId(), state: useId(), city: useId(), parent: useId(),
    cur: useId(), tz: useId(), unit: useId(), tax: useId(), fee: useId(), feeLabel: useId(), code: useId(),
    node: useId(), why: useId(), override: useId() };

  const city = cities.find((c) => c.code === geoNode) ?? null;
  const country = zone?.country ?? city?.country ?? '';
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const problem = draftProblem(draft, reason, { creating, code, geoNode });
  const changes = zone ? changedFields(zone, draft) : [];
  const marketTouched = changes.some((f) => ['currency', 'timezone_name', 'distance_unit'].includes(f))
    || (creating && [draft.currency, draft.timezone_name, draft.distance_unit].some((v) => v.trim() !== ''));
  const shapeProblem = rowsProblem(draft.rows);
  const ring = useMemo<Position[] | null>(() => (shapeProblem ? null : ringFromRows(draft.rows)), [draft.rows, shapeProblem]);

  // The preview: debounced, and only for a shape that can be one. A later answer never
  // overwrites a newer one.
  const fixed = useMemo(() => ({ code, geoNode, country }), [code, geoNode, country]);
  const bodyKey = JSON.stringify(zone ? previewBody(zone, draft, fixed) : previewBody(null, draft, fixed));
  useEffect(() => {
    if (!editable || shapeProblem || (creating && !geoNode)) { setImpact(null); setImpactState('idle'); return; }
    const mine = ++seq.current;
    setImpactState('loading');
    const t = setTimeout(async () => {
      try {
        const result = await api.post<ImpactResult>('/pricing/admin/zones/preview/', JSON.parse(bodyKey));
        if (mine !== seq.current) return;
        setImpact(result); setImpactState('idle');
      } catch {
        if (mine !== seq.current) return;
        setImpact(null); setImpactState('error');
      }
    }, 600);
    return () => clearTimeout(t);
  }, [bodyKey, editable, shapeProblem, creating, geoNode]);

  const onRing = useCallback((r: Position[]) => set('rows', rowsFromRing(r)), []);

  const mapZones = useMemo<MapZone[]>(() => zones
    .filter((z) => !zone || z.id !== zone.id)
    .map((z) => ({ key: z.code, label: z.name, rings: outerRings(z.polygon_geojson), tone: z.is_active ? 'live' : 'inactive' })),
  [zones, zone]);
  const originalZone = useMemo<MapZone[]>(() => (zone
    ? [{ key: `${zone.code} now`, label: `${zone.name} as it is now`, rings: outerRings(zone.polygon_geojson), tone: 'compare' }]
    : []), [zone]);

  const fit = useMemo(() => (zone ? outerRings(zone.polygon_geojson) : null), [zone]);
  const allZones = useMemo(() => [...mapZones, ...originalZone], [mapZones, originalZone]);

  function setRow(i: number, k: 'lat' | 'lng', v: string) {
    setDraft((d) => ({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));
  }
  const addRow = () => setDraft((d) => ({ ...d, rows: [...d.rows, { lat: '', lng: '' }] }));
  const removeRow = (i: number) => setDraft((d) => ({ ...d, rows: d.rows.filter((_, j) => j !== i) }));
  const reset = () => zone && set('rows', rowsFromGeometry(zone.polygon_geojson));

  function pick(la: number, ln: number) {
    setPoint({ lat: la, lng: ln });
    setLat(String(la));
    setLng(String(ln));
  }
  function typed(nextLat: string, nextLng: string) {
    setLat(nextLat); setLng(nextLng);
    const a = Number(nextLat); const b = Number(nextLng);
    setPoint(nextLat.trim() !== '' && nextLng.trim() !== '' && Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null);
  }

  async function send() {
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      const body = zone
        ? await api.patch<never>(`/pricing/admin/zones/${zone.id}/`, changeBody(zone, draft, reason))
        : await api.post<never>('/pricing/admin/zones/', createBody(code, geoNode, country, draft, reason));
      const result = interpretWrite(body, zone ? 'The change was applied.' : 'The zone was created.');
      onSent(result.message);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  const draftForTester = useCallback(() => {
    if (!editable || shapeProblem || polygonFromRows(draft.rows) === null) return null;
    return previewBody(zone, draft, fixed);
  }, [editable, shapeProblem, draft, zone, fixed]);

  const parents = zones.filter((z) => z.is_active && (!zone || z.id !== zone.id) && z.country === (country || z.country));

  return (
    <div className="zn-editor">
      <div className="zn-editor__cols">
        <section className="ops-form" aria-label="Zone settings">
          {creating ? (
            <>
              <div>
                <label className="ops-form__label" htmlFor={ids.node}>City</label>
                <select id={ids.node} className="input" value={geoNode} onChange={(e) => setGeoNode(e.target.value)}>
                  <option value="">Choose a city…</option>
                  {cities.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
                </select>
              </div>
              <div>
                <label className="ops-form__label" htmlFor={ids.code}>Zone code</label>
                <input id={ids.code} className="input" value={code} onChange={(e) => setCode(e.target.value)}
                  placeholder="IN-KA-BLR" autoCapitalize="characters" />
              </div>
            </>
          ) : null}
          <div>
            <label className="ops-form__label" htmlFor={ids.name}>Name</label>
            <input id={ids.name} className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="zn-grid2">
            <div>
              <label className="ops-form__label" htmlFor={ids.type}>Type</label>
              <select id={ids.type} className="input" value={draft.zone_type} onChange={(e) => set('zone_type', e.target.value)}>
                {Object.entries(TYPE_WORDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="ops-form__label" htmlFor={ids.priority}>Priority</label>
              <input id={ids.priority} className="input" inputMode="numeric" value={draft.priority}
                onChange={(e) => set('priority', e.target.value)} />
            </div>
            <div>
              <label className="ops-form__label" htmlFor={ids.state}>State code</label>
              <input id={ids.state} className="input" value={draft.state_code} onChange={(e) => set('state_code', e.target.value)} />
            </div>
            <div>
              <label className="ops-form__label" htmlFor={ids.city}>City name</label>
              <input id={ids.city} className="input" value={draft.city} onChange={(e) => set('city', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="ops-form__label" htmlFor={ids.parent}>Inside zone (optional)</label>
            <select id={ids.parent} className="input" value={draft.parent} onChange={(e) => set('parent', e.target.value)}>
              <option value="">None (a top-level zone)</option>
              {parents.map((z) => <option key={z.code} value={z.code}>{z.name} ({z.code})</option>)}
            </select>
            <p className="help m-0">An airport or campus must lie inside its parent. The server checks it.</p>
          </div>

          <details className="zn-market" open={marketTouched}>
            <summary>Market settings</summary>
            <p className="help m-0">
              Leave these blank to use the country&apos;s defaults. Changing currency, time zone or distance unit away from the
              country&apos;s default needs a reason.
            </p>
            <div className="zn-grid2">
              <div>
                <label className="ops-form__label" htmlFor={ids.cur}>Currency</label>
                <input id={ids.cur} className="input" value={draft.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="ops-form__label" htmlFor={ids.unit}>Distance unit</label>
                <select id={ids.unit} className="input" value={draft.distance_unit} onChange={(e) => set('distance_unit', e.target.value)}>
                  <option value="">Country default</option>
                  <option value="km">Kilometres</option>
                  <option value="mi">Miles</option>
                </select>
              </div>
              <div>
                <label className="ops-form__label" htmlFor={ids.tz}>Time zone</label>
                <input id={ids.tz} className="input" value={draft.timezone_name} onChange={(e) => set('timezone_name', e.target.value)} />
              </div>
              <div>
                <label className="ops-form__label" htmlFor={ids.tax}>Tax</label>
                <select id={ids.tax} className="input" value={draft.tax_mode} onChange={(e) => set('tax_mode', e.target.value)}>
                  <option value="">Country default</option>
                  <option value="inclusive">Included in the fare</option>
                  <option value="additive">Added on top</option>
                </select>
              </div>
              <div>
                <label className="ops-form__label" htmlFor={ids.fee}>Per-trip fee</label>
                <input id={ids.fee} className="input" inputMode="decimal" value={draft.per_trip_fee} onChange={(e) => set('per_trip_fee', e.target.value)} />
              </div>
              <div>
                <label className="ops-form__label" htmlFor={ids.feeLabel}>Fee name</label>
                <input id={ids.feeLabel} className="input" value={draft.per_trip_fee_label} onChange={(e) => set('per_trip_fee_label', e.target.value)} />
              </div>
            </div>
            {marketTouched ? (
              <div>
                <label className="ops-form__label" htmlFor={ids.override}>Reason for the market override</label>
                <input id={ids.override} className="input" value={draft.marketOverrideReason}
                  onChange={(e) => set('marketOverrideReason', e.target.value)} />
              </div>
            ) : null}
          </details>
        </section>

        <section className="zn-editor__shape" aria-label="Shape">
          {editable ? (
            <>
              <ZoneMap
                caption="Draft shape on the map of zones"
                zones={allZones}
                draftRing={ring} onDraftRing={onRing} fit={fit}
                point={point} onPoint={pick}
              />
              {shapeProblem && draft.rows.length > 0 ? <p className="help m-0" role="status">{shapeProblem}</p> : null}
              <div className="zn-corners">
                <table className="ops-table ops-table--compact ops-table--auto">
                  <caption>Corners ({draft.rows.length})</caption>
                  <thead>
                    <tr><th scope="col">#</th><th scope="col">Latitude</th><th scope="col">Longitude</th><th scope="col"><span className="sr-only">Remove</span></th></tr>
                  </thead>
                  <tbody>
                    {draft.rows.map((r, i) => (
                      <tr key={i}>
                        <th scope="row">{i + 1}</th>
                        <td><input className="input" inputMode="decimal" aria-label={`Corner ${i + 1} latitude`} value={r.lat} onChange={(e) => setRow(i, 'lat', e.target.value)} /></td>
                        <td><input className="input" inputMode="decimal" aria-label={`Corner ${i + 1} longitude`} value={r.lng} onChange={(e) => setRow(i, 'lng', e.target.value)} /></td>
                        <td>
                          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => removeRow(i)}
                            aria-label={`Remove corner ${i + 1}`}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="zn-corners__actions">
                  <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={addRow}>Add a corner</button>
                  {zone ? <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={reset}>Reset to the current shape</button> : null}
                </div>
              </div>
            </>
          ) : (
            <div className="ops-note" role="status">
              <b>This zone has several parts or holes.</b> The console shows it but cannot edit its shape. Its settings can still be
              changed.
            </div>
          )}
        </section>
      </div>

      {editable ? <ImpactPanel result={impact} state={impactState} currency={zone?.currency || draft.currency || 'INR'} /> : null}

      {editable ? (
        <section aria-label="Try a point against this draft">
          <h3 className="ops-subhead">Try a point against this draft</h3>
          <PointTester lat={lat} lng={lng} onLat={(v) => typed(v, lng)} onLng={(v) => typed(lat, v)} draftBody={draftForTester} />
        </section>
      ) : null}

      <section className="ops-form" aria-label="Send for approval">
        <div>
          <label className="ops-form__label" htmlFor={ids.why}>Why (kept in the audit log and shown to the checker)</label>
          <textarea id={ids.why} className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {zone && changes.length > 0 ? (
          <div className="ops-confirm">
            <b>This request will change</b>
            <span>{changes.map(fieldWord).join(' · ')}</span>
          </div>
        ) : null}
        {problem && (reason || draft.rows.length > 0) ? <p className="help m-0" role="note">{problem}</p> : null}
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
        <div className="zn-editor__actions">
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void send()}
            disabled={busy || problem !== null || (zone !== null && changes.length === 0)}>
            {busy ? 'Sending…' : 'Send for approval'}
          </button>
          {onCancel ? <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onCancel}>Cancel</button> : null}
        </div>
        <p className="help m-0">
          Nothing changes until a different admin approves. Trips already booked keep the zone they were booked in.
        </p>
      </section>
    </div>
  );
}
