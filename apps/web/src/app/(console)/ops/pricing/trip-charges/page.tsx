'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import { canDraftPricing } from '@/lib/pricing';
import type { Position } from '@/lib/zones';
import { PricingNav } from '@/components/console/pricing';
import { ChangePreview, type ChangeDisplay } from '@/components/console/edit/ChangePreview';
import { usePreview } from '@/components/console/edit/usePreview';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { ZoneMap, type MapZone } from '@/components/console/zones/ZoneMap';
import { DataTable, Drawer, ErrorState, Skeleton } from '@/components/console/ui';

/**
 * Pricing > Trip charges (owner brief, 26 Nov): tolls, tolled roads, airport and venue fees, waiting and
 * interstate permits, per place. A rider-paid charge is passed through on the fare inside the locked
 * total; every change shows before/after, needs a reason and a second person, and starts the next day.
 */
type Kind = 'toll_plaza' | 'tolled_road' | 'airport' | 'venue' | 'waiting' | 'permit';
type Geometry = { type?: string; coordinates?: unknown };
type Item = { id: number; code: string; version: number; status: string; kind: Kind; kind_words: string; name: string;
  scope_code: string; geometry: Geometry; radius_m: number; corridor_m: number; applies_on: string; applies_words: string;
  who_pays: string; who_words: string; currency: string; amounts: Record<string, number>; amount_words: Record<string, string>;
  free_minutes: number; remit_to: string; sample: boolean; effective_from: string; effective_to: string | null;
  created_by: string; reason: string; created_at: string | null };
type Req = { id: number; ref: string | null; status: string; maker: string; reason: string; decision_reason: string;
  checker: string; requested_at: string; code: string; op: string; name: string | null; requested_from: string | null;
  changes: { label: string; from: string; to: string }[] | null };
type Country = { country: string; currency: string; items: Item[]; scheduled: Item[]; places: { scope_code: string; name: string }[];
  classes: { vehicle_type: string; name: string }[]; place_classes?: Record<string, string[]>; requests: Req[];
  toll_checks: { calls_this_month: number; list_cost_usd: string | null } };

const KIND_WORDS: Record<Kind, string> = { toll_plaza: 'Toll plaza', tolled_road: 'Tolled road', airport: 'Airport',
  venue: 'Venue', waiting: 'Waiting', permit: 'Interstate permit' };
const UNIT: Partial<Record<Kind, string>> = { tolled_road: ' per km', waiting: ' per minute' };
const DECISION: Record<string, string> = {
  requested: 'Waiting for approval', executed: 'Approved', approved: 'Approved', rejected: 'Rejected',
  returned: 'Sent back', cancelled: 'Withdrawn', expired: 'Expired', failed: 'Approved, but it failed',
};

/** Rings to draw an item on the zone map: a plaza as a small circle, a road as a thin band. */
function ringsOf(item: Pick<Item, 'kind' | 'geometry' | 'radius_m' | 'corridor_m'>): Position[][] {
  const g = item.geometry ?? {};
  const c = g.coordinates as unknown;
  if (g.type === 'Point' && Array.isArray(c)) {
    const [lng, lat] = c as [number, number];
    const r = Math.max(item.radius_m || 60, 150) / 111_320;
    return [Array.from({ length: 16 }, (_, i) => [lng + (r / Math.cos((lat * Math.PI) / 180)) * Math.cos((i / 16) * 2 * Math.PI),
      lat + r * Math.sin((i / 16) * 2 * Math.PI)] as Position)];
  }
  if (g.type === 'LineString' && Array.isArray(c)) {
    const path = c as Position[];
    const off = Math.max(item.corridor_m || 40, 120) / 111_320;
    return [[...path.map(([lng, lat]) => [lng, lat + off] as Position), ...[...path].reverse().map(([lng, lat]) => [lng, lat - off] as Position)]];
  }
  if (g.type === 'Polygon' && Array.isArray(c)) return [((c as Position[][])[0] ?? []).slice(0, -1)];
  return [];
}

