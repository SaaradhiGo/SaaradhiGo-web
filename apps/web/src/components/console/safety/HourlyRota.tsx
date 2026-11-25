'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { interpretWrite } from '@/lib/trips';
import { Drawer } from '@/components/console/ui';
import { ChangePreview } from '@/components/console/edit/ChangePreview';
import { usePreview } from '@/components/console/edit/usePreview';

/**
 * The hourly safety rota (owner ruling, 25 Nov): who is on call in a city, hour by hour, every day of
 * the week. SOS paging calls the person on shift; an hour with nobody raises a cover alert. A change
 * shows the before/after and the hours covered, and a second person approves it.
 */
type Shift = { weekday: number; start: number; end: number; primary: number; backup: number | null };
type Staff = { id: number; name: string; has_phone: boolean };
type Rota = {
  city: { code: string; name: string };
  plan: { version: number; shifts: Shift[]; created_by: string; reason: string; created_at: string } | null;
  grid: Array<Array<{ primary: number; backup: number | null } | null>>;
  staff: Staff[];
  history: Array<{ version: number; status: string; created_by: string; reason: string; created_at: string }>;
};
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function HourlyRota({ cityCode, canEdit }: { cityCode: string; canEdit: boolean }) {
  const [rota, setRota] = useState<Rota | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setRota(await api.get<Rota>(`/safety/admin/rota/${cityCode}/`)); setError(null); } catch (e) {
      setError(e instanceof ApiError && e.fromServer ? e.message : 'The hourly rota could not be loaded.');
    }
  }, [cityCode]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <p className="alert-error" role="alert">{error}</p>;
  if (!rota) return null;
  const name = (id: number | null | undefined) => rota.staff.find((s) => s.id === id)?.name ?? (id ? 'someone no longer on the rota' : '');
  const covered = rota.grid.map((d) => d.filter(Boolean).length);
  return (
    <section className="ops-card" aria-label={`Hourly safety rota, ${rota.city.name}`}>
      <header className="ops-card__head">
        <div>
          <h2>Hourly rota · {rota.city.name}</h2>
          <p>Who an SOS phones, hour by hour (city time). An hour with nobody falls back to the on-call list below and raises a cover alert.</p>
        </div>
        {canEdit ? <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setEditing(true)}>Edit</button> : null}
      </header>
      {notice ? <div className="ops-confirm" role="status"><b>{notice}</b></div> : null}
      {rota.plan ? (
        <ul className="ops-list-plain" aria-label="Shifts">
          {rota.plan.shifts.map((s) => (
            <li key={`${s.weekday}-${s.start}`}>{FULL[s.weekday]} {String(s.start).padStart(2, '0')}:00–{String(s.end).padStart(2, '0')}:00: {name(s.primary)}{s.backup ? `, backup ${name(s.backup)}` : ''}</li>
          ))}
        </ul>
      ) : <p className="help m-0">No hourly rota yet: the on-call list below is used at every hour.</p>}
      <p className="help m-0">{DAYS.map((d, i) => `${d} ${covered[i]}/24`).join(' · ')}</p>
      {rota.history.length ? (
        <details><summary className="help">Version history</summary>
          <ul className="ops-list-plain">{rota.history.map((h) => (
            <li key={h.version} className="help">v{h.version} · {h.status === 'active' ? 'in force' : 'ended'} · {h.created_by || '—'} · {h.reason || '—'}</li>
          ))}</ul>
        </details>
      ) : null}
      {editing ? <RotaDrawer rota={rota} onClose={() => setEditing(false)}
        onDone={(t) => { setEditing(false); setNotice(t); void load(); }} /> : null}
    </section>
  );
}

function RotaDrawer({ rota, onClose, onDone }: { rota: Rota; onClose: () => void; onDone: (t: string) => void }) {
  const first = rota.staff[0]?.id ?? 0;
  const [shifts, setShifts] = useState<Shift[]>(rota.plan?.shifts ?? []);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = JSON.stringify(shifts) !== JSON.stringify(rota.plan?.shifts ?? []);
  const shown = usePreview(changed && shifts.length ? `/safety/admin/rota/${rota.city.code}/preview/` : null, { shifts });
  const set = (i: number, patch: Partial<Shift>) => setShifts((xs) => xs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const hours = Array.from({ length: 25 }, (_, h) => h);
  async function send() {
    setBusy(true); setError(null);
    try {
      const r = await api.post(`/safety/admin/rota/${rota.city.code}/`, { shifts, reason: reason.trim() });
      onDone(interpretWrite(r as never, 'Sent for approval.').message);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally { setBusy(false); }
  }
  return (
    <Drawer open wide title={`Edit hourly rota · ${rota.city.name}`} onClose={onClose}
      footer={<>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void send()}
          disabled={busy || !changed || !!shown.error || reason.trim().length < 5}>{busy ? 'Sending…' : 'Send for approval'}</button>
      </>}>
      <div className="ops-form">
        <p className="help m-0">Only staff who cover safety in this city can be on it. The rota in force stays until a second person approves.</p>
        {rota.staff.length === 0 ? <p className="alert-error" role="alert">Nobody covers safety in this city yet: assign a Safety Officer first.</p> : null}
        {shifts.map((s, i) => (
          <fieldset key={i} className="ops-row-actions" aria-label={`Shift ${i + 1}`}>
            <label className="sr-only" htmlFor={`rs-day-${i}`}>Day</label>
            <select id={`rs-day-${i}`} className="input" value={s.weekday} onChange={(e) => set(i, { weekday: Number(e.target.value) })}>
              {FULL.map((d, k) => <option key={d} value={k}>{d}</option>)}
            </select>
            <label className="sr-only" htmlFor={`rs-from-${i}`}>From</label>
            <select id={`rs-from-${i}`} className="input" value={s.start} onChange={(e) => set(i, { start: Number(e.target.value) })}>
              {hours.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
            <label className="sr-only" htmlFor={`rs-to-${i}`}>Until</label>
            <select id={`rs-to-${i}`} className="input" value={s.end} onChange={(e) => set(i, { end: Number(e.target.value) })}>
              {hours.slice(1).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
            <label className="sr-only" htmlFor={`rs-p-${i}`}>On call</label>
            <select id={`rs-p-${i}`} className="input" value={s.primary} onChange={(e) => set(i, { primary: Number(e.target.value) })}>
              {rota.staff.map((p) => <option key={p.id} value={p.id}>{p.name}{p.has_phone ? '' : ' (no phone on the account)'}</option>)}
            </select>
            <label className="sr-only" htmlFor={`rs-b-${i}`}>Backup</label>
            <select id={`rs-b-${i}`} className="input" value={s.backup ?? ''} onChange={(e) => set(i, { backup: e.target.value ? Number(e.target.value) : null })}>
              <option value="">No backup</option>
              {rota.staff.filter((p) => p.id !== s.primary).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" className="ops-linkbtn" onClick={() => setShifts((xs) => xs.filter((_, j) => j !== i))}>Remove</button>
          </fieldset>
        ))}
        {rota.staff.length ? (
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
            onClick={() => setShifts((xs) => [...xs, { weekday: 0, start: 9, end: 17, primary: first, backup: null }])}>Add a shift</button>
        ) : null}
        {shown.display ? <ChangePreview display={shown.display} /> : shown.error ? <div className="alert-error" role="alert">{shown.error}</div> : null}
        <label className="ops-form__label" htmlFor="rs-why">Why (the approver and the history see it)</label>
        <textarea id="rs-why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}
