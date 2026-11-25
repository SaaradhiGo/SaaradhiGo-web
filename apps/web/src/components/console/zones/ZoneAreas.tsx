'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { interpretWrite } from '@/lib/trips';
import { classWord } from '@/lib/pricingWords';
import { DataTable, Drawer } from '@/components/console/ui';
import { ChangePreview } from '@/components/console/edit/ChangePreview';
import { usePreview } from '@/components/console/edit/usePreview';

/**
 * Pickup points, restricted areas and a service area per class (owner ruling, 25 Nov). Nothing is set
 * by default, so booking is unchanged until an area is approved. The server enforces them where every
 * booking passes, so the rider and driver apps follow them. Adding or removing one needs a second person.
 */
type Area = {
  id: number; kind: 'restricted' | 'pickup' | 'class_area'; name: string; polygon_geojson: unknown;
  points: Array<{ name: string; lat: number; lng: number }>; vehicle_type: string; is_active: boolean;
  created_by: string; reason: string; created_at: string;
};
const KIND_WORDS: Record<Area['kind'], string> = { restricted: 'Restricted area', pickup: 'Pickup points', class_area: 'Service area for a class' };
const EFFECT: Record<Area['kind'], string> = {
  restricted: 'No pickup or drop-off inside it.', pickup: 'Pickups inside it only at the named points.',
  class_area: 'That class is offered only for pickups inside it.',
};

export function ZoneAreas({ zoneId, may, classes }: { zoneId: number; may: boolean; classes: string[] }) {
  const [rows, setRows] = useState<Area[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Area | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setRows((await api.get<{ results: Area[] }>(`/pricing/admin/zones/${zoneId}/areas/`)).results); } catch (e) {
      setError(e instanceof ApiError && e.fromServer ? e.message : 'The areas could not be loaded.');
    }
  }, [zoneId]);
  useEffect(() => { void load(); }, [load]);
  const done = (t: string) => { setAdding(false); setRemoving(null); setNotice(t); void load(); };
  return (
    <section className="grid gap-3" aria-label="Areas">
      <div className="ops-row-actions">
        <p className="help m-0">Nothing is set by default. Each area changes booking only after a second person approves it.</p>
        {may ? <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setAdding(true)}>Add an area…</button> : null}
      </div>
      {notice ? <div className="ops-confirm" role="status"><b>{notice}</b></div> : null}
      {error ? <div className="alert-error" role="alert">{error}</div> : null}
      {rows ? (
        <DataTable caption="Areas in this zone" rows={rows} rowKey={(a) => a.id} maxHeight={false} wrap density="compact"
          columns={[
            { key: 'kind', label: 'Kind', render: (a) => KIND_WORDS[a.kind] },
            { key: 'name', label: 'Name', render: (a) => a.name },
            { key: 'what', label: 'Effect', render: (a) => (a.kind === 'pickup' ? `Pickup at: ${a.points.map((p) => p.name).join(', ')}`
              : a.kind === 'class_area' ? `${classWord(a.vehicle_type)} only inside it` : EFFECT[a.kind]) },
            { key: 'state', label: 'State', render: (a) => (a.is_active ? 'In force' : 'Removed') },
            { key: 'who', label: 'Added by', render: (a) => `${a.created_by || '—'} · ${a.reason || '—'}` },
            { key: 'act', label: '', render: (a) => (may && a.is_active ? (
              <button type="button" className="ops-linkbtn" onClick={() => setRemoving(a)}>Remove…</button>) : null) },
          ]} />
      ) : null}
      {adding ? <AddArea zoneId={zoneId} classes={classes} onClose={() => setAdding(false)} onDone={done} /> : null}
      {removing ? <RemoveArea zoneId={zoneId} area={removing} onClose={() => setRemoving(null)} onDone={done} /> : null}
    </section>
  );
}