/** The classes sold at a place (falls back to the country's list). */
function classesAt(c: Country, scope: string) {
  const sold = c.place_classes?.[scope];
  return sold ? c.classes.filter((x) => sold.includes(x.vehicle_type)) : c.classes;
}

const waitingFor = (code: string, c: Country) => c.requests.find((r) => r.status === 'requested' && r.code === code) ?? null;

export default function TripChargesPage() {
  const access = useAdminAccess();
  const may = canDraftPricing(access);
  const [data, setData] = useState<{ results: Country[]; sample_allowed: boolean } | null>(null);
  const [country, setCountry] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [viewing, setViewing] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api.get<{ results: Country[]; sample_allowed: boolean }>('/pricing/admin/trip-charges/');
      setData(d);
      setCountry((c) => c || d.results.find((r) => r.items.length)?.country || d.results[0]?.country || '');
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The trip charges could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const here = data?.results.find((r) => r.country === country) ?? null;
  // In force today, then those starting later (a new item starts the next local day).
  const rows = useMemo(() => [...(here?.items ?? []), ...(here?.scheduled ?? [])
    .filter((s) => !(here?.items ?? []).some((i) => i.code === s.code && i.version === s.version))], [here]);
  const shapes: MapZone[] = useMemo(() => rows.filter((i) => i.kind !== 'waiting')
    .map((i) => ({ key: i.code, label: i.name, rings: ringsOf(i), tone: 'live' })), [rows]);

  async function act(item: Item, op: 'retire' | 'withdraw') {
    if (!here) return;
    try {
      if (op === 'withdraw') {
        const r = waitingFor(item.code, here);
        if (!r) return;
        await api.post(`/approvals/admin/requests/${r.id}/cancel/`, { reason: 'Withdrawn by the editor' });
        setNotice(`The change to ${item.name} was withdrawn. The catalogue is unchanged.`);
      } else {
        await api.post('/pricing/admin/trip-charges/edit/', { country: here.country, code: item.code, op: 'retire',
          reason: `Remove ${item.name} from the catalogue` });
        setNotice(`Removing ${item.name} was sent for approval. It stays in force until a second person approves.`);
      }
      await load();
    } catch (err) {
      setNotice(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    }
  }

  return (
    <>
      <PricingNav />
      <header className="ops-list__head mb-3">
        <div>
          <h1>Trip charges</h1>
          <p>Tolls, airport and venue fees, waiting and interstate permits. A charge the rider pays is its own line inside
          the locked fare, passed through: no commission or fee is taken on it. Values are entered here; Google&apos;s toll
          price is only a cross-check.</p>
        </div>
        {may && here ? <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setEditing('new')}>Add a charge</button> : null}
      </header>
      {notice ? <div className="ops-confirm mb-3" role="status"><b>{notice}</b></div> : null}
      {error ? <ErrorState title="The trip charges could not be loaded" detail={error} onRetry={() => void load()} /> : null}
      {!data && !error ? <Skeleton kind="row" count={4} /> : null}
      {data && data.results.length > 1 ? (
        <div className="ops-row-actions mb-3" role="group" aria-label="Country">
          {data.results.map((r) => (
            <button key={r.country} type="button" aria-pressed={r.country === country}
              className={r.country === country ? 'sg-btn sg-btn--secondary sg-btn--sm' : 'sg-btn sg-btn--ghost sg-btn--sm'}
              onClick={() => setCountry(r.country)}>{r.places[0]?.name ?? r.country}</button>
          ))}
        </div>
      ) : null}
      {here ? (
        <div className="grid gap-4">
          <p className="help m-0">Google toll checks this month: <b>{here.toll_checks.calls_this_month}</b>
            {here.toll_checks.list_cost_usd ? ` (list price $${Number(here.toll_checks.list_cost_usd).toFixed(2)})` : ''}.
            Only for a route that crosses a toll below, once per route a day, plus a nightly sample of common routes.</p>
          {shapes.length ? <ZoneMap zones={shapes} caption="Where each charge applies" height={360}
            onZone={(code) => setViewing(rows.find((i) => i.code === code) ?? null)} /> : null}
          {!rows.length ? <p className="help m-0">No charges yet. Add the tolls, airports and waiting rule for this country.</p> : null}
          {rows.length ? <DataTable caption="Trip charges" rows={rows} rowKey={(i) => i.code} wrap maxHeight={false}
            columns={[
              { key: 'item', label: 'Charge', render: (i) => <>
                <b>{i.name}</b><br /><span className="muted">{i.kind_words}</span>
                {i.sample ? <>{' '}<StatusChip tone="caution" title="Not a real figure: replace it before launch">QA sample value</StatusChip></> : null}</> },
              { key: 'where', label: 'Where', render: (i) => i.kind === 'waiting' ? `First ${i.free_minutes} min free`
                : i.kind === 'toll_plaza' ? `Route passes within ${i.radius_m} m`
                : i.kind === 'tolled_road' ? `Driven inside a ${i.corridor_m} m corridor`
                : i.kind === 'permit' ? `Drop outside the area · paid to ${i.remit_to}` : i.applies_words },
              { key: 'amounts', label: 'Charge per class', render: (i) => (
                <ul className="m-0 p-0 list-none grid gap-1">
                  {classesAt(here, i.scope_code).map((c) => <li key={c.vehicle_type}>{c.name}: <b>{i.amount_words[c.vehicle_type] ?? 'not charged'}</b></li>)}
                </ul>) },
              { key: 'who', label: 'Who pays', render: (i) => i.who_words },
              { key: 'state', label: 'Status', render: (i) => {
                const r = waitingFor(i.code, here);
                return r ? <StatusChip tone="info">Waiting for approval{r.ref ? ` · ${r.ref}` : ''}</StatusChip>
                  : here.items.some((x) => x.code === i.code && x.version === i.version)
                    ? <StatusChip tone="good">{`In force · v${i.version}`}</StatusChip>
                    : <StatusChip tone="info">{`Starts ${i.effective_from} · v${i.version}`}</StatusChip>;
              } },
              { key: 'act', label: 'Actions', render: (i) => (
                <span className="ops-row-actions">
                  <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setViewing(i)}
                    aria-label={`History of ${i.name}`}>History</button>
                  {may && !waitingFor(i.code, here) ? <>
                    <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setEditing(i)}
                      aria-label={`Edit ${i.name}`}>Edit</button>
                    <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => void act(i, 'retire')}
                      aria-label={`Remove ${i.name}`}>Remove</button></> : null}
                  {may && waitingFor(i.code, here) ? <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
                    onClick={() => void act(i, 'withdraw')} aria-label={`Withdraw the change to ${i.name}`}>Withdraw</button> : null}
                </span>) },
            ]} /> : null}
        </div>
      ) : null}
      {editing && here ? <EditDrawer country={here} item={editing === 'new' ? null : editing} sampleAllowed={!!data?.sample_allowed}
        onClose={() => setEditing(null)} onSent={(t) => { setEditing(null); setNotice(t); void load(); }} /> : null}
      {viewing && here ? <HistoryDrawer country={here} item={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}

/** "lat, lng" lines <-> GeoJSON [lng, lat] pairs. */
function pointsText(g: Geometry): string {
  const c = g?.coordinates as unknown;
  const list = g?.type === 'Point' ? [c] : g?.type === 'Polygon' ? ((c as Position[][])?.[0] ?? []).slice(0, -1) : (c as Position[] | undefined) ?? [];
  return (list as Position[]).map(([lng, lat]) => `${lat}, ${lng}`).join('\n');
}
function parsePoints(text: string): Position[] {
  return text.split('\n').map((l) => l.split(/[,\s]+/).filter(Boolean).map(Number))
    .filter((p) => p.length >= 2 && p.every((n) => Number.isFinite(n))).map(([lat, lng]) => [lng, lat] as Position);
}
function geometryOf(kind: Kind, pts: Position[]): Geometry {
  if (kind === 'waiting') return {};
  if (kind === 'toll_plaza') return { type: 'Point', coordinates: pts[0] ?? null };
  if (kind === 'tolled_road') return { type: 'LineString', coordinates: pts };
  return { type: 'Polygon', coordinates: [pts.length ? [...pts, pts[0]] : []] };
}

function EditDrawer({ country, item, sampleAllowed, onClose, onSent }: { country: Country; item: Item | null; sampleAllowed: boolean;
  onClose: () => void; onSent: (t: string) => void }) {
  const unit = country.currency === 'INR' ? '₹' : country.currency === 'USD' ? '$' : country.currency;
  const [kind, setKind] = useState<Kind>(item?.kind ?? 'airport');
  const [name, setName] = useState(item?.name ?? '');
  const [scope, setScope] = useState(item?.scope_code ?? country.places.find((p) => p.scope_code)?.scope_code ?? '');
  const [who, setWho] = useState(item?.who_pays ?? 'rider');
  const [appliesOn, setAppliesOn] = useState(item?.applies_on || 'pickup');
  const [radius, setRadius] = useState(String(item?.radius_m || 60));
  const [corridor, setCorridor] = useState(String(item?.corridor_m || 40));
  const [free, setFree] = useState(String(item?.free_minutes ?? 3));
  const [remitTo, setRemitTo] = useState(item?.remit_to ?? '');
  const [points, setPoints] = useState(item ? pointsText(item.geometry) : '');
  const [sample, setSample] = useState(item?.sample ?? false);
  const sold = classesAt(country, scope);
  const start = useMemo(() => Object.fromEntries(country.classes.map((c) => [c.vehicle_type,
    item?.amounts[c.vehicle_type] != null ? String(item.amounts[c.vehicle_type] / 100) : ''])), [country, item]);
  const [values, setValues] = useState<Record<string, string>>(start);
  const [from, setFrom] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pts = parsePoints(points);
  const amounts = Object.fromEntries(Object.entries(values).filter(([k, v]) => v.trim() !== '' && sold.some((c) => c.vehicle_type === k))
    .map(([k, v]) => [k, Math.round(Number(v) * 100)]));
  const body = { country: country.country, ...(item ? { code: item.code } : {}), kind, name: name.trim(), scope_code: scope,
    who_pays: who, applies_on: appliesOn, radius_m: Number(radius), corridor_m: Number(corridor), free_minutes: Number(free),
    remit_to: remitTo, geometry: geometryOf(kind, pts), amounts, sample, ...(from ? { effective_from: from } : {}) };
  const ready = name.trim().length >= 3 && Object.keys(amounts).length > 0 && (kind === 'waiting' || pts.length > 0);
  const { display, error: previewError } = usePreview(ready ? '/pricing/admin/trip-charges/preview/' : null, body);
  const shown = display as (ChangeDisplay & { start?: { effective_from: string } }) | null;
  const draw = kind === 'waiting' ? [] : ringsOf({ kind, geometry: geometryOf(kind, pts), radius_m: Number(radius), corridor_m: Number(corridor) });
  const pointsHelp = kind === 'toll_plaza' ? 'The plaza: one line, latitude, longitude.'
    : kind === 'tolled_road' ? 'The road, in order along it: one "latitude, longitude" a line.'
    : kind === 'permit' ? 'The area a trip may end in without a permit (the home state), corner by corner.'
    : 'The area, corner by corner: one "latitude, longitude" a line.';

  async function send() {
    setBusy(true); setError(null);
    try {
      await api.post('/pricing/admin/trip-charges/edit/', { ...body, reason: reason.trim() });
      onSent(`Sent for approval. ${item ? `${item.name} v${item.version} stays in force` : 'Nothing is charged'} until a second person approves.`);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    } finally { setBusy(false); }
  }

  const field = (id: string, label: string, input: React.ReactNode, help?: string) => (
    <div className="ops-field"><label className="ops-form__label" htmlFor={id}>{label}</label>{input}{help ? <span className="help">{help}</span> : null}</div>
  );
  return (
    <Drawer open wide title={item ? `Edit · ${item.name}` : 'Add a trip charge'} onClose={onClose}
      footer={<>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void send()}
          disabled={busy || !ready || !shown || reason.trim().length < 5}>{busy ? 'Sending…' : 'Send for approval'}</button>
      </>}>
      <div className="grid gap-4">
        {field('tc-kind', 'Kind', <select id="tc-kind" className="input" value={kind} disabled={!!item} onChange={(e) => setKind(e.target.value as Kind)}>
          {(Object.keys(KIND_WORDS) as Kind[]).map((k) => <option key={k} value={k}>{KIND_WORDS[k]}</option>)}</select>)}
        {field('tc-name', 'Name riders see', <input id="tc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />,
          kind === 'toll_plaza' || kind === 'tolled_road' ? 'Riders read "Toll (estimated): <name>".' : undefined)}
        {field('tc-place', 'Place (who may edit it)', <select id="tc-place" className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
          {country.places.map((p) => <option key={p.scope_code || 'country'} value={p.scope_code}>{p.name}</option>)}</select>)}
        {field('tc-who', 'Who pays', <select id="tc-who" className="input" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="rider">Rider pays (passed through on the fare)</option>
          <option value="driver">Driver pays (not on the fare)</option>
          <option value="platform">SaaradhiGo pays (not on the fare)</option></select>)}
        {kind === 'airport' || kind === 'venue' ? field('tc-on', 'Charged on', <select id="tc-on" className="input" value={appliesOn} onChange={(e) => setAppliesOn(e.target.value)}>
          <option value="pickup">Pickups inside</option><option value="drop">Drops inside</option>
          <option value="pickup_or_drop">Pickups or drops inside</option></select>) : null}
        {kind === 'toll_plaza' ? field('tc-radius', 'Plaza radius (metres)', <input id="tc-radius" className="input" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} />) : null}
        {kind === 'tolled_road' ? field('tc-corridor', 'Road corridor (metres either side)', <input id="tc-corridor" className="input" inputMode="numeric" value={corridor} onChange={(e) => setCorridor(e.target.value)} />) : null}
        {kind === 'waiting' ? field('tc-free', 'Free waiting minutes', <input id="tc-free" className="input" inputMode="numeric" value={free} onChange={(e) => setFree(e.target.value)} />) : null}
        {kind === 'permit' ? field('tc-remit', 'Paid to', <input id="tc-remit" className="input" value={remitTo} onChange={(e) => setRemitTo(e.target.value)} />) : null}
        {kind !== 'waiting' ? field('tc-points', 'Where', <textarea id="tc-points" className="input" rows={4} value={points} onChange={(e) => setPoints(e.target.value)} />, pointsHelp) : null}
        {draw.length && draw[0].length >= 3 ? <ZoneMap zones={[{ key: 'draft', label: name || 'This charge', rings: draw, tone: 'selected' }]}
          caption="Where this charge applies" height={260} fit={draw} /> : null}
        <div className="ops-class-rows">
          {sold.map((c) => {
            const id = `tc-${c.vehicle_type}`;
            return (
              <fieldset key={c.vehicle_type} className="ops-class-row">
                <legend>{c.name}</legend>
                <div className={values[c.vehicle_type] !== start[c.vehicle_type] ? 'ops-field is-changed' : 'ops-field'}>
                  <label className="ops-form__label" htmlFor={id}>{`Charge (${unit}${UNIT[kind] ?? ''})`}</label>
                  <input id={id} className="input" inputMode="decimal" aria-label={`${c.name}: charge (${unit}${UNIT[kind] ?? ''})`}
                    value={values[c.vehicle_type] ?? ''} onChange={(e) => setValues({ ...values, [c.vehicle_type]: e.target.value })} />
                  <span className="help">Empty: not charged for this class</span>
                </div>
              </fieldset>
            );
          })}
        </div>
        {sampleAllowed ? (
          <label className="flex items-center gap-2"><input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} />
            {' '}QA sample value (not a real figure; shown as such everywhere, refused on production)</label>
        ) : null}
        {shown ? <ChangePreview display={shown} /> : null}
        {previewError ? <div className="alert-error" role="alert">{previewError}</div> : null}
        <label className="ops-form__label" htmlFor="tc-from">Starts (local day)</label>
        <input id="tc-from" type="date" className="input" value={from || shown?.start?.effective_from || ''} onChange={(e) => setFrom(e.target.value)} />
        <p className="help m-0">The next local day by default, for new quotes.</p>
        <label className="ops-form__label" htmlFor="tc-why">Why (the approver and the history see it)</label>
        <textarea id="tc-why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}