function AddArea({ zoneId, classes, onClose, onDone }: { zoneId: number; classes: string[]; onClose: () => void; onDone: (t: string) => void }) {
  const [kind, setKind] = useState<Area['kind']>('restricted');
  const [name, setName] = useState('');
  const [shape, setShape] = useState('');
  const [points, setPoints] = useState('');
  const [vt, setVt] = useState(classes[0] ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  let polygon: unknown = null;
  try { polygon = shape.trim() ? JSON.parse(shape) : null; } catch { polygon = null; }
  // "Gate 3, 17.2401, 78.4294" per line.
  const pts = points.split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((p) => p.length === 3 && p[0])
    .map(([n, la, ln]) => ({ name: n, lat: Number(la), lng: Number(ln) }));
  const body = { kind, name, polygon_geojson: polygon, points: kind === 'pickup' ? pts : [], vehicle_type: kind === 'class_area' ? vt : '' };
  const shown = usePreview(polygon && name.trim().length > 1 ? `/pricing/admin/zones/${zoneId}/areas/preview/` : null, body);
  async function send() {
    setBusy(true); setError(null);
    try { onDone(interpretWrite(await api.post(`/pricing/admin/zones/${zoneId}/areas/`, { ...body, reason: reason.trim() }) as never, 'Sent for approval.').message); } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally { setBusy(false); }
  }
  return (
    <Drawer open wide title="Add an area" onClose={onClose}
      footer={<>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void send()}
          disabled={busy || !shown.display || reason.trim().length < 5}>{busy ? 'Sending…' : 'Send for approval'}</button>
      </>}>
      <div className="ops-form">
        <label className="ops-form__label" htmlFor="za-kind">Kind</label>
        <select id="za-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as Area['kind'])}>
          {(Object.keys(KIND_WORDS) as Area['kind'][]).map((k) => <option key={k} value={k}>{KIND_WORDS[k]}: {EFFECT[k]}</option>)}
        </select>
        <label className="ops-form__label" htmlFor="za-name">Name riders see</label>
        <input id="za-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Airport arrivals" />
        <label className="ops-form__label" htmlFor="za-shape">The area (GeoJSON polygon, as the zone editor exports)</label>
        <textarea id="za-shape" className="input" rows={4} value={shape} onChange={(e) => setShape(e.target.value)} />
        {shape.trim() && !polygon ? <p className="help m-0" role="note">That is not valid JSON.</p> : null}
        {kind === 'pickup' ? (
          <>
            <label className="ops-form__label" htmlFor="za-points">Pickup points, one per line: name, latitude, longitude</label>
            <textarea id="za-points" className="input" rows={3} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="Gate 3, 17.2401, 78.4294" />
          </>
        ) : null}
        {kind === 'class_area' ? (
          <>
            <label className="ops-form__label" htmlFor="za-class">Class</label>
            <select id="za-class" className="input" value={vt} onChange={(e) => setVt(e.target.value)}>
              {classes.map((c) => <option key={c} value={c}>{classWord(c)}</option>)}
            </select>
          </>
        ) : null}
        {shown.display ? <ChangePreview display={shown.display} /> : shown.error ? <div className="alert-error" role="alert">{shown.error}</div> : null}
        <label className="ops-form__label" htmlFor="za-why">Why (the approver and the history see it)</label>
        <textarea id="za-why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}

function RemoveArea({ zoneId, area, onClose, onDone }: { zoneId: number; area: Area; onClose: () => void; onDone: (t: string) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setBusy(true); setError(null);
    try { onDone(interpretWrite(await api.post(`/pricing/admin/zones/${zoneId}/areas/`, { remove: area.id, reason: reason.trim() }) as never, 'Sent for approval.').message); } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally { setBusy(false); }
  }
  return (
    <Drawer open title={`Remove · ${area.name}`} onClose={onClose}
      footer={<>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void send()} disabled={busy || reason.trim().length < 5}>
          {busy ? 'Sending…' : 'Send for approval'}</button>
      </>}>
      <div className="ops-form">
        <ChangePreview display={{ changes: [{ label: KIND_WORDS[area.kind], from: area.name, to: 'removed' }],
          effective: 'From approval: booking works there as it did before this area.' }} />
        <label className="ops-form__label" htmlFor="zr-why">Why</label>
        <textarea id="zr-why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}