function HistoryDrawer({ country, item, onClose }: { country: Country; item: Item; onClose: () => void }) {
  const [versions, setVersions] = useState<Item[] | null>(null);
  useEffect(() => {
    void api.get<{ results: Item[] }>(`/pricing/admin/trip-charges/history/?country=${country.country}&code=${encodeURIComponent(item.code)}`)
      .then((d) => setVersions(d.results)).catch(() => setVersions([]));
  }, [country.country, item.code]);
  const requests = country.requests.filter((r) => r.code === item.code);
  const words = (v: Item) => classesAt(country, v.scope_code).filter((c) => v.amount_words[c.vehicle_type]).map((c) => `${c.name}: ${v.amount_words[c.vehicle_type]}`).join(', ') || '—';
  return (
    <Drawer open wide title={`History · ${item.name}`} onClose={onClose}>
      <div className="grid gap-5">
        <section aria-label="Changes asked for">
          <h3 className="ops-subhead">Changes asked for</h3>
          {requests.length ? (
            <DataTable caption="Changes asked for" density="compact" maxHeight={false} wrap rows={requests} rowKey={(r) => r.id}
              columns={[
                { key: 'ref', label: 'Request', render: (r) => r.ref ?? '—' },
                { key: 'what', label: 'Change', render: (r) => `${(r.changes ?? []).map((c) => `${c.label}: ${c.from} → ${c.to}`).join('; ') || (r.op === 'retire' ? 'Remove' : '—')}${r.requested_from ? ` · from ${r.requested_from}` : ''}` },
                { key: 'who', label: 'Asked by', render: (r) => `${r.maker || '—'} · ${stamp(r.requested_at)}` },
                { key: 'why', label: 'Why', render: (r) => r.reason || '—' },
                { key: 'd', label: 'Decision', render: (r) => `${DECISION[r.status] ?? r.status}${r.checker ? ` by ${r.checker}` : ''}${r.decision_reason ? `: ${r.decision_reason}` : ''}` },
              ]} />
          ) : <p className="help m-0">No changes asked for yet.</p>}
        </section>
        <section aria-label="Versions">
          <h3 className="ops-subhead">Versions</h3>
          {versions === null ? <Skeleton kind="row" count={2} /> : (
            <DataTable caption="Versions" density="compact" maxHeight={false} wrap rows={versions} rowKey={(v) => v.id}
              columns={[
                { key: 'v', label: 'Version', render: (v) => <>{`v${v.version}`}{v.sample ? <>{' '}<StatusChip tone="caution">QA sample value</StatusChip></> : null}</> },
                { key: 'a', label: 'Charge', render: (v) => words(v) },
                { key: 'when', label: 'In force', render: (v) => `${v.effective_from}${v.effective_to ? ` to ${v.effective_to}` : ''}` },
                { key: 'who', label: 'Changed by', render: (v) => `${v.created_by || '—'}${v.created_at ? ` · ${stamp(v.created_at)}` : ''}` },
                { key: 'why', label: 'Why', render: (v) => v.reason || '—' },
              ]} />
          )}
        </section>
      </div>
    </Drawer>
  );
}
